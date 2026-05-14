"""
Prompt Queens Content Generator — Streamlit UI
"""

import io
import zipfile
from datetime import datetime
from pathlib import Path

import pandas as pd
import streamlit as st

from core import (
    load_env,
    load_brand_voice,
    load_clip_model,
    get_pinecone_index,
    get_anthropic_client,
    format_product,
    product_display_name,
    search_products,
    call_claude,
    parse_sections,
    save_docx,
    SECTION_KEYS,
)

# ── Page config ───────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Prompt Queens Content Generator",
    page_icon="👑",
    layout="wide",
)

st.markdown("""
<style>
*, *::before, *::after { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
html, body, [class*="css"] {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
}
.main .block-container { padding-top: 2rem; max-width: 1000px; }
h1 { color: #1F3A5F; font-size: 1.8rem; font-weight: 700; margin-bottom: 0; }
h2 { color: #1F3A5F; font-size: 1.2rem; font-weight: 600; }
h3 { color: #333; font-size: 1rem; font-weight: 600; }
.stTabs [data-baseweb="tab"] { font-size: 0.9rem; font-weight: 500; }
.stButton > button {
    background-color: #1F3A5F;
    color: white;
    border-radius: 8px;
    border: none;
    padding: 0.5rem 1.5rem;
    font-weight: 600;
}
.stButton > button:hover { background-color: #2a4f7e; }
.product-card {
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 1rem 1.2rem;
    margin-bottom: 0.5rem;
    cursor: pointer;
}
.score-badge {
    background: #e8f4fd;
    color: #1D9BF0;
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 0.78rem;
    font-weight: 600;
}
.section-content {
    background: #fafafa;
    border-left: 3px solid #1F3A5F;
    border-radius: 0 8px 8px 0;
    padding: 1rem 1.2rem;
    margin-top: 0.5rem;
    white-space: pre-wrap;
    font-size: 0.9rem;
    line-height: 1.6;
}
.brand-voice-active {
    background: #edf7ed;
    color: #2e7d32;
    border-radius: 8px;
    padding: 0.4rem 0.8rem;
    font-size: 0.82rem;
    font-weight: 500;
}
.brand-voice-missing {
    background: #fff8e1;
    color: #856404;
    border-radius: 8px;
    padding: 0.4rem 0.8rem;
    font-size: 0.82rem;
    font-weight: 500;
}
</style>
""", unsafe_allow_html=True)

# ── Cached resources ──────────────────────────────────────────────────────────

load_env()

@st.cache_resource(show_spinner="Loading CLIP model...")
def get_clip():
    return load_clip_model()

@st.cache_resource(show_spinner="Connecting to Pinecone...")
def get_index():
    return get_pinecone_index()

@st.cache_resource
def get_claude():
    return get_anthropic_client()

clip_model, clip_processor = get_clip()
index = get_index()
claude_client = get_claude()
brand_voice = load_brand_voice()

# ── Header ────────────────────────────────────────────────────────────────────

col_title, col_bv = st.columns([3, 1])
with col_title:
    st.markdown("## 👑 Prompt Queens Content Generator")
    st.caption("Generate PDP copy, SEO keywords, social posts, email, headlines, paid ads, video scripts, creative briefs, and SWOT from your Salsify catalog.")

with col_bv:
    st.markdown("<br>", unsafe_allow_html=True)
    if brand_voice:
        st.markdown('<div class="brand-voice-active">✓ Brand voice loaded</div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="brand-voice-missing">⚠ No brand voice — add copy to brand_voice.txt</div>', unsafe_allow_html=True)

st.divider()

# ── Tabs ──────────────────────────────────────────────────────────────────────

tab_single, tab_batch = st.tabs(["Single Product", "Batch (CSV)"])

# ═════════════════════════════════════════════════════════════════════════════
# SINGLE PRODUCT TAB
# ═════════════════════════════════════════════════════════════════════════════

with tab_single:
    # Session state
    for key in ("matches", "chosen_idx", "sections", "product_summary", "product_name", "product_sku"):
        if key not in st.session_state:
            st.session_state[key] = None

    # ── Search ────────────────────────────────────────────────────────────────

    col_input, col_mode = st.columns([3, 1])
    with col_input:
        query = st.text_input(
            "Search",
            placeholder='e.g. "folding chair" or SKU XU-CH-10110-GG',
            label_visibility="collapsed",
        )
    with col_mode:
        mode = st.radio("Mode", ["Natural language", "Exact SKU"], horizontal=True, label_visibility="collapsed")

    sku_mode = (mode == "Exact SKU")

    col_search, col_top = st.columns([1, 1])
    with col_search:
        search_clicked = st.button("Search Catalog", use_container_width=True)
    with col_top:
        if sku_mode:
            top_k = 1
        else:
            top_k = st.slider("Results to show", 1, 10, 3, label_visibility="visible")

    if search_clicked and query:
        with st.spinner("Searching..."):
            matches = search_products(query, sku_mode, top_k, index, clip_model, clip_processor)
            st.session_state.matches = matches
            st.session_state.sku_mode = sku_mode
            st.session_state.last_query = query
            st.session_state.chosen_idx = None
            st.session_state.sections = None

    # ── Results ───────────────────────────────────────────────────────────────

    if st.session_state.matches == []:
        if st.session_state.get("sku_mode"):
            st.error(f"No product found for SKU **{st.session_state.get('last_query', '')}**. Check the SKU and try again.")
        else:
            st.warning("No results found. Try a different search term.")

    if st.session_state.matches:
        matches = st.session_state.matches
        if st.session_state.get("sku_mode"):
            st.success(f"Product found.")
        else:
            st.markdown(f"**{len(matches)} result{'s' if len(matches) != 1 else ''} found** — select a product to generate content.")

        chosen_idx = st.session_state.chosen_idx
        for i, m in enumerate(matches):
            meta = m.get("metadata", {})
            sku = meta.get("Product_Code", m["id"])
            name = product_display_name(meta, m["id"])
            score = m["score"]

            is_selected = (chosen_idx == i)
            border = "border: 2px solid #1F3A5F;" if is_selected else ""

            col_card, col_btn = st.columns([5, 1])
            with col_card:
                st.markdown(
                    f'<div class="product-card" style="{border}">'
                    f'<strong>{name}</strong><br>'
                    f'<span style="font-size:0.82rem;color:#666;">{sku}</span>&nbsp;&nbsp;'
                    f'<span class="score-badge">{score:.4f}</span>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
            with col_btn:
                if st.button("Select", key=f"select_{i}"):
                    st.session_state.chosen_idx = i
                    st.session_state.sections = None
                    st.rerun()

    # ── Generate ──────────────────────────────────────────────────────────────

    if st.session_state.chosen_idx is not None:
        chosen = st.session_state.matches[st.session_state.chosen_idx]
        meta = chosen.get("metadata", {})
        sku = meta.get("Product_Code", chosen["id"])
        name = product_display_name(meta, sku)
        product_summary = format_product(meta)

        st.session_state.product_sku = sku
        st.session_state.product_name = name
        st.session_state.product_summary = product_summary

        st.divider()
        st.markdown(f"**Selected:** {name} — `{sku}`")

        if st.button("Generate All Content", use_container_width=False):
            with st.spinner("Generating content with Claude..."):
                raw = call_claude(sku, product_summary, claude_client, brand_voice)
                st.session_state.sections = parse_sections(raw)
            st.rerun()

    # ── Content display ───────────────────────────────────────────────────────

    if st.session_state.sections:
        sections = st.session_state.sections
        sku = st.session_state.product_sku
        name = st.session_state.product_name
        product_summary = st.session_state.product_summary

        st.divider()
        st.markdown("### Generated Content")

        tabs = st.tabs(SECTION_KEYS)
        for tab, key in zip(tabs, SECTION_KEYS):
            with tab:
                text = sections.get(key, "")
                if text:
                    with st.container():
                        st.markdown(
                            '<style>.content-block{background:#fafafa;border-left:3px solid #1F3A5F;'
                            'border-radius:0 8px 8px 0;padding:1rem 1.2rem;margin-top:0.5rem;}</style>'
                            '<div class="content-block"></div>',
                            unsafe_allow_html=True,
                        )
                        st.markdown(text)
                else:
                    st.caption("No content generated for this section.")

        # Download
        st.divider()
        buf = io.BytesIO()
        save_docx(buf, name, sku, product_summary, sections)
        buf.seek(0)

        safe_sku = sku.replace("/", "-")
        st.download_button(
            label="Download Word Doc",
            data=buf.getvalue(),
            file_name=f"content_{safe_sku}.docx",
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

# ═════════════════════════════════════════════════════════════════════════════
# BATCH TAB
# ═════════════════════════════════════════════════════════════════════════════

with tab_batch:
    st.markdown("#### Batch Content Generation")
    st.caption("Upload a CSV with a `SKU` column (or `Query` for natural language). One row per product.")

    uploaded = st.file_uploader("Upload CSV", type=["csv"])

    if uploaded:
        df = pd.read_csv(uploaded)
        col_name = next((c for c in df.columns if c.strip().upper() in ("SKU", "QUERY", "SEARCH")), None)

        if col_name is None:
            st.error("CSV must have a column named `SKU` or `Query`.")
        else:
            sku_mode_batch = col_name.strip().upper() == "SKU"
            queries = df[col_name].dropna().astype(str).tolist()
            st.success(f"{len(queries)} products found in column `{col_name}`.")

            if st.button("Generate All", use_container_width=False):
                results = []
                errors = []

                progress = st.progress(0, text="Starting...")
                status_box = st.empty()

                for i, q in enumerate(queries):
                    progress.progress((i) / len(queries), text=f"Processing {i+1}/{len(queries)}: {q}")
                    status_box.info(f"Searching: **{q}**")

                    try:
                        matches = search_products(q, sku_mode_batch, 1, index, clip_model, clip_processor)
                        if not matches:
                            errors.append(f"{q}: no match found")
                            continue

                        chosen = matches[0]
                        meta = chosen.get("metadata", {})
                        sku = meta.get("Product_Code", chosen["id"])
                        name = product_display_name(meta, sku)
                        product_summary = format_product(meta)

                        status_box.info(f"Generating content for **{name}** (`{sku}`)...")
                        raw = call_claude(sku, product_summary, claude_client, brand_voice)
                        sections = parse_sections(raw)

                        buf = io.BytesIO()
                        save_docx(buf, name, sku, product_summary, sections)
                        buf.seek(0)

                        safe_sku = sku.replace("/", "-")
                        results.append((f"content_{safe_sku}.docx", buf.getvalue()))

                    except Exception as e:
                        errors.append(f"{q}: {e}")

                progress.progress(1.0, text="Done!")
                status_box.empty()

                if results:
                    zip_buf = io.BytesIO()
                    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
                        for filename, data in results:
                            zf.writestr(filename, data)
                    zip_buf.seek(0)

                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    st.success(f"Generated {len(results)} document{'s' if len(results) != 1 else ''}.")
                    st.download_button(
                        label=f"Download All ({len(results)} docs)",
                        data=zip_buf.getvalue(),
                        file_name=f"content_batch_{timestamp}.zip",
                        mime="application/zip",
                    )

                if errors:
                    with st.expander(f"{len(errors)} error(s)"):
                        for err in errors:
                            st.error(err)
    else:
        st.markdown("""
**CSV format:**
```
SKU
XU-CH-10110-GG
20-HA-MC705AF-3-BGE-GG
ABL-LE3-200-6
```
Or use a `Query` column for natural language searches.
""")
