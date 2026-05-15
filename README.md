# INOVUES Estimator

Project cost estimator for SWR/IGR window retrofits — window takeoff (TKO),
live Odoo material lookup, cost calculation, and Excel export. Deployed on
Railway, embedded in `inovues.odoo.com` as a menu tile (module
`inovues_estimator`).

## Architecture

| File                 | Purpose                                                       |
|----------------------|---------------------------------------------------------------|
| `index.html`         | Single-page UI. All DOM, event handlers, layout, styling.     |
| `calc.js`            | Pure math (no DOM, no globals). Unit-testable.                |
| `api.py`             | FastAPI backend. Serves `index.html` and bridges to Odoo via XML-RPC. |
| `tests/test_calc.js` | Test suite for `calc.js`. Runs under `node --test`.           |
| `TKO_Template.xlsx`  | Downloadable template for bulk TKO import.                    |

The browser loads `calc.js` as a global (`window.CALC`); Node loads it via
`require()`. Same file, two consumers — that's how the math stays in one
place and is still testable headlessly.

## Phases

| Phase | Description                                              | Status |
|-------|----------------------------------------------------------|--------|
| 1     | TKO input form (window types, dimensions, specs)         | ✅ Done |
| 2     | Material demand calculation (EST-1 logic)                | ✅ Done |
| 3     | Odoo inventory check (on-hand vs. needed)                | ✅ Done |
| 4     | Draft PO generation in Odoo per supplier                 | 🔲 Planned |

## Running locally

```bash
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
# open http://localhost:8000
```

## Running tests

No install required — uses Node's built-in test runner.

```bash
node --test tests/test_calc.js
```

Tests cover all math in `calc.js`: geometry aggregation, fabrication,
installation (hourly + lump-sum), shipping, equipment, travel, other
charges, and per-material qty estimation. Add new tests when changing
or adding formulas.

## Environment variables (Railway)

| Variable        | Value                          |
|-----------------|--------------------------------|
| `ODOO_URL`      | `https://inovues.odoo.com`     |
| `ODOO_DB`       | `inovues`                      |
| `ODOO_USER`     | `sketterer@inovues.com`        |
| `ODOO_API_KEY`  | *(your Odoo API key)*          |

