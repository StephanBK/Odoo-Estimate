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
  // Mount-aware aggregations (Chunk 3) let per-SKU rules ask for exactly
  // the geometry they need: e.g. overlap-mount foam uses perimOverlap,
  // inset-mount glazing tape uses headFtInset, etc.
  function getTotals(tkoRows) {
    let panels = 0, area = 0, perimH = 0, perimV = 0;
    let headFt = 0, sillFt = 0, jambFt = 0;
    let corners = 0, setblks = 0;
    let dlJambs = 0, spJambs = 0;
    // Mount-aware sums (Chunk 3)
    let perimOverlap = 0, perimInset = 0;
    let headFtInset = 0, headFtOverlap = 0;
    const DUAL_LOCK_PER_JAMB = 3;
    const SPECIAL_SPACER_PER_JAMB = 3;

    for (const r of (tkoRows || [])) {
      const w_in = +r.width || 0;
      const h_in = +r.height || 0;
      const q = +r.qty || 0;
      if (q <= 0 || w_in <= 0 || h_in <= 0) continue;
      const w = w_in / 12, h = h_in / 12;
      const rowPerim = 2 * (w + h) * q;
      const rowHead  = r.headRet ? w * q : 0;
      panels += q;
      area   += w * h * q;
      perimH += 2 * w * q;
      perimV += 2 * h * q;
      headFt += rowHead;
      if (r.sillRet) sillFt += w * q;
      jambFt += 2 * h * q;
      corners += 4 * q;
      setblks += Math.ceil(2.3 * q);
      dlJambs += 2 * q * DUAL_LOCK_PER_JAMB;
      if (r.jambSp) spJambs += 2 * q * SPECIAL_SPACER_PER_JAMB;

      // Mount-aware buckets — case-insensitive match on 'overlap' / 'inset'
      const mount = String(r.mount || '').toLowerCase();
      if (mount.includes('overlap')) {
        perimOverlap  += rowPerim;
        headFtOverlap += rowHead;
      } else if (mount.includes('inset')) {
        perimInset += rowPerim;
        headFtInset += rowHead;
      }
    }
    return {
      panels, area, perim: perimH + perimV, perimH, perimV,
      headFt, sillFt, jambFt, corners, setblks, dlJambs, spJambs,
      perimOverlap, perimInset, headFtInset, headFtOverlap
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
  // Two-tier matching (Chunk 3):
  //   1. Rule table lookup (material_rules.json) — preferred, deterministic.
  //   2. String-match heuristic — fallback for products without explicit rules.
  // Returns just the qty for back-compat. Use qtyByRuleVerbose() if you
  // also need to know WHICH rule fired (for UI badges).
  function estimateQty(product, t) {
    const result = qtyByRuleVerbose(product, t);
    return result.qty;
  }

  // Verbose variant returns { qty, ruleId, source } so callers (e.g. the UI)
  // can show transparency badges like "rule: foam-overlap-mount".
  // source ∈ { "rule", "fallback", "none" }.
  function qtyByRuleVerbose(product, t) {
    if (!t || !t.panels) return { qty: 0, ruleId: null, source: 'none' };
    // Defensive: callers should pass a product object, but if not, treat as
    // empty-fields rather than crashing on `null.ref` / `undefined.name`.
    if (!product || typeof product !== 'object') product = {};

    // 1. Try the rule table first.
    const rules = (typeof window !== 'undefined' && window.MATERIAL_RULES)
                || (typeof globalThis !== 'undefined' && globalThis.MATERIAL_RULES)
                || null;
    if (rules && Array.isArray(rules.rules)) {
      const code = String(product.ref || '').trim().toLowerCase();
      const name = String(product.name || '').toLowerCase();

      // 1a. Exact default_code match
      if (code) {
        for (const rule of rules.rules) {
          if (rule.default_code && rule.default_code.toLowerCase() === code) {
            const qty = _applyFormula(rule.formula, t);
            return { qty, ruleId: rule.id, source: 'rule' };
          }
        }
      }
      // 1b. First name_pattern match
      for (const rule of rules.rules) {
        if (rule.name_pattern) {
          try {
            const re = new RegExp(rule.name_pattern, 'i');
            if (re.test(name) || (code && re.test(code))) {
              const qty = _applyFormula(rule.formula, t);
              return { qty, ruleId: rule.id, source: 'rule' };
            }
          } catch (e) { /* malformed regex — skip rule */ }
        }
      }
    }

    // 2. Fallback: legacy string-match heuristic. Kept identical to
    // pre-Chunk-3 behavior so unmatched products don't regress.
    const n = ((product.name || '') + ' ' + (product.ref || '')).toLowerCase();
    let qty = 0;
    if      (n.includes('glass') || n.includes('vig') ||
             (!n.includes('spline') && n.includes(' ig '))) qty = Math.ceil(t.area);
    else if (n.includes('alum') && n.includes('profile')) qty = Math.ceil(t.perim / (16 * 0.8));
    else if (n.includes('spline') || n.includes('gasket swr')) qty = Math.ceil(t.perim / 0.9);
    else if (n.includes('jamb gasket')) qty = Math.ceil(t.jambFt / 0.952);
    else if (n.includes('corner key')) qty = t.corners;
    else if (n.includes('dual lock')) qty = Math.ceil(t.dlJambs / 1620);
    else if (n.includes('foam')) qty = Math.ceil((t.perimH / 2) / (9 * 0.8));
    else if (n.includes('head retainer')) qty = Math.ceil(t.headFt / (10 * 0.875));
    else if (n.includes('sill retainer')) qty = Math.ceil(t.sillFt / (10 * 0.875));
    else if (n.includes('aftc')) qty = Math.ceil(t.perim / (54 * 0.909));
    else if (n.includes('setblock') || n.includes('setting block')) qty = t.setblks;
    else if (n.includes('desiccant') || n.includes('dessicant')) qty = Math.ceil(t.panels / 900);
    else if (n.includes('protection film')) qty = Math.ceil((t.area / 4) / 891);
    else if (n.includes('shipping pad')) qty = Math.ceil((t.panels * 8) / (2700 * 0.952));
    else if (n.includes('masking tape')) qty = Math.ceil(t.perim / (180 * 0.909));
    else if (n.includes('hot melt') || n.includes('butyl')) qty = Math.ceil(t.perim / (164 * 0.8));
    else if (n.includes('dymonic') || n.includes('sealant')) qty = Math.ceil(t.jambFt / (7.6 * 0.8));
    else qty = t.panels;
    return { qty, ruleId: null, source: 'fallback' };
  }

  // Safe formula evaluator. Compiles a string like "headFtInset / (100 * 0.9091)"
  // into a function that only sees the totals fields — NO access to globals,
  // window, document, or anything else. Result wrapped in Math.ceil().
  // Compilation is cached per formula string for performance.
  const _formulaCache = {};
  function _applyFormula(formula, t) {
    if (!formula || typeof formula !== 'string') return 0;
    let fn = _formulaCache[formula];
    if (!fn) {
      try {
        const keys = Object.keys(t);
        // new Function isolates scope — no closure capture of caller's vars.
        fn = new Function(...keys, `"use strict"; return (${formula});`);
        _formulaCache[formula] = fn;
      } catch (e) {
        return 0;
      }
    }
    try {
      const result = fn(...Object.values(t));
      if (!isFinite(result) || result < 0) return 0;
      return Math.ceil(result);
    } catch (e) {
      return 0;
    }
  }

  // Allow runtime injection of the rule table (for tests / node).
  function _setRulesForTesting(rules) {
    if (typeof globalThis !== 'undefined') globalThis.MATERIAL_RULES = rules;
  }

  return {
    getTotals, calcFab, calcInst, calcShip,
    calcEquip, calcTravel, calcOther,
    estimateQty, qtyByRuleVerbose, _setRulesForTesting
  };
});
