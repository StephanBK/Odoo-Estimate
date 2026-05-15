/**
 * INOVUES Estimator — Pure Calculation Module
 *
 * All math lives here as pure functions: inputs in → number out. No DOM,
 * no globals, no side effects. This is what makes the calc engine
 * unit-testable via `node --test`.
 *
 * Usage in browser:  <script src="calc.js"></script>  → exposes window.CALC
 * Usage in Node:     const CALC = require('./calc');  → CommonJS
 *
 * Each function takes a single plain-object argument so call sites are
 * self-documenting and order-independent.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();        // Node / tests
  } else {
    root.CALC = factory();             // Browser → window.CALC
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // ── Geometry aggregation ────────────────────────────────────────────────
  // Mirrors index.html getTotals(): sums geometry across all valid TKO rows.
  // Each row: { width, height, qty, headRet, sillRet, jambSp, mount }
  // width/height are in INCHES (converted to ft internally).
  function getTotals(tkoRows) {
    let panels = 0, area = 0, perimH = 0, perimV = 0;
    let headFt = 0, sillFt = 0, jambFt = 0;
    let corners = 0, setblks = 0;
    let dlJambs = 0, spJambs = 0;
    const DUAL_LOCK_PER_JAMB = 3;
    const SPECIAL_SPACER_PER_JAMB = 3;

    for (const r of (tkoRows || [])) {
      const w_in = +r.width || 0;
      const h_in = +r.height || 0;
      const q = +r.qty || 0;
      if (q <= 0 || w_in <= 0 || h_in <= 0) continue;
      const w = w_in / 12, h = h_in / 12;
      panels += q;
      area   += w * h * q;
      perimH += 2 * w * q;
      perimV += 2 * h * q;
      if (r.headRet) headFt += w * q;
      if (r.sillRet) sillFt += w * q;
      jambFt += 2 * h * q;
      corners += 4 * q;
      setblks += Math.ceil(2.3 * q);
      dlJambs += 2 * q * DUAL_LOCK_PER_JAMB;
      if (r.jambSp) spJambs += 2 * q * SPECIAL_SPACER_PER_JAMB;
    }
    return {
      panels, area, perim: perimH + perimV, perimH, perimV,
      headFt, sillFt, jambFt, corners, setblks, dlJambs, spJambs
    };
  }

  // ── Fabrication ─────────────────────────────────────────────────────────
  // Base = lump×area + (hrCut+hrAsm+hrCln)×rate×panels;  total = base×(1+margin)
  function calcFab({ rate, lump, hrCut, hrAsm, hrCln, margin, panels, area }) {
    panels = +panels || 0; area = +area || 0;
    if (!panels) return 0;
    rate = +rate || 0; lump = +lump || 0;
    hrCut = +hrCut || 0; hrAsm = +hrAsm || 0; hrCln = +hrCln || 0;
    margin = +margin || 0;
    const base = lump * area + (hrCut + hrAsm + hrCln) * rate * panels;
    return base * (1 + margin);
  }

  // ── Installation ────────────────────────────────────────────────────────
  // Either lump-sum (use lumpAmt) OR rate × hrUnit × panels + PM + optional takeoff.
  function calcInst({
    on, useLump, lumpAmt, rate, hrUnit, pmHrs, pmRate,
    takeoffOn, takeoffAmt, margin, panels
  }) {
    if (!on || !panels) return 0;
    margin = +margin || 0;
    let base;
    if (useLump) {
      base = +lumpAmt || 0;
    } else {
      base = (+rate || 0) * (+hrUnit || 0) * (+panels || 0)
           + (+pmHrs || 0) * (+pmRate || 0)
           + (takeoffOn ? (+takeoffAmt || 0) : 0);
    }
    return base * (1 + margin);
  }

  // ── Shipping ────────────────────────────────────────────────────────────
  // Two modes:
  //   mode='ftl' (default): racks×rackCost + trucks×freight
  //     racks   = ceil(panels / panelsPerRack)
  //     trucks  = ceil(racks  / racksPerTruck)
  //   mode='ltl': flat user-entered ltlPrice (typically for mockups, samples,
  //              or small partial-load shipments).
  // Margin is applied identically in both modes: total = base × (1+margin).
  // If mode is omitted, falls back to FTL behavior (back-compat).
  function calcShip({
    mode, panels, rackCost, panelsPerRack, freight, racksPerTruck,
    ltlPrice, margin
  }) {
    panels = +panels || 0;
    if (!panels) return 0;
    margin = +margin || 0;
    let base;
    if (mode === 'ltl') {
      base = +ltlPrice || 0;
    } else {
      // FTL (default)
      rackCost = +rackCost || 0;
      panelsPerRack = +panelsPerRack || 1;
      freight = +freight || 0;
      racksPerTruck = +racksPerTruck || 1;
      const racks  = Math.ceil(panels / panelsPerRack);
      const trucks = Math.ceil(racks / racksPerTruck);
      base = racks * rackCost + trucks * freight;
    }
    return base * (1 + margin);
  }

  // ── Equipment ───────────────────────────────────────────────────────────
  // Sum of {on:true} lines: rate × qty, then × (1+margin)
  function calcEquip({ lines, margin }) {
    margin = +margin || 0;
    const base = (lines || [])
      .filter(e => e.on)
      .reduce((s, e) => s + (+e.rate || 0) * (+e.qty || 0), 0);
    return base * (1 + margin);
  }

  // ── Travel ──────────────────────────────────────────────────────────────
  function calcTravel({
    on, daily, days, air, trips, lodge, meals, car, stayDays, people, margin
  }) {
    if (!on) return 0;
    people = +people || 1;
    margin = +margin || 0;
    daily = +daily || 0; days = +days || 0;
    air = +air || 0; trips = +trips || 0;
    lodge = +lodge || 0; meals = +meals || 0; car = +car || 0;
    stayDays = +stayDays || 0;
    const base = daily * days
               + air * trips * people
               + lodge * stayDays * people
               + meals * stayDays * people
               + car * stayDays;
    return base * (1 + margin);
  }

  // ── Other charges ───────────────────────────────────────────────────────
  function calcOther({ lines, margin }) {
    margin = +margin || 0;
    const base = (lines || [])
      .filter(e => e.on)
      .reduce((s, e) => s + (+e.amt || 0), 0);
    return base * (1 + margin);
  }

  // ── Per-line material qty heuristic ─────────────────────────────────────
  // String-match estimator. Kept identical to index.html for now; chunk 3
  // will improve the foam/glazing-tape/setting-block branches.
  function estimateQty(product, t) {
    if (!t || !t.panels) return 0;
    const n = ((product.name || '') + ' ' + (product.ref || '')).toLowerCase();
    if (n.includes('glass') || n.includes('vig') ||
        (!n.includes('spline') && n.includes(' ig '))) return Math.ceil(t.area);
    if (n.includes('alum') && n.includes('profile')) return Math.ceil(t.perim / (16 * 0.8));
    if (n.includes('spline') || n.includes('gasket swr')) return Math.ceil(t.perim / 0.9);
    if (n.includes('jamb gasket')) return Math.ceil(t.jambFt / 0.952);
    if (n.includes('corner key')) return t.corners;
    if (n.includes('dual lock')) return Math.ceil(t.dlJambs / 1620);
    if (n.includes('foam')) return Math.ceil((t.perimH / 2) / (9 * 0.8));
    if (n.includes('head retainer')) return Math.ceil(t.headFt / (10 * 0.875));
    if (n.includes('sill retainer')) return Math.ceil(t.sillFt / (10 * 0.875));
    if (n.includes('aftc')) return Math.ceil(t.perim / (54 * 0.909));
    if (n.includes('setblock') || n.includes('setting block')) return t.setblks;
    if (n.includes('desiccant') || n.includes('dessicant')) return Math.ceil(t.panels / 900);
    if (n.includes('protection film')) return Math.ceil((t.area / 4) / 891);
    if (n.includes('shipping pad')) return Math.ceil((t.panels * 8) / (2700 * 0.952));
    if (n.includes('masking tape')) return Math.ceil(t.perim / (180 * 0.909));
    if (n.includes('hot melt') || n.includes('butyl')) return Math.ceil(t.perim / (164 * 0.8));
    if (n.includes('dymonic') || n.includes('sealant')) return Math.ceil(t.jambFt / (7.6 * 0.8));
    return t.panels;
  }

  return {
    getTotals, calcFab, calcInst, calcShip,
    calcEquip, calcTravel, calcOther, estimateQty
  };
});
