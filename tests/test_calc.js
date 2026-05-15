/**
 * INOVUES Estimator — calc.js test suite
 * Runner: `node --test tests/test_calc.js`
 *
 * Every expected value is hand-computed from the source formula and
 * commented. If a test fails, the comment tells you what was expected
 * and why, so you can decide whether the math regressed or the test
 * needs to evolve with intentional changes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const CALC = require('../calc.js');

// Helper: round to 4 decimal places for floating-point comparison
const r = (n) => Math.round(n * 10000) / 10000;

// ── getTotals ───────────────────────────────────────────────────────────
test('getTotals: empty input returns zeros', () => {
  const t = CALC.getTotals([]);
  assert.equal(t.panels, 0);
  assert.equal(t.area, 0);
  assert.equal(t.perim, 0);
});

test('getTotals: single 36"x60" SWR panel, qty 1, head+sill+jamb checked', () => {
  // 36" × 60" = 3 ft × 5 ft = 15 ft². Perim = 2×(3+5) = 16 ft. perimH=6, perimV=10.
  // headRet=true → headFt = 3×1 = 3. sillRet=true → sillFt = 3.
  // jambFt = 2×5×1 = 10. corners = 4×1 = 4. setblks = ceil(2.3) = 3.
  // dlJambs = 2×1×3 = 6. jambSp=false → spJambs = 0.
  const t = CALC.getTotals([{
    width: 36, height: 60, qty: 1,
    headRet: true, sillRet: true, jambSp: false
  }]);
  assert.equal(t.panels, 1);
  assert.equal(t.area, 15);
  assert.equal(t.perim, 16);
  assert.equal(t.perimH, 6);
  assert.equal(t.perimV, 10);
  assert.equal(t.headFt, 3);
  assert.equal(t.sillFt, 3);
  assert.equal(t.jambFt, 10);
  assert.equal(t.corners, 4);
  assert.equal(t.setblks, 3);
  assert.equal(t.dlJambs, 6);
  assert.equal(t.spJambs, 0);
});

test('getTotals: invalid rows (zero qty, missing dims) are skipped', () => {
  const t = CALC.getTotals([
    { width: 36, height: 60, qty: 0, headRet: true },         // zero qty
    { width: 0,  height: 60, qty: 1, headRet: true },         // zero width
    { width: 36, height: 0,  qty: 1, headRet: true },         // zero height
    { width: 36, height: 60, qty: 2, headRet: true, sillRet: true } // valid
  ]);
  assert.equal(t.panels, 2);                  // only the last row counted
  assert.equal(t.area, 30);                   // 3×5×2
});

test('getTotals: jambSp toggle drives spJambs', () => {
  const t = CALC.getTotals([{
    width: 36, height: 60, qty: 5, jambSp: true
  }]);
  assert.equal(t.spJambs, 2 * 5 * 3);         // 2 jambs × 5 panels × 3 locs
});

// ── calcFab ─────────────────────────────────────────────────────────────
test('calcFab: zero panels → 0', () => {
  assert.equal(CALC.calcFab({
    rate: 100, lump: 5, hrCut: 0.17, hrAsm: 0.5, hrCln: 0.33,
    margin: 0.1, panels: 0, area: 0
  }), 0);
});

test('calcFab: hand-computed example', () => {
  // base = lump×area + (hrCut+hrAsm+hrCln)×rate×panels
  //      = 5×15 + (0.17+0.5+0.33)×100×1
  //      = 75 + 100 = 175
  // margin 10% → 175 × 1.1 = 192.5
  const out = CALC.calcFab({
    rate: 100, lump: 5, hrCut: 0.17, hrAsm: 0.5, hrCln: 0.33,
    margin: 0.1, panels: 1, area: 15
  });
  assert.equal(r(out), 192.5);
});

// ── calcInst ────────────────────────────────────────────────────────────
test('calcInst: off → 0', () => {
  assert.equal(CALC.calcInst({ on: false, panels: 100 }), 0);
});

test('calcInst: no panels → 0', () => {
  assert.equal(CALC.calcInst({ on: true, panels: 0 }), 0);
});

test('calcInst: hourly mode with takeoff', () => {
  // base = rate×hrUnit×panels + pmHrs×pmRate + takeoff
  //      = 100×2×10  + 40×85 + 750
  //      = 2000 + 3400 + 750 = 6150
  // margin 5% → 6457.5
  const out = CALC.calcInst({
    on: true, useLump: false, rate: 100, hrUnit: 2, pmHrs: 40, pmRate: 85,
    takeoffOn: true, takeoffAmt: 750, margin: 0.05, panels: 10
  });
  assert.equal(r(out), 6457.5);
});

test('calcInst: lump-sum mode ignores hourly inputs', () => {
  // useLump=true → base = lumpAmt = 50000, regardless of rate/hrUnit
  // margin 10% → 55000
  const out = CALC.calcInst({
    on: true, useLump: true, lumpAmt: 50000,
    rate: 999, hrUnit: 999, pmHrs: 999, pmRate: 999,
    takeoffOn: true, takeoffAmt: 999,
    margin: 0.1, panels: 1
  });
  assert.equal(r(out), 55000);
});

// ── calcShip ────────────────────────────────────────────────────────────
test('calcShip: zero panels → 0', () => {
  assert.equal(CALC.calcShip({ panels: 0, rackCost: 250, panelsPerRack: 30,
                               freight: 3000, racksPerTruck: 14, margin: 0.1 }), 0);
});

test('calcShip: 50 panels, 30/rack, 14 racks/truck', () => {
  // racks  = ceil(50/30)  = 2
  // trucks = ceil(2/14)   = 1
  // base   = 2×250 + 1×3000 = 500 + 3000 = 3500
  // margin 10% → 3850
  const out = CALC.calcShip({
    panels: 50, rackCost: 250, panelsPerRack: 30,
    freight: 3000, racksPerTruck: 14, margin: 0.1
  });
  assert.equal(r(out), 3850);
});

test('calcShip: edge case — exact multiples', () => {
  // 60 panels, 30/rack → 2 racks (exact). 2 racks, 2/truck → 1 truck (exact).
  // base = 2×250 + 1×3000 = 3500. margin 0 → 3500.
  const out = CALC.calcShip({
    panels: 60, rackCost: 250, panelsPerRack: 30,
    freight: 3000, racksPerTruck: 2, margin: 0
  });
  assert.equal(out, 3500);
});

// ── calcShip LTL mode (Chunk 2) ─────────────────────────────────────────
test('calcShip LTL: flat price + margin', () => {
  // mode=ltl, ltlPrice=500, margin 10% → 550. FTL fields ignored.
  const out = CALC.calcShip({
    mode: 'ltl', panels: 4, ltlPrice: 500, margin: 0.1,
    rackCost: 999, panelsPerRack: 999, freight: 999, racksPerTruck: 999
  });
  assert.equal(r(out), 550);
});

test('calcShip LTL: zero panels still returns 0', () => {
  // Same as FTL: no panels = no shipping cost regardless of mode.
  const out = CALC.calcShip({
    mode: 'ltl', panels: 0, ltlPrice: 500, margin: 0.1
  });
  assert.equal(out, 0);
});

test('calcShip LTL: zero margin = passthrough', () => {
  // Mockup case: user types $850, no margin, should be exactly $850.
  const out = CALC.calcShip({
    mode: 'ltl', panels: 2, ltlPrice: 850, margin: 0
  });
  assert.equal(out, 850);
});

test('calcShip: missing mode falls back to FTL (back-compat)', () => {
  // Old call signature without `mode` field still works as FTL.
  // Same inputs as the 50-panels FTL test above; same expected output.
  const out = CALC.calcShip({
    panels: 50, rackCost: 250, panelsPerRack: 30,
    freight: 3000, racksPerTruck: 14, margin: 0.1
  });
  assert.equal(r(out), 3850);
});

// ── calcEquip ───────────────────────────────────────────────────────────
test('calcEquip: only on:true lines count', () => {
  // 800×2 (on) + 50×4 (on) + 500×1 (off, ignored) = 1800. margin 0 → 1800.
  const out = CALC.calcEquip({
    lines: [
      { rate: 800, qty: 2, on: true  },
      { rate: 50,  qty: 4, on: true  },
      { rate: 500, qty: 1, on: false }
    ],
    margin: 0
  });
  assert.equal(out, 1800);
});

// ── calcTravel ──────────────────────────────────────────────────────────
test('calcTravel: off → 0', () => {
  assert.equal(CALC.calcTravel({ on: false }), 0);
});

test('calcTravel: 2 people, 5-day trip', () => {
  // base = daily×days + air×trips×people + lodge×stayDays×people
  //      + meals×stayDays×people + car×stayDays
  //      = 500×5 + 750×1×2 + 125×5×2 + 75×5×2 + 125×5
  //      = 2500 + 1500 + 1250 + 750 + 625
  //      = 6625
  // margin 10% → 7287.5
  const out = CALC.calcTravel({
    on: true, daily: 500, days: 5, air: 750, trips: 1,
    lodge: 125, meals: 75, car: 125, stayDays: 5, people: 2, margin: 0.1
  });
  assert.equal(r(out), 7287.5);
});

// ── calcOther ───────────────────────────────────────────────────────────
test('calcOther: only on:true lines count, then margin', () => {
  // base = 20000 (mockup) + 1500 (utility) = 21500. ignore 7500 (off).
  // margin 0 → 21500.
  const out = CALC.calcOther({
    lines: [
      { name: 'Site Visit',          amt: 7500,  on: false },
      { name: 'Visual Mockup',       amt: 20000, on: true  },
      { name: 'Utility Incentive',   amt: 1500,  on: true  }
    ],
    margin: 0
  });
  assert.equal(out, 21500);
});

// ── estimateQty ─────────────────────────────────────────────────────────
test('estimateQty: zero panels → 0', () => {
  assert.equal(CALC.estimateQty({ name: 'foam', ref: '' }, { panels: 0 }), 0);
});

test('estimateQty: foam baffle (1/4 x 1/2 → overlap mount) via rule table', () => {
  // Chunk 3 update: foam products now route through material_rules.json.
  // Product name contains "1/4 x 1/2" → matches foam-overlap-mount rule.
  // 1 overlap-mount panel 36"x60": perimOverlap = 2×(3+5) = 16 ft.
  // foam-overlap-mount formula: perimOverlap / (9 × 0.8) = 16 / 7.2 = 2.22 → ceil = 3.
  const t = CALC.getTotals([{
    width: 36, height: 60, qty: 1, headRet: true, sillRet: true,
    mount: 'Overlap-mount'
  }]);
  assert.equal(CALC.estimateQty({ name: '48PPI Foam Baffle 1/4 x 1/2', ref: '' }, t), 3);
});

test('estimateQty: corner keys returns t.corners directly', () => {
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 5 }]);
  assert.equal(CALC.estimateQty({ name: 'Corner Key 46-124', ref: '' }, t), 20);  // 4×5
});

test('estimateQty: setting block returns t.setblks directly', () => {
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 10 }]);
  // setblks per row = ceil(2.3 × qty) = ceil(2.3 × 10) = ceil(23) = 23.
  // (NOT ceil(2.3) × qty = 30 — the ceiling happens AFTER the multiply.)
  assert.equal(CALC.estimateQty({ name: 'Gray Silicone Setting Block', ref: '' }, t), 23);
});

test('estimateQty: unmatched name falls back to t.panels', () => {
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 7 }]);
  assert.equal(CALC.estimateQty({ name: 'Unknown Item XYZ', ref: '' }, t), 7);
});

// ── Mount-aware totals (Chunk 3) ────────────────────────────────────────
test('getTotals: mount-aware perim aggregation (overlap)', () => {
  // 36x60 overlap, qty 2: perim per panel = 16ft, x2 = 32ft → perimOverlap = 32
  const t = CALC.getTotals([
    { width: 36, height: 60, qty: 2, mount: 'Overlap-mount' }
  ]);
  assert.equal(t.perimOverlap, 32);
  assert.equal(t.perimInset, 0);
});

test('getTotals: mount-aware perim aggregation (inset)', () => {
  const t = CALC.getTotals([
    { width: 36, height: 60, qty: 2, mount: 'Inset-mount', headRet: true }
  ]);
  assert.equal(t.perimInset, 32);
  assert.equal(t.perimOverlap, 0);
  // headFtInset: 36/12 ft × 2 qty = 6 ft
  assert.equal(t.headFtInset, 6);
  assert.equal(t.headFtOverlap, 0);
});

test('getTotals: mixed overlap + inset', () => {
  const t = CALC.getTotals([
    { width: 36, height: 60, qty: 1, mount: 'Overlap-mount' },  // perim 16
    { width: 48, height: 60, qty: 1, mount: 'Inset-mount'   }   // perim = 2×(4+5) = 18
  ]);
  assert.equal(t.perimOverlap, 16);
  assert.equal(t.perimInset, 18);
});

// ── Rule table (Chunk 3) ────────────────────────────────────────────────
// Load rules from disk before testing
const fs = require('node:fs');
const path = require('node:path');
const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'material_rules.json'), 'utf8'));
CALC._setRulesForTesting(RULES);

test('rule lookup: setblock Orazen Black 4140-01-01 → setblks', () => {
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 10 }]);
  // setblks = ceil(2.3 × 10) = 23
  const result = CALC.qtyByRuleVerbose({ name: 'Gasket SWR Setblock Black', ref: '4140-01-01' }, t);
  assert.equal(result.source, 'rule');
  assert.equal(result.ruleId, 'setblock-orazen-black');
  assert.equal(result.qty, 23);
});

test('rule lookup: setblock Orazen Gray 4173-01-02 → setblks', () => {
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 5 }]);
  // setblks = ceil(2.3 × 5) = ceil(11.5) = 12
  const result = CALC.qtyByRuleVerbose({ name: 'Setblock Gray', ref: '4173-01-02' }, t);
  assert.equal(result.source, 'rule');
  assert.equal(result.qty, 12);
});

test('rule lookup: setblock USAluminum NP430 → setblks', () => {
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 3 }]);
  // setblks = ceil(2.3 × 3) = ceil(6.9) = 7
  const result = CALC.qtyByRuleVerbose({ name: 'NP430', ref: 'NP430' }, t);
  assert.equal(result.source, 'rule');
  assert.equal(result.ruleId, 'setblock-usaluminum-np430');
  assert.equal(result.qty, 7);
});

test('rule lookup: foam by name pattern uses overlap perimeter', () => {
  // 10 panels overlap-mount, perim per panel = 2×(3+5) = 16ft → perimOverlap = 160
  // foam-generic-fallback: (perimOverlap + perimInset) / (9 × 0.8) = 160 / 7.2 = 22.22 → ceil = 23
  // BUT foam-overlap-mount pattern "foam.*1/?4.*x.*1/?2|foam.*overlap" might match first.
  // Product name "Foam 48PPI 0.5x0.5x9' reticulated foam" → doesn't include "overlap" or "1/4 x 1/2"
  // → won't match foam-overlap-mount. Will match foam-inset-mount pattern "foam\s*48ppi\s*0?\.?5" → no, that's inset.
  // Actually "Foam 48PPI 0.5x0.5x9'" → matches "foam\s*48ppi\s*0?\.?5" → foam-inset-mount.
  // perimInset = 0 here → qty = 0.
  const t = CALC.getTotals([
    { width: 36, height: 60, qty: 10, mount: 'Overlap-mount' }
  ]);
  const result = CALC.qtyByRuleVerbose({ name: "Foam 48PPI 0.5\"x0.5\"x9' reticulated foam", ref: 'INOV-201' }, t);
  // The 48PPI 0.5 product matches foam-inset-mount rule; with all-overlap TKO, inset perim = 0.
  assert.equal(result.source, 'rule');
  assert.equal(result.ruleId, 'foam-inset-mount');
  assert.equal(result.qty, 0);  // no inset panels → no foam needed for inset purpose
});

test('rule lookup: foam with INSET-mount panels gets correct qty', () => {
  // 10 panels inset-mount → perimInset = 160
  // foam-inset-mount: perimInset / (9 × 0.8) = 160 / 7.2 = 22.22 → ceil = 23
  const t = CALC.getTotals([
    { width: 36, height: 60, qty: 10, mount: 'Inset-mount' }
  ]);
  const result = CALC.qtyByRuleVerbose({ name: "Foam 48PPI 0.5\"x0.5\"x9' reticulated foam", ref: 'INOV-201' }, t);
  assert.equal(result.ruleId, 'foam-inset-mount');
  assert.equal(result.qty, 23);
});

test('rule lookup: glazing tape GT106 uses headFtInset', () => {
  // 10 inset-mount panels with headRet=true → headFtInset = 36/12 × 10 = 30 ft
  // formula: headFtInset / (100 × 0.9091) = 30 / 90.91 = 0.330 → ceil = 1
  const t = CALC.getTotals([
    { width: 36, height: 60, qty: 10, mount: 'Inset-mount', headRet: true }
  ]);
  const result = CALC.qtyByRuleVerbose({ name: 'CRL Butyl Tape', ref: 'GT106' }, t);
  assert.equal(result.source, 'rule');
  assert.equal(result.ruleId, 'glazing-tape-inset-head-retainer');
  assert.equal(result.qty, 1);
});

test('rule lookup: glazing tape GT106 with no inset panels → qty 0', () => {
  // All overlap-mount → headFtInset = 0 → qty = 0
  const t = CALC.getTotals([
    { width: 36, height: 60, qty: 10, mount: 'Overlap-mount', headRet: true }
  ]);
  const result = CALC.qtyByRuleVerbose({ name: 'CRL Butyl Tape', ref: 'GT106' }, t);
  assert.equal(result.qty, 0);
  assert.equal(result.ruleId, 'glazing-tape-inset-head-retainer');
});

test('rule lookup: unmatched product falls back to legacy heuristic', () => {
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 7 }]);
  const result = CALC.qtyByRuleVerbose({ name: 'Random Mystery Item', ref: 'XYZ-999' }, t);
  assert.equal(result.source, 'fallback');
  assert.equal(result.ruleId, null);
  assert.equal(result.qty, 7);  // falls through to t.panels default
});

test('rule lookup: exact code beats name pattern when both could match', () => {
  // 4140-01-01 has both default_code rule (setblock-orazen-black) AND
  // a product name containing "foam" would NOT match here — we test code wins.
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 10 }]);
  // Send a product where the NAME would also match a different pattern,
  // but the code matches the setblock rule exactly.
  const result = CALC.qtyByRuleVerbose(
    { name: 'Confusingly named foam setblock thing', ref: '4140-01-01' }, t
  );
  assert.equal(result.ruleId, 'setblock-orazen-black');
  assert.equal(result.qty, 23);  // setblks, not the foam formula
});

test('estimateQty back-compat: returns just qty (no rule metadata)', () => {
  // Confirm the old single-return-value signature still works.
  const t = CALC.getTotals([{ width: 36, height: 60, qty: 10 }]);
  const qty = CALC.estimateQty({ name: 'Setblock', ref: '4140-01-01' }, t);
  assert.equal(typeof qty, 'number');
  assert.equal(qty, 23);
});
