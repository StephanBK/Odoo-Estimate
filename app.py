import streamlit as st
import pandas as pd
import xmlrpc.client
import os
from datetime import date
from materials import compute_tko_totals, get_swr_materials

st.set_page_config(
    page_title="INOVUES Estimator",
    page_icon="🪟",
    layout="wide"
)

# ─── Odoo connection ───────────────────────────────────────────────────────────
ODOO_URL     = os.environ.get("ODOO_URL", "https://inovues.odoo.com")
ODOO_DB      = os.environ.get("ODOO_DB", "inovues")
ODOO_USER    = os.environ.get("ODOO_USER", "sketterer@inovues.com")
ODOO_API_KEY = os.environ.get("ODOO_API_KEY", "")

@st.cache_resource
def get_odoo_models():
    try:
        common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
        uid = common.authenticate(ODOO_DB, ODOO_USER, ODOO_API_KEY, {})
        if not uid:
            return None, None
        models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")
        return uid, models
    except Exception:
        return None, None

def odoo(model, method, args, kwargs={}):
    uid, models = get_odoo_models()
    if not uid:
        return []
    return models.execute_kw(ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs)

# ─── Session state defaults ────────────────────────────────────────────────────
if "tko_rows" not in st.session_state:
    st.session_state.tko_rows = [
        {"item": "SWR-1", "width_in": 0.0, "height_in": 0.0, "qty": 0,
         "system": "SWR", "finish": "Painted", "color": "Light",
         "mount": "Overlap-mount", "head_ret": True, "sill_ret": True,
         "jamb_sp": False, "glazing_type": "VIG", "glazing_price": 20.0}
    ]

# ─── Header ───────────────────────────────────────────────────────────────────
st.title("🪟 INOVUES Estimator")
st.caption("Phase 1 — Window Takeoff (TKO)")

# ─── Project Info ─────────────────────────────────────────────────────────────
st.subheader("Project Info")
col1, col2, col3, col4, col5 = st.columns([3, 2, 1.5, 1.5, 1.5])
with col1:
    project_name = st.text_input("Project Name")
with col2:
    customer     = st.text_input("Customer")
with col3:
    est_date     = st.date_input("Estimate Date", value=date.today())
with col4:
    est_by       = st.text_input("Estimated By")
with col5:
    reviewed_by  = st.text_input("Reviewed By")

st.divider()

# ─── TKO Table ────────────────────────────────────────────────────────────────
st.subheader("Window Takeoff (TKO)")
st.caption("Add one row per window type. All windows of the same dimensions and specs = one row.")

SYSTEM_TYPES  = ["SWR", "IGR", "SWR-IG", "SWR-VIG"]
FINISH_TYPES  = ["Painted", "Clear Anodized", "Black Anodized", "Mill Finish"]
COLORS        = ["Light", "Dark", "Custom"]
MOUNT_TYPES   = ["Overlap-mount", "Inset-mount"]
GLAZING_TYPES = ["VIG", "IG", "Monolithic"]

# Column headers
hcols = st.columns([1, 1.5, 1.2, 1.2, 0.8, 1.3, 1.2, 1.2, 1.5, 0.9, 0.9, 0.9, 1.3, 1.2, 0.6])
headers = ["Item #", "Name", "Width (in)", "Height (in)", "Qty",
           "System", "Finish", "Color", "Mount",
           "Head Ret.", "Sill Ret.", "Jamb Sp.",
           "Glazing Type", "Glaz. $/SF", ""]
for col, h in zip(hcols, headers):
    col.markdown(f"**{h}**")

rows_to_delete = []
for i, row in enumerate(st.session_state.tko_rows):
    cols = st.columns([1, 1.5, 1.2, 1.2, 0.8, 1.3, 1.2, 1.2, 1.5, 0.9, 0.9, 0.9, 1.3, 1.2, 0.6])
    with cols[0]:
        st.markdown(f"<div style='padding-top:8px'><b>{i+1}</b></div>", unsafe_allow_html=True)
    with cols[1]:
        row["item"] = st.text_input("", value=row["item"], key=f"item_{i}", label_visibility="collapsed")
    with cols[2]:
        row["width_in"] = st.number_input("", value=row["width_in"], min_value=0.0, step=0.25, key=f"w_{i}", label_visibility="collapsed")
    with cols[3]:
        row["height_in"] = st.number_input("", value=row["height_in"], min_value=0.0, step=0.25, key=f"h_{i}", label_visibility="collapsed")
    with cols[4]:
        row["qty"] = st.number_input("", value=row["qty"], min_value=0, step=1, key=f"qty_{i}", label_visibility="collapsed")
    with cols[5]:
        row["system"] = st.selectbox("", SYSTEM_TYPES, index=SYSTEM_TYPES.index(row["system"]), key=f"sys_{i}", label_visibility="collapsed")
    with cols[6]:
        row["finish"] = st.selectbox("", FINISH_TYPES, index=FINISH_TYPES.index(row["finish"]), key=f"fin_{i}", label_visibility="collapsed")
    with cols[7]:
        row["color"] = st.selectbox("", COLORS, index=COLORS.index(row["color"]), key=f"col_{i}", label_visibility="collapsed")
    with cols[8]:
        row["mount"] = st.selectbox("", MOUNT_TYPES, index=MOUNT_TYPES.index(row["mount"]), key=f"mnt_{i}", label_visibility="collapsed")
    with cols[9]:
        row["head_ret"] = st.checkbox("", value=row["head_ret"], key=f"hr_{i}", label_visibility="collapsed")
    with cols[10]:
        row["sill_ret"] = st.checkbox("", value=row["sill_ret"], key=f"sr_{i}", label_visibility="collapsed")
    with cols[11]:
        row["jamb_sp"] = st.checkbox("", value=row["jamb_sp"], key=f"js_{i}", label_visibility="collapsed")
    with cols[12]:
        row["glazing_type"] = st.selectbox("", GLAZING_TYPES, index=GLAZING_TYPES.index(row["glazing_type"]), key=f"gt_{i}", label_visibility="collapsed")
    with cols[13]:
        row["glazing_price"] = st.number_input("", value=row["glazing_price"], min_value=0.0, step=0.5, key=f"gp_{i}", label_visibility="collapsed")
    with cols[14]:
        if st.button("🗑", key=f"del_{i}") and len(st.session_state.tko_rows) > 1:
            rows_to_delete.append(i)

for i in reversed(rows_to_delete):
    st.session_state.tko_rows.pop(i)

col_add, col_clear = st.columns([1, 9])
with col_add:
    if st.button("➕ Add Row"):
        last = st.session_state.tko_rows[-1]
        st.session_state.tko_rows.append({
            "item": f"SWR-{len(st.session_state.tko_rows)+1}",
            "width_in": last["width_in"], "height_in": last["height_in"],
            "qty": 0, "system": last["system"], "finish": last["finish"],
            "color": last["color"], "mount": last["mount"],
            "head_ret": last["head_ret"], "sill_ret": last["sill_ret"],
            "jamb_sp": last["jamb_sp"], "glazing_type": last["glazing_type"],
            "glazing_price": last["glazing_price"]
        })
        st.rerun()

st.divider()

# ─── TKO Summary ──────────────────────────────────────────────────────────────
valid_rows = [r for r in st.session_state.tko_rows if r["qty"] > 0 and r["width_in"] > 0 and r["height_in"] > 0]

if valid_rows:
    st.subheader("TKO Summary")
    summary_data = []
    total_panels = 0
    total_area   = 0.0
    for r in valid_rows:
        w_ft   = r["width_in"] / 12
        h_ft   = r["height_in"] / 12
        area   = w_ft * h_ft * r["qty"]
        perim  = 2 * (w_ft + h_ft) * r["qty"]
        total_panels += r["qty"]
        total_area   += area
        summary_data.append({
            "Item":         r["item"],
            "W (in)":       r["width_in"],
            "H (in)":       r["height_in"],
            "Qty":          r["qty"],
            "Area (ft²)":   round(area, 2),
            "Perimeter (ft)": round(perim, 2),
            "System":       r["system"],
            "Glazing":      r["glazing_type"],
            "Mount":        r["mount"],
        })

    df = pd.DataFrame(summary_data)
    st.dataframe(df, use_container_width=True, hide_index=True)

    m1, m2, m3 = st.columns(3)
    m1.metric("Total Panels", total_panels)
    m2.metric("Total Area", f"{total_area:.1f} ft²")
    m3.metric("Avg Area/Panel", f"{total_area/total_panels:.2f} ft²" if total_panels else "—")

    st.divider()
    if st.button("▶ Calculate Materials", type="primary"):
        st.session_state.calc_done = True

    if st.session_state.get("calc_done"):
        totals = compute_tko_totals(valid_rows)
        materials = get_swr_materials(totals)

        st.subheader("Material Requirements")
        st.caption("Quantities needed for this project based on TKO input.")

        if not materials:
            st.warning("No materials calculated — check TKO input.")
        else:
            df_mat = pd.DataFrame(materials)[[
                "name", "supplier", "odoo_ref",
                "demand", "demand_unit",
                "purchase_qty", "cost_unit",
                "mat_cost", "ship_cost", "total_cost"
            ]]
            df_mat.columns = [
                "Material", "Supplier", "Odoo Ref",
                "Demand", "Demand Unit",
                "Purchase Qty", "Buy Unit",
                "Mat Cost ($)", "Ship Cost ($)", "Total Cost ($)"
            ]
            st.dataframe(df_mat, use_container_width=True, hide_index=True)

            total_mat  = sum(m["mat_cost"]   for m in materials)
            total_ship = sum(m["ship_cost"]  for m in materials)
            total_all  = sum(m["total_cost"] for m in materials)

            c1, c2, c3 = st.columns(3)
            c1.metric("Material Cost",  f"${total_mat:,.2f}")
            c2.metric("Shipping Cost",  f"${total_ship:,.2f}")
            c3.metric("Total Cost",     f"${total_all:,.2f}")

            st.divider()
            st.info("✅ Materials calculated. **Phase 3 — Odoo Inventory Check** coming next.")
else:
    st.info("👆 Enter at least one window type above (with width, height, and qty > 0) to see the summary.")
