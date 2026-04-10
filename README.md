# INOVUES Estimator

Streamlit app for SWR/IGR project cost estimation — window takeoff (TKO), material calculation, Odoo inventory check, and PO generation.

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | TKO input form (window types, dimensions, specs) | ✅ Done |
| 2 | Material demand calculation (EST-1 logic) | 🔲 Planned |
| 3 | Odoo inventory check (on-hand vs. needed) | 🔲 Planned |
| 4 | Draft PO generation in Odoo per supplier | 🔲 Planned |

## Environment Variables (Railway)

| Variable | Value |
|----------|-------|
| `ODOO_URL` | `https://inovues.odoo.com` |
| `ODOO_DB` | `inovues` |
| `ODOO_USER` | `sketterer@inovues.com` |
| `ODOO_API_KEY` | *(your Odoo API key)* |

## Local Development

```bash
pip install -r requirements.txt
streamlit run app.py
```
