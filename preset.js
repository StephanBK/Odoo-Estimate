// preset.js — SWR material preset evaluation.
//
// Translates app TKO row values (e.g. finish:"Clear Anodized") into the sheet's
// EST-1 vocabulary (finishType:"anodize", color:"light") and decides which
// preset materials should be in matRows given the current TKO.
//
// Pure functions: no DOM, no globals, no side effects. Wired into index.html
// by a thin glue function that reads `rows`, calls `buildPreset()`, then adds
// any missing items to `matRows`.
//
// Source of truth: preset_swr.json (built from EST-1 row 65-103 demand formulas
// of `INOVUES_IGR___SWR_Cost_Estimate_template_v8_4_Arcadia-ECM.xlsx`).

(function () {
  'use strict';

  // ── Translation ────────────────────────────────────────────────────────────
  // App TKO fields use different vocabulary than EST-1 formulas. This is the
  // adapter layer: app values in, sheet values out. Keeps the app's data model
  // unchanged.
  function translateTkoRow(row) {
    // App "Finish" dropdown collapses into sheet's finishType + color.
    // "Clear Anodized" and "Black Anodized" already encode the color, so they
    // override the app's Color dropdown.
    let finishType, finishColor;
    switch (row.finish) {
      case 'Clear Anodized':
        finishType = 'anodize'; finishColor = 'light'; break;
      case 'Black Anodized':
        finishType = 'anodize'; finishColor = 'dark'; break;
      case 'Painted':
      case 'Mill Finish':
      default:
        finishType = 'painted';
        finishColor = (row.color || 'Light').toLowerCase() === 'dark' ? 'dark' : 'light';
    }

    // Glazing Type: app uses VIG/IG/Monolithic, sheet uses VIG/IGU/single-pane.
    const glazingMap = { 'VIG': 'VIG', 'IG': 'IGU', 'Monolithic': 'single-pane' };

    return {
      system:     row.system,
      finishType: finishType,
      color:      finishColor,
      glazing:    glazingMap[row.glazing] || row.glazing,
      mount:      (row.mount || '').toLowerCase(),
      headRet:    row.headRet ? 'yes' : 'no',
      sillRet:    row.sillRet ? 'yes' : 'no',
      jambSp:     row.jambSp  ? 'yes' : 'no',
    };
  }

  // ── Single-rule match against one translated TKO row ──────────────────────
  function ruleMatchesRow(rule, translatedRow) {
    if (rule.always_present) return true;
    const cond = rule.conditions || {};
    for (const key of Object.keys(cond)) {
      // glazingMat (PMMA) condition deferred — app doesn't have that field yet
      if (key === 'glazingMat') continue;
      if (translatedRow[key] !== cond[key]) return false;
    }
    return true;
  }

  // ── Build the preset list ─────────────────────────────────────────────────
  // A material is in the preset if AT LEAST ONE TKO row satisfies its
  // conditions (matches how the sheet's SUMPRODUCT aggregates across rows).
  // Always-present items appear once any TKO row exists.
  function buildPreset(rules, tkoRows) {
    const activeRows = (tkoRows || []).filter(
      r => r && r.qty > 0 && r.width > 0 && r.height > 0
    );
    if (!activeRows.length) return [];

    const translated = activeRows.map(translateTkoRow);
    return rules.filter(rule =>
      rule.always_present || translated.some(tr => ruleMatchesRow(rule, tr))
    );
  }

  // ── Export (browser global + Node for tests) ──────────────────────────────
  const api = { translateTkoRow, ruleMatchesRow, buildPreset };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.PRESET = api;
  }
})();
