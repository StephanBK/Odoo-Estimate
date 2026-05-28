# HANDOVER — Estimator Phase 4: PO Generation + MOQ Backfill (May 28, 2026)

Session goal: build the "Additional Required Material List" (inventory delta)
and let the user create draft POs per vendor from it — plus the data backfill
that made it possible. All shipped as patches `0004` (code) and `0005` (this
file). Deploy = apply patches on the Mac, `git push`, Railway auto-builds.

## TL;DR — what now exists

1. **Odoo supplierinfo backfilled** from the materials-master CSV: 106 product
   templates now have preferred vendor + MOQ + purchase price (was 1 before).
2. **Estimator Phase 4 built**: each material row is enriched with vendor/MOQ;
   a new "Required Materials — Draft Purchase Orders" panel lists shortfall
   lines grouped by vendor with MOQ-rounded order quantities and checkboxes;
   one click creates one **draft** `purchase.order` per vendor in Odoo.
3. Verified end-to-end against live Odoo 19 (test draft **P00024**, Orazen).

## Part A — the MOQ / vendor backfill (prerequisite)

The estimator needed MOQ + vendor + price per product. Odoo had this on only
1 of 154 products. Source data came from Stephan's materials CSV
(`materials_202603250451.csv`, 148 rows).

**Where MOQ lives in Odoo:** `product.supplierinfo.min_qty` (labelled
"Quantity"). The same record holds the vendor (`partner_id`), purchase price
(`price`), vendor SKU (`product_code`), and lead time (`delay`). There is NO
MOQ field on the product itself — the product-level "min" fields are
reordering rules, unrelated to purchasing.

**Field mapping used (CSV → supplierinfo):**
- `moq`        → `min_qty`   (blank defaulted to 1)
- `cost`       → `price`     (loaded as-is, per Stephan's call — no yield conversion)
- `sku`        → `product_code`
- `max_lead`   → `delay`
- `supplier`   → `partner_id` (resolved via fuzzy match — see below)

**Product matching:** CSV row → Odoo product by `default_code` (SKU) first,
then exact normalized name. All 148 rows matched.

**Vendor matching (the fiddly part):** CSV supplier names are messy
("CRL" vs "CR Laurence", "Home Dpeot" typo, "bluestar", case/suffix variants).
Matched by normalized fuzzy similarity against ALL company contacts
(`is_company=true`), NOT just `supplier_rank>0` — several real vendors
(Tremco, Vicone, CRL) sit at rank 0 and were missed by the narrow filter.
**No new vendors were created** (Stephan's instruction); everything resolved
to existing contacts. Manual overrides hard-coded for cases fuzzy matching
can't get: `CRL`→#45, `CR Laurence`→#45, `Home Dpeot`→#48 (Home Depot).

**Result:** 141 rows staged → 106 distinct (product,vendor) records created
(34 were intra-CSV duplicates of the same product+vendor; 1 was a NaN-MOQ row
fixed manually to MOQ 1). 7 CSV rows skipped — all glass/tape with no supplier
listed (glass is project-sourced).

**Import scripts (in chat history, not committed):** the staged plan was saved
to `supplierinfo_plan.csv` and reviewed before writing. Re-runnable safely:
the live import re-checks (product,vendor) existence and skips dupes.

## Part B — the code (patch 0004)

### Backend — `api.py`
Two new endpoints (both tested live):

`GET /api/products/supplierinfo?ids=<csv of product.product ids>`
→ `{ "<pid>": {vendor, vendorId, moq, price, sku, leadDays} | null }`
supplierinfo is template-keyed, so the endpoint maps product→template, pulls
records ordered by `sequence` (preferred vendor first), takes the first per
template. `null` when a product has no vendor record.

`POST /api/po/create`
Body: `{ origin, vendors:[{vendorId, vendor, lines:[{productId, qty, price, name}]}] }`
→ creates one **draft** `purchase.order` per vendor (state stays `draft`;
nothing confirmed/sent). Skips vendor groups with no vendorId. Per-vendor
error capture so one bad group can't abort the rest.
Returns `{ created:[{vendor, poId, poName, lines}|{error}], skipped:[] }`.

### Frontend — `index.html`
- `enrichVendors()` — batched supplierinfo fetch; attaches vendor/MOQ/price to
  matRows; idempotent (rows flagged `vendorFetched`). Called on add, preset
  sync, recalc.
- `orderQtyFor(m)` — **MOQ rule 3a**: order the shortfall (`needed - onHand`),
  but never below MOQ. Returns 0 when nothing's short.
- `renderRequiredMaterials()` — the new panel (`#reqMatPanel`, a card right
  below the Materials card). Only shortfall lines, grouped by vendor,
  per-line checkbox (`m.selected`), MOQ-rounded order qty with a "(MOQ n)"
  note when rounded up, per-vendor subtotal, grand total, and the
  "Create Draft PO(s) in Odoo" button. No-vendor products show in a red
  "⚠ Needs vendor" group and are excluded from POs.
- `createDraftPOs()` — groups selected vendor-assigned lines, builds origin
  from `projectName` + `customer`, `confirm()` guard, POSTs to
  `/api/po/create`, renders results in `#poResult`.

Hooked into existing `renderMaterials()` (calls `renderRequiredMaterials()` at
the end; hides the panel when no materials).

## Deploy steps

```bash
cd ~/Documents/GitHub/Odoo-Estimate
git pull
git am ~/Downloads/0004-Phase-4-*.patch
git am ~/Downloads/0005-*.patch        # this handoff file
git push                                # Railway auto-builds
```

## Live verification checklist

1. Hard-refresh the Railway app.
2. TKO tab: add a row (36×60, qty 5) so geometry totals exist.
3. Materials: add an Orazen gasket + a Team Pride profile.
4. Confirm the "Required Materials — Draft Purchase Orders" panel appears,
   grouped by vendor.
5. Confirm Order Qty rounds up to MOQ where shortfall < MOQ (shows "(MOQ n)").
6. Untick a line → totals update. Click Create Draft PO(s) → confirm → it
   reports new PO number(s), visible as drafts in Odoo Purchases.

## Open items / next

- **Delete test PO `P00024`** (Orazen, ~$4,558) — live-test artifact.
- **~48 products still have no vendor/MOQ** (glass, tape, products not in the
  CSV). They show as "⚠ Needs vendor" and can't be PO'd until a vendor is set
  in Odoo. Backfill these in Odoo as needed.
- **Duplicate Odoo contacts** exist (two "Tremco", "Vicone"/"Vicone Rubber",
  multiple CRL variants). The import picked canonical records but did NOT
  merge/delete dupes — a separate Odoo data-hygiene task for Stephan.
- **PO docx attachment**: PO-Generator (separate Streamlit app) attaches a
  Word PO + chatter note to each PO. This estimator endpoint does NOT yet —
  it creates the bare draft. If wanted, port that from PO-Generator's
  `create_odoo_po()`.
- **Vendor price vs standard_price**: the panel uses supplierinfo `price` when
  available, else product `standard_price`. Fine for now.
- (Carried from prior handover) Weight calc for shipping still pending;
  more foam SKUs to add to the rule table as Odoo gets them.

## Gotchas learned this session

- **Cannot `git push` from the Claude sandbox** — IP blocked for git writes.
  Workflow is patch files (`git format-patch` here → `git am` on the Mac).
- **Odoo 19 schema:** `product.product` has no `uom_po_id` field (use
  `uom_id`). PO totals include auto-applied tax (`amount_total`); untaxed is
  `amount_untaxed`.
- **XML-RPC domains** must be wrapped one level: `search_read` args =
  `[ domain ]`, e.g. `[[["supplier_rank",">",0]]]`. A bare condition throws
  "invalid item in domain".
- **NaN is truthy in JS/Python `or`**: `float('') -> nan`, and `nan or 1`
  returns `nan`, not 1. Guard blank numerics explicitly.

## SECURITY NOTE (please action)

The Odoo API key is committed in plaintext in the OLDER handover file
(`HANDOVER_Odoo_Estimator.md`) in this **public** repo. Recommend rotating
that key in Odoo and removing it from the committed file / git history. This
new handover deliberately omits the key (it lives in Railway env vars +
Stephan's password manager).

## File locations

- GitHub: https://github.com/StephanBK/Odoo-Estimate
- Railway: https://odoo-estimate-production.up.railway.app/
- Odoo: https://inovues.odoo.com (DB `inovues`, v19.0+e)
- PO-Generator (separate app, source of the create-PO pattern):
  https://github.com/StephanBK/PO-Generator
