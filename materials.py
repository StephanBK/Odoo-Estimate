"""
SWR Material Calculation Engine
Mirrors EST-1 logic from INOVUES_IGR___SWR_Cost_Estimate_template_v8_2

Each material has:
  - name:        display name
  - odoo_ref:    internal reference in Odoo (for inventory lookup)
  - supplier:    supplier name
  - cost:        cost per unit
  - cost_unit:   unit of purchase (stick, roll, ft, etc.)
  - yield_qty:   how much usable output per cost_unit
  - yield_unit:  unit of the yield
  - utilization: waste/efficiency factor (e.g. 0.8 = 80% usable)
  - demand_fn:   function(panels, area_ft2, perim_ft, perim_h, perim_v,
                          head_ret_ft, sill_ret_ft, jamb_ft,
                          dual_lock_jambs, special_jamb_locs,
                          corner_keys, mount_type, glazing_type)
                 returns demand in yield_unit
  - ship_pct:    shipping cost factor
  - active_fn:   function returning True if this item is used for given specs
"""

import math

def ceil_demand(demand, yield_qty, utilization):
    """How many purchase units needed given demand, yield per unit, and utilization."""
    if yield_qty <= 0 or utilization <= 0:
        return 0
    effective_yield = yield_qty * utilization
    return math.ceil(demand / effective_yield) if demand > 0 else 0


def compute_tko_totals(tko_rows):
    """
    From the TKO rows, compute aggregate geometry needed by the calc engine.
    Returns a dict of totals.
    """
    totals = {
        "panels": 0,
        "area_ft2": 0.0,
        "perim_ft": 0.0,
        "perim_h_ft": 0.0,   # horizontal perimeter (top + bottom) per panel * qty
        "perim_v_ft": 0.0,   # vertical perimeter (left + right) per panel * qty
        "head_ret_ft": 0.0,
        "sill_ret_ft": 0.0,
        "jamb_ft": 0.0,
        "dual_lock_jambs": 0.0,   # from EST-1 input: dual lock locations per jamb
        "special_jamb_locs": 0.0, # from EST-1 input: special spacer locations per jamb
        "corner_keys": 0,
        "setblocks": 0,
        "rows": [],
    }
    DUAL_LOCK_PER_JAMB   = 3   # EST-1 default
    SPECIAL_SPACER_PER_JAMB = 3  # EST-1 default

    for r in tko_rows:
        if r["qty"] <= 0 or r["width_in"] <= 0 or r["height_in"] <= 0:
            continue
        w = r["width_in"] / 12   # ft
        h = r["height_in"] / 12  # ft
        qty = r["qty"]

        area   = w * h * qty
        p_h    = 2 * w * qty          # top + bottom
        p_v    = 2 * h * qty          # left + right
        perim  = p_h + p_v

        totals["panels"]     += qty
        totals["area_ft2"]   += area
        totals["perim_ft"]   += perim
        totals["perim_h_ft"] += p_h
        totals["perim_v_ft"] += p_v

        # Head retainer: top of each panel (width)
        if r.get("head_ret"):
            totals["head_ret_ft"] += w * qty

        # Sill retainer: bottom of each panel (width)
        if r.get("sill_ret"):
            totals["sill_ret_ft"] += w * qty

        # Jamb gasket: both sides (height x2) per panel
        totals["jamb_ft"] += 2 * h * qty

        # Dual lock: 2 jambs per panel x locations per jamb
        totals["dual_lock_jambs"] += 2 * qty * DUAL_LOCK_PER_JAMB

        # Special jamb spacers
        if r.get("jamb_sp"):
            totals["special_jamb_locs"] += 2 * qty * SPECIAL_SPACER_PER_JAMB

        # Corner keys: 4 per panel (2 top + 2 bottom frame corners)
        totals["corner_keys"] += 4 * qty

        # Setting blocks: ~2.3 per panel average (from EST-1 formula)
        totals["setblocks"] += math.ceil(2.3 * qty)

        totals["rows"].append({**r, "w_ft": w, "h_ft": h, "area": area})

    return totals


# ─── SWR Material Definitions ─────────────────────────────────────────────────
# Format: (name, odoo_ref, supplier, cost, cost_unit, yield_qty, yield_unit, utilization, ship_pct, demand_fn)

def get_swr_materials(totals):
    """
    Returns a list of dicts, one per material line, with calculated demand.
    """
    panels   = totals["panels"]
    area     = totals["area_ft2"]
    perim    = totals["perim_ft"]
    perim_h  = totals["perim_h_ft"]
    perim_v  = totals["perim_v_ft"]
    head_ft  = totals["head_ret_ft"]
    sill_ft  = totals["sill_ret_ft"]
    jamb_ft  = totals["jamb_ft"]
    dl_jambs = totals["dual_lock_jambs"]
    sp_jambs = totals["special_jamb_locs"]
    corners  = totals["corner_keys"]
    setblks  = totals["setblocks"]

    lines = []

    def add(name, odoo_ref, supplier, cost, cost_unit,
            yield_qty, yield_unit, utilization, ship_pct, demand):
        if demand <= 0:
            return
        purchase_qty = math.ceil(demand / (yield_qty * utilization)) if yield_qty * utilization > 0 else 0
        mat_cost = purchase_qty * cost
        ship_cost = mat_cost * ship_pct
        lines.append({
            "name":         name,
            "odoo_ref":     odoo_ref,
            "supplier":     supplier,
            "cost":         cost,
            "cost_unit":    cost_unit,
            "yield_qty":    yield_qty,
            "yield_unit":   yield_unit,
            "utilization":  utilization,
            "demand":       round(demand, 2),
            "demand_unit":  yield_unit,
            "purchase_qty": purchase_qty,
            "mat_cost":     round(mat_cost, 2),
            "ship_pct":     ship_pct,
            "ship_cost":    round(ship_cost, 2),
            "total_cost":   round(mat_cost + ship_cost, 2),
        })

    # ── Glazing ──────────────────────────────────────────────────────────────
    add("Glazing (VIG/IG/Mono)", "INOV-232", "LuxWall",
        20, "ft2", 1, "ft2", 1.0, 0.0, area)

    # ── Aluminum Profiles (SWR-VIG 03310 Mill Finish) ────────────────────────
    # Demand in sticks: perimeter / (yield_ft_per_stick * utilization)
    add("Alum SWR-VIG Profile 03310 Mill Finish", "03004CA (03310CA)",
        "Republic Extrusions",
        30, "ft", 16, "ft/stick", 0.8, 0.05, perim)

    add("Alum SWR-VIG Profile 03310 Black Anodized", "03004BA (03310BA)",
        "Republic Extrusions",
        24.72, "ft", 16, "ft/stick", 0.8, 0.05, 0)  # demand=0 unless specified

    add("Alum SWR-VIG Profile 03310 Clear Anodized", "03004CA (03310CA)",
        "Republic Extrusions",
        19.43, "ft", 16, "ft/stick", 0.8, 0.05, 0)

    # ── Glazing Spline ───────────────────────────────────────────────────────
    add("SWR-VIG Glazing Spline 8mm Black (Orazen 4194-01-00)", "4194-01-00",
        "Orazen",
        0.43, "ft", 1, "ft/ft", 0.9, 0.1, perim)

    add("SWR Glazing Spline 5mm EPDM Black (Orazen 4212-01-00)", "4212-01-00",
        "Orazen",
        0.25, "ft", 1, "ft/ft", 0.9, 0.1, 0)  # used for non-VIG

    # ── Jamb Gasket ──────────────────────────────────────────────────────────
    add("Jamb Gasket Gray (Orazen 4172-02-01)", "4172-02-01",
        "Orazen",
        0.41, "ft", 1, "ft/ft", 0.952, 0.1, jamb_ft)

    add("Jamb Gasket Black (Orazen 4003-02-00)", "4003-02-00",
        "Orazen",
        0.35, "ft", 1, "ft/ft", 0.952, 0.1, 0)

    # ── Corner Keys ──────────────────────────────────────────────────────────
    add("Corner Keys 46-124 VIG SWR (Strybuc)", "46-124",
        "Strybuc",
        0.39, "key", 1, "keys/key", 0.9, 0.02, corners)

    # ── Dual Lock ────────────────────────────────────────────────────────────
    # dl_jambs = total dual lock attachment points; each roll = 1800 pieces
    add("3M Dual Lock 1/2\" SJ3550CF", "SJ3550CF",
        "Fastenation",
        584, "roll", 1800, "pieces/roll", 0.9, 0.05, dl_jambs)

    # ── Foam Baffles ─────────────────────────────────────────────────────────
    # Overlap mount: head and sill baffles = perim_h (top + bottom)
    add("48PPI Foam Baffle 1/4\"x1/2\" (head retainer)", "INOV-201",
        "Merryweather",
        4.41, "roll", 9, "ft/roll", 0.8, 0.05, perim_h / 2)  # top only

    add("48PPI Foam Baffle 1/2\"x1/2\" (sill retainer)", "INOV-201",
        "Merryweather",
        4.86, "roll", 9, "ft/roll", 0.8, 0.05, perim_h / 2)  # bottom only

    # ── Head Retainer ────────────────────────────────────────────────────────
    add("Head Retainer (CRL)", "20189",
        "CRL",
        30.8, "stick", 10, "ft/stick", 0.875, 0.05, head_ft)

    # ── Sill Retainer ────────────────────────────────────────────────────────
    add("Sill Retainer (CRL)", "20189",
        "CRL",
        30.8, "stick", 10, "ft/stick", 0.875, 0.05, sill_ft)

    # ── AFTC Tape for Head + Sill Retainer ───────────────────────────────────
    add("AFTC 1\" Tape for Head Retainer", "INOV-159",
        "AFTC",
        38, "roll", 54, "ft/roll", 0.909, 0.05, head_ft)

    add("AFTC 1\" Tape for Sill Retainer", "INOV-159",
        "AFTC",
        38, "roll", 54, "ft/roll", 0.909, 0.05, sill_ft)

    # ── Setting Blocks ───────────────────────────────────────────────────────
    add("Gray Silicone Setting Blocks (Orazen 4173-01-02)", "4173-01-02",
        "Orazen",
        0.54, "unit", 1, "units/unit", 0.85, 0.1, setblks)

    # ── Special Jamb Spacers ─────────────────────────────────────────────────
    if sp_jambs > 0:
        add("Special Jamb Spacers U-Channel (CRL)", "WU3SASL",
            "CRL",
            30.8, "stick", 10, "ft/stick", 0.875, 0.05, sp_jambs)

        add("AFTC 1/2\" for Jamb Spacers", "INOV-159",
            "AFTC",
            20, "roll", 54, "ft/roll", 0.909, 0.05, sp_jambs)

    # ── Glass Protection Film ─────────────────────────────────────────────────
    # 48" wide roll, 990 ft long; demand in ft based on area
    film_ft = area / 4  # 48" = 4ft wide
    add("Glass Protection Film 48\" x 990' (Nitto Blue)", "5057A5",
        "Protective Films",
        484.54, "roll", 990, "ft/roll", 0.9, 0.05, film_ft)

    # ── Shipping Pads ────────────────────────────────────────────────────────
    # ~2700 pads/box; ~8 pads per panel (4 corners x 2 per corner)
    add("CRL Super Duty Shipping Pads (box/2700)", "NSP121515",
        "CRL",
        324.99, "box", 2700, "pads/box", 0.952, 0.05, panels * 8)

    # ── Desiccant Bags ───────────────────────────────────────────────────────
    # ~1 bag per panel for VIG
    add("Desiccant Bags Uline S22299 (1000/box)", "INOV-265",
        "Uline",
        260.23, "box", 1000, "bags/box", 0.9, 0.05, panels)

    # ── Masking Tape ─────────────────────────────────────────────────────────
    add("Painter's Masking Tape 1\"x60yd", "S-13752",
        "Uline",
        3.3, "roll", 180, "ft/roll", 0.909, 0.05, perim)

    return lines
