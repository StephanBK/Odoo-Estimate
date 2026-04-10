from fastapi import FastAPI, Query
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


# ── Serve static HTML — must be last ─────────────────────────────────────────
app.mount("/", StaticFiles(directory=".", html=True), name="static")
