# HANDOVER — Odoo Estimator (May 15, 2026)

Last session: Chunks 1, 2, 3 of 5 complete. Chunks 4–5 remaining.

## What this project is

The "Odoo Estimator" lives at **StephanBK/Odoo-Estimate** on GitHub and is
deployed on Railway at https://odoo-estimate-production.up.railway.app/. It's
embedded into `inovues.odoo.com` as a menu tile (module `inovues_estimator`,
v19.0.1.0, installed). The Odoo module is a thin wrapper — clicking the
tile opens the Railway app in a new browser tab (changed from `target=self`
to `target=new` at the start of this session).

The app's job: window takeoff (TKO) entry → cost estimation → material
demand calc → Odoo inventory lookup → eventually draft PO generation in
Odoo. The Excel spreadsheet `EST-1` tab in
`INOVUES_IGR___SWR_Cost_Estimate_template_v8_4_Arcadia-ECM.xlsx` is the
canonical source for cost-calc business logic — the app is migrating EST-1
into a maintainable codebase.

## Architecture (post-Chunk-3)

| File | Purpose |
|---|---|
| `index.html` | Single-page UI: DOM, event handlers, layout, styling, Odoo API calls |
| `calc.js` | Pure math module (UMD: works in browser as `window.CALC` and in Node via `require`) |
| `material_rules.json` | Declarative rule table mapping Odoo product codes/patterns to qty formulas |
| `api.py` | FastAPI backend bridging the UI to Odoo XML-RPC |
| `tests/test_calc.js` | 39 unit tests covering all calc logic, runs under `node --test` |
| `TKO_Template.xlsx` | Downloadable template for bulk TKO import (untouched this session) |
| `Procfile` | `web: uvicorn api:app --host 0.0.0.0 --port $PORT` |

**Critical pattern:** all math lives in `calc.js` as pure functions (no DOM,
no globals, no side effects). `index.html` has thin DOM-glue wrappers that
read inputs, call `CALC.*`, and write outputs. That's what makes the math
unit-testable.

## What was done this session

### Chunk 0 — Odoo menu fix (done, live)
Changed `ir.actions.act_url` id 982 from `target=self` to `target=new` via
XML-RPC so clicking the INOVUES Estimator tile in Odoo opens the Railway
app in a NEW tab instead of replacing Odoo.

### Chunk 1 — Test harness + calc.js extraction (done, live)
- Pulled all 8 pure-math functions out of `index.html` into `calc.js`
  (`getTotals`, `calcFab`, `calcInst`, `calcShip`, `calcEquip`, `calcTravel`,
  `calcOther`, `estimateQty`).
- Added 22 unit tests in `tests/test_calc.js` covering every function +
  edge cases.
- Deleted dead Streamlit code (`app.py`, `materials.py`) that was never
  deployed (not in Procfile, not in requirements).
- Updated README to reflect current architecture.
- Net: -36 lines from index.html; +405 lines of new code/tests.
- Commit history on GitHub is split into multiple commits because Stephan
  uploaded via the web UI (we hadn't set up local git yet).

### Chunk 2 — Project Mode toggle + LTL shipping (done, live)
- New "Project Mode" card at top of Costs page: radio buttons for
  Full Project (default) and Mockup.
- Selecting Mockup: shipping mode auto-switches to LTL, Visual/Performance
  Mockup line in Other Charges auto-enables.
- Shipping card restructured: Mode dropdown (FTL/LTL) controls which input
  group is visible. LTL uses a single user-entered price field; margin
  still applies in both modes.
- `calc.js` `calcShip()` now accepts `{mode, ltlPrice, ...}`. Mode='ltl'
  returns `ltlPrice × (1+margin)`. Mode='ftl' or omitted preserves the
  rack+truck calc (back-compat).
- 4 new tests for LTL math; total 26 passing.

### Chunk 3 — Rule-table architecture for smart material qty defaults (done, live)
- New `material_rules.json` declaratively maps Odoo product codes / name
  patterns to qty formulas. Edit JSON to add/change rules — no code change.
- Match priority: (1) exact `default_code`, (2) first `name_pattern` regex,
  (3) fallback to legacy heuristic. Unmatched products preserve previous
  behavior (zero regression).
- Formulas evaluated by a sandboxed `new Function(...)` that only sees
  totals keys — no access to window, document, globals.
- `getTotals` gained mount-aware aggregations: `perimOverlap`, `perimInset`,
  `headFtInset`, `headFtOverlap`.
- 11 initial rules: 6 setting block codes (Orazen Black/Gray + stackable,
  generic EPDM, NP430), 4 foam variants (overlap/head-retainer/inset/
  generic-fallback), 1 glazing tape (GT106 → inset-mount headFt).
- UI badge under Calc Qty shows which rule fired (green) or `fallback`
  (gray).
- 13 new tests; total 39 passing.

## Local dev setup (configured this session)

Stephan's Mac is now set up to push to GitHub directly. Setup at
`~/Documents/GitHub/Odoo-Estimate/`. macOS Keychain has the PAT cached so
no re-auth needed.

**Workflow per chunk:**
```bash
cd ~/Documents/GitHub/Odoo-Estimate
git pull
git am ~/Downloads/chunkN.patch
git push
```

**Running tests locally:**
```bash
node --test tests/test_calc.js
```

## Open items / where to pick up

### Verification still pending for Chunk 3
Stephan pushed Chunk 3 but paused before verifying on the live site.
**First thing next session:** confirm the rule badges show up correctly
on the deployed app. Steps:
1. Open https://odoo-estimate-production.up.railway.app/ + hard refresh.
2. TKO tab: add a row with width 36, height 60, qty 5, Mount=Inset-mount,
   Head Ret checked.
3. Costs tab → Materials → search "foam" → add `Foam 48PPI 0.5"x0.5"x9'`.
4. Verify Calc Qty cell shows a green `▸ foam-inset-mount` badge.
5. Add a setting block (e.g. code `4140-01-01`) → expect
   `▸ setblock-orazen-black` badge.
6. Add `GT106` butyl tape → expect `▸ glazing-tape-inset-head-retainer`.
7. Add an unmatched random product → expect gray `▸ fallback` badge.

### Chunk 4 — Bulletproof pass (planned, ~15 min)
Defensive hardening pass. Run all tests, then add edge-case tests for:
- Zero panels (already covered for most calcs, but verify rule engine)
- Odoo `/api/products/search` offline / 500 error → graceful degradation
- Material rows where Odoo returns missing `default_code` or `name`
- Malformed `material_rules.json` (current code has try/catch but no test)
- Input validation tightening on TKO rows (negative numbers, NaN, etc.)
No new features. Goal: app doesn't crash under any realistic bad input.

### Chunk 5 — This file is it
You're reading the commemorative handover. Was originally planned as the
final chunk; got pulled forward when Stephan paused. If Chunk 4 happens
later, this file gets updated and re-committed.

### Future chunks (not yet planned but mentioned)
- **Weight calculation** for shipping (Stephan said he'd insert this
  later — needs a per-product weight in Odoo or a config table).
- **Phase 4** from the README: draft PO generation per supplier in Odoo.
  Currently the README has it as "Planned"; Phase 3 (inventory check) is
  marked done.
- **More foam SKUs** — when Stephan adds the 1/4×1/2 and 1×1/2 foam
  products to Odoo, the rule table needs new entries (one rule per code).
  See "How to add a new rule" section in the Chunk 3 commit message.

## Conventions & gotchas

- **GitHub PATs:** my sandbox IP (`34.121.238.53`, shared Google Cloud) is
  rate-limited / blocked by GitHub for write operations. Stephan was
  forced to push from his local Mac. PATs from chat can't reach GitHub
  directly from the sandbox. The local push setup at `~/Documents/GitHub/`
  bypasses this. Five PATs were generated and pasted in chat this
  session — **all need to be revoked** at
  https://github.com/settings/tokens.
- **Odoo API key:** `45ad72d4c24f0966971b4228e0b786752964b422` — stored in
  Stephan's memory, used by `api.py` via env var on Railway.
- **Field naming:** index.html uses camelCase (`width`, `headRet`, `jambSp`,
  `mount`). `calc.js` aligns to this convention. Tests use the same names.
- **Test harness uses Node's built-in test runner** (`node --test`). No
  install, no `npm`, no config. Just JavaScript files.
- **Material rules file location:** `material_rules.json` at repo root,
  fetched at page load by `index.html` via `fetch('material_rules.json')`.
  If fetch fails (404 or parse error), the app silently falls back to the
  legacy heuristic — a deliberate safety net.
- **Project mode toggle** does NOT persist across reloads (no
  localStorage). Each page load defaults to Full Project. If we want
  persistence later, that's a 2-line change.
- **The `inovues_estimator` Odoo module is a thin wrapper**, not a native
  Odoo addon — it's just a menu entry + URL action + icon. No Odoo
  models/forms/Python logic inside. The real app is the Railway-hosted
  HTML/JS/FastAPI.

## File locations (last verified)

- GitHub: https://github.com/StephanBK/Odoo-Estimate
- Railway deployment: https://odoo-estimate-production.up.railway.app/
- Odoo instance: https://inovues.odoo.com (DB: `inovues`, v19.0+e)
- Local working copy: `~/Documents/GitHub/Odoo-Estimate/` on Stephan's
  MacBook Pro
- Source spreadsheet: `INOVUES_IGR___SWR_Cost_Estimate_template_v8_4_Arcadia-ECM.xlsx`
  (Stephan has the live copy; the EST-1 tab is the canonical cost-calc
  source)

## Test counts (final state for this session)

- Chunk 1: 22 tests
- Chunk 2: +4 → 26 tests
- Chunk 3: +13 → 39 tests
- All 39 passing locally and in CI (well, Stephan's local — no CI
  configured yet; potential future improvement)

## Commits on GitHub main (newest first, post-session)

- `f755937` Chunk 3: rule-table architecture for smart material qty defaults
- `34b2b10` Chunk 2: Project Mode toggle + LTL shipping option
- `ffe245b` Test: verify local push workflow (empty newline append to README)
- `4fca4c0` Delete materials.py
- `7c1e0ae` Delete app.py
- `e310ffe` Create test_calc.js (Chunk 1 part 1)
- `2a6f7d5` Add files via upload (Chunk 1 part 2 — calc.js, index.html, README.md)
- `fe38c7d` Remove Reviewed By field from project info section (pre-session)

## Resume command

When picking up next session, paste this file or reference it. First
question to confirm: "Has Chunk 3 been verified on the live site?" If yes
→ start Chunk 4. If no → run the verification steps above first.
