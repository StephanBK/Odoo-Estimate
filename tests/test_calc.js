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

test('estimateQty: foam baffle uses perimH/2 formula', () => {
  // perimH = 6 ft (one panel 36" wide × 1 qty: 2×3 = 6)
  // formula: ceil((perimH/2) / (9 × 0.8)) = ceil(3 / 7.2) = ceil(0.4167) = 1
  const t = CALC.getTotals([{
    width: 36, height: 60, qty: 1, headRet: true, sillRet: true
  }]);
  assert.equal(CALC.estimateQty({ name: '48PPI Foam Baffle 1/4x1/2', ref: '' }, t), 1);
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
