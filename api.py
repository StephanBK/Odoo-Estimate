from fastapi import FastAPI, Query, Body
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import xmlrpc.client
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Odoo config ───────────────────────────────────────────────────────────────
# Read env vars — hardcode fallbacks so Railway placeholder strings never reach Odoo
_url  = os.environ.get("ODOO_URL",     "")
_db   = os.environ.get("ODOO_DB",      "")
_user = os.environ.get("ODOO_USER",    "")
_key  = os.environ.get("ODOO_API_KEY", "")

ODOO_URL     = _url  if _url  and _url  != "ODOO_URL"     else "https://inovues.odoo.com"
ODOO_DB      = _db   if _db   and _db   != "ODOO_DB"      else "inovues"
ODOO_USER    = _user if _user and _user != "ODOO_USER"     else "sketterer@inovues.com"
ODOO_API_KEY = _key  if _key  and _key  != "ODOO_API_KEY"  else ""


def get_odoo():
    common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
    uid    = common.authenticate(ODOO_DB, ODOO_USER, ODOO_API_KEY, {})
    models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")
    return uid, models


def odoo_call(model, method, args, kwargs={}):
    uid, models = get_odoo()
    return models.execute_kw(ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "db": ODOO_DB, "user": ODOO_USER}


# ── Product search ────────────────────────────────────────────────────────────
@app.get("/api/products/search")
def search_products(q: str = Query("", min_length=0)):
    domain = [["type", "in", ["product", "consu"]]]
    if q.strip():
        domain.append("|")
        domain.append(["name", "ilike", q])
        domain.append(["default_code", "ilike", q])

    products = odoo_call("product.product", "search_read",
        [domain],
        {
            "fields": ["name", "default_code", "qty_available",
                       "uom_id", "categ_id", "standard_price"],
            "limit": 30,
            "order": "name asc"
        }
    )

    return [
        {
            "id":       p["id"],
            "name":     p["name"],
            "ref":      p.get("default_code") or "",
            "onHand":   p.get("qty_available", 0),
            "uom":      p["uom_id"][1] if p.get("uom_id") else "",
            "category": p["categ_id"][1] if p.get("categ_id") else "",
            "cost":     p.get("standard_price", 0),
        }
        for p in products
    ]


# ── Bulk fetch by default_code list ───────────────────────────────────────────
# Used by the preset feature to pull all 21 preset products in one round-trip
# on app startup, instead of 21 separate /api/products/search calls.
@app.get("/api/products/by_codes")
def products_by_codes(codes: str = Query("")):
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    if not code_list:
        return []

    products = odoo_call("product.product", "search_read",
        [[["default_code", "in", code_list]]],
        {
            "fields": ["name", "default_code", "qty_available",
                       "uom_id", "categ_id", "standard_price"],
            "limit": len(code_list) * 2,  # in case of duplicates
        }
    )
    return [
        {
            "id":       p["id"],
            "name":     p["name"],
            "ref":      p.get("default_code") or "",
            "onHand":   p.get("qty_available", 0),
            "uom":      p["uom_id"][1] if p.get("uom_id") else "",
            "category": p["categ_id"][1] if p.get("categ_id") else "",
            "cost":     p.get("standard_price", 0),
        }
        for p in products
    ]


# ── Stock check ───────────────────────────────────────────────────────────────
@app.get("/api/products/{product_id}/stock")
def get_stock(product_id: int):
    products = odoo_call("product.product", "search_read",
        [[["id", "=", product_id]]],
        {"fields": ["name", "qty_available", "virtual_available"], "limit": 1}
    )
    if not products:
        return {"onHand": 0, "forecasted": 0}
    p = products[0]
    return {"onHand": p.get("qty_available", 0), "forecasted": p.get("virtual_available", 0)}


# ── Supplier info: vendor + MOQ + price per product ───────────────────────────
# Reads product.supplierinfo (the materials-master data) and returns the
# PREFERRED vendor's MOQ / price / SKU / lead time for each requested product.
# supplierinfo is keyed on the product TEMPLATE, so we map product.product ->
# template first. Records are ordered by Odoo's `sequence` (preferred vendor
# first); the first record we see per template wins. Returns null for any
# product that has no vendor record yet (UI shows "needs vendor", MOQ=1).
# Input: comma-separated product.product IDs. Output: { "<product_id>": {...}|null }.
@app.get("/api/products/supplierinfo")
def products_supplierinfo(ids: str = Query("")):
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    if not id_list:
        return {}

    prods = odoo_call("product.product", "read",
        [id_list], {"fields": ["product_tmpl_id"]})
    tmpl_of = {p["id"]: (p["product_tmpl_id"][0] if p.get("product_tmpl_id") else None)
               for p in prods}
    tmpl_ids = list({t for t in tmpl_of.values() if t})
    if not tmpl_ids:
        return {str(pid): None for pid in id_list}

    si = odoo_call("product.supplierinfo", "search_read",
        [[["product_tmpl_id", "in", tmpl_ids]]],
        {"fields": ["product_tmpl_id", "partner_id", "min_qty", "price",
                    "sequence", "delay", "product_code"],
         "order": "sequence asc, id asc"})

    best = {}
    for r in si:
        t = r["product_tmpl_id"][0] if r.get("product_tmpl_id") else None
        if t is None or t in best:
            continue  # first (preferred) record per template wins
        best[t] = {
            "vendor":   r["partner_id"][1] if r.get("partner_id") else "",
            "vendorId": r["partner_id"][0] if r.get("partner_id") else None,
            "moq":      r.get("min_qty") or 1,
            "price":    r.get("price") or 0,
            "sku":      r.get("product_code") or "",
            "leadDays": r.get("delay") or 0,
        }

    return {str(pid): best.get(tmpl_of.get(pid)) for pid in id_list}


# ── Create draft Purchase Orders, one per vendor ──────────────────────────────
# Phase 4. Body shape:
#   { "origin": "PROJ-123 / Acme Tower",
#     "vendors": [ { "vendorId": 64, "vendor": "Team Pride",
#                    "lines": [ {"productId": 743, "qty": 129,
#                                "price": 19.43, "name": "..."} ] } ] }
# Creates a DRAFT purchase.order per vendor (state stays 'draft' — nothing is
# confirmed or sent). Returns the created PO ids/names so the UI can link them.
# Skips any vendor group with no vendorId (products lacking a vendor in Odoo).
@app.post("/api/po/create")
def create_pos(payload: dict = Body(...)):
    uid, models = get_odoo()
    def oc(model, method, args, kwargs={}):
        return models.execute_kw(ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs)

    origin = (payload.get("origin") or "INOVUES Estimator").strip()
    results, skipped = [], []
    for v in payload.get("vendors", []):
        vid = v.get("vendorId")
        lines = v.get("lines", []) or []
        if not vid or not lines:
            skipped.append(v.get("vendor") or "(no vendor)")
            continue
        order_lines = []
        for ln in lines:
            qty = float(ln.get("qty", 0) or 0)
            if qty <= 0:
                continue
            order_lines.append((0, 0, {
                "product_id":  int(ln["productId"]),
                "product_qty": qty,
                "price_unit":  float(ln.get("price", 0) or 0),
                "name":        ln.get("name", "") or "",
            }))
        if not order_lines:
            skipped.append(v.get("vendor") or "(no lines)")
            continue
        try:
            po_id = oc("purchase.order", "create",
                       [{"partner_id": int(vid), "origin": origin, "order_line": order_lines}])
            data = oc("purchase.order", "read", [po_id], {"fields": ["name"]})
            results.append({"vendorId": vid, "vendor": v.get("vendor", ""),
                            "poId": po_id,
                            "poName": data[0]["name"] if data else f"ID {po_id}",
                            "lines": len(order_lines)})
        except Exception as e:
            results.append({"vendorId": vid, "vendor": v.get("vendor", ""),
                            "error": str(e)[:200]})
    return {"created": results, "skipped": skipped}


# ── Serve static HTML — must be last ─────────────────────────────────────────
app.mount("/", StaticFiles(directory=".", html=True), name="static")
