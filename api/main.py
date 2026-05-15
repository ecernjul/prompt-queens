"""
Prompt Queens — FastAPI backend
Serves the React SPA and exposes JSON endpoints for search, generation, and download.
"""

import io
import logging
import os
import re
import secrets
import time
import zipfile
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import asyncio

from core import (
    load_env,
    load_brand_voice,
    load_clip_model,
    get_pinecone_index,
    get_anthropic_client,
    format_product,
    product_display_name,
    search_products,
    fetch_product_by_sku,
    call_claude,
    parse_sections,
    save_docx,
    generate_concept_image,
    SECTION_KEYS,
)

logger = logging.getLogger(__name__)

# ── Environment ───────────────────────────────────────────────────────────────

load_env()

APP_USERNAME = os.environ.get("APP_USERNAME", "")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")

# CRITICAL: Refuse to start without credentials set.
if not APP_USERNAME or not APP_PASSWORD:
    raise RuntimeError(
        "APP_USERNAME and APP_PASSWORD must both be set as environment variables. "
        "Refusing to start without authentication configured."
    )

# ── Rate limiter (in-memory, per IP) ─────────────────────────────────────────

_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60   # seconds
_RATE_MAX    = 5    # attempts per window


def _check_login_rate(ip: str) -> None:
    now = time.monotonic()
    # Prune attempts outside the window
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _RATE_WINDOW]
    if len(_login_attempts[ip]) >= _RATE_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait a minute and try again.",
            headers={"Retry-After": "60"},
        )
    _login_attempts[ip].append(now)


# ── Shared resources (loaded once at startup) ─────────────────────────────────

_resources: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_env()
    _resources["clip_model"], _resources["clip_processor"] = load_clip_model()
    _resources["index"] = get_pinecone_index()
    _resources["claude"] = get_anthropic_client()
    _resources["brand_voice"] = load_brand_voice()
    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Prompt Queens API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic()

# ── Limits ────────────────────────────────────────────────────────────────────

MAX_BATCH   = 50
MAX_TOP_K   = 20
MAX_QUERY_LEN = 500


# ── Auth ──────────────────────────────────────────────────────────────────────

def verify_credentials(credentials: Annotated[HTTPBasicCredentials, Depends(security)]):
    correct_username = secrets.compare_digest(credentials.username, APP_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, APP_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


def _safe_filename(raw: str) -> str:
    """Whitelist-sanitize a string for use in a Content-Disposition filename."""
    return re.sub(r"[^A-Za-z0-9_\-]", "_", raw)


# ── Pydantic models ───────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class SearchRequest(BaseModel):
    query: str = Field(max_length=MAX_QUERY_LEN)
    sku_mode: bool = False
    top_k: int = Field(default=3, ge=1, le=MAX_TOP_K)


class GenerateRequest(BaseModel):
    # vector_id is the real Pinecone record ID (may differ from Product_Code/SKU).
    # The SKU is kept for display/logging only.
    vector_id: str = Field(max_length=500)
    sku: str = Field(max_length=100)


class BatchItem(BaseModel):
    query: str = Field(max_length=MAX_QUERY_LEN)
    sku_mode: bool = False


class DownloadRequest(BaseModel):
    sku: str = Field(max_length=100)
    name: str = Field(max_length=500)
    product_summary: str = Field(max_length=10_000)
    sections: dict[str, str]


class BatchRequestFull(BaseModel):
    items: list[BatchItem] = Field(max_length=MAX_BATCH)


class ImageRequest(BaseModel):
    concept_title: str = Field(max_length=200)
    concept_description: str = Field(max_length=2000)
    product_name: str = Field(max_length=500)
    product_image_url: str = Field(default="", max_length=2000)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: LoginRequest, request: Request):
    # Rate-limit by client IP before touching credentials.
    client_ip = request.client.host if request.client else "unknown"
    _check_login_rate(client_ip)

    ok_user = secrets.compare_digest(body.username, APP_USERNAME)
    ok_pass = secrets.compare_digest(body.password, APP_PASSWORD)
    if not (ok_user and ok_pass):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    # Clear rate-limit record on successful login.
    _login_attempts.pop(client_ip, None)
    return {"ok": True}


@app.post("/api/search")
def search(body: SearchRequest, _: str = Depends(verify_credentials)):
    matches = search_products(
        body.query,
        body.sku_mode,
        body.top_k,
        _resources["index"],
        _resources["clip_model"],
        _resources["clip_processor"],
    )
    results = []
    for m in matches:
        meta = m.get("metadata", {})
        results.append(
            {
                "vector_id": m["id"],           # actual Pinecone record ID — used for fetch
                "score": m["score"],
                "sku": meta.get("Product_Code", m["id"]),   # display / label only
                "name": product_display_name(meta, m["id"]),
                "summary": format_product(meta),
            }
        )
    return {"results": results}


@app.post("/api/generate")
def generate(body: GenerateRequest, _: str = Depends(verify_credentials)):
    # Re-fetch product data server-side — never trust client-provided content
    # to prevent prompt injection via the product_summary field.
    product_summary, product_name, product_image_urls = fetch_product_by_sku(
        body.vector_id, _resources["index"]
    )
    if not product_summary:
        raise HTTPException(status_code=404, detail=f"SKU '{body.sku}' not found in catalog")

    raw = call_claude(
        body.sku,
        product_summary,
        _resources["claude"],
        _resources["brand_voice"],
    )
    sections = parse_sections(raw)
    return {
        "sections": sections,
        "section_keys": SECTION_KEYS,
        "product_summary": product_summary,
        "product_name": product_name,
        "product_image_urls": product_image_urls,  # [] if none found in metadata
    }


@app.post("/api/download-doc")
def download_doc(body: DownloadRequest, _: str = Depends(verify_credentials)):
    buf = io.BytesIO()
    save_docx(buf, body.name, body.sku, body.product_summary, body.sections)
    buf.seek(0)
    safe_sku = _safe_filename(body.sku)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="content_{safe_sku}.docx"'},
    )


@app.post("/api/generate-image")
async def generate_image(body: ImageRequest, _: str = Depends(verify_credentials)):
    """
    Generate a product photography image for a Creative Brief concept via Higgsfield.
    Runs the blocking SDK call in a thread pool so it doesn't stall the event loop.
    """
    try:
        image_url = await asyncio.to_thread(
            generate_concept_image,
            body.concept_title,
            body.concept_description,
            body.product_name,
            body.product_image_url,
        )
        return {"image_url": image_url}
    except Exception as e:
        # Temporarily exposing full error for debugging — remove once image gen is stable
        logger.exception("Image generation failed for concept: %s", body.concept_title)
        raise HTTPException(status_code=502, detail=f"Image generation failed: {e}")


@app.post("/api/batch")
def batch(body: BatchRequestFull, _: str = Depends(verify_credentials)):
    results = []
    errors = []

    for item in body.items:
        try:
            matches = search_products(
                item.query,
                item.sku_mode,
                1,
                _resources["index"],
                _resources["clip_model"],
                _resources["clip_processor"],
            )
            if not matches:
                errors.append({"query": item.query, "error": "No match found"})
                continue
            m = matches[0]
            meta = m.get("metadata", {})
            sku = meta.get("Product_Code", m["id"])
            name = product_display_name(meta, sku)
            summary = format_product(meta)
            raw = call_claude(sku, summary, _resources["claude"], _resources["brand_voice"])
            sections = parse_sections(raw)
            results.append({"sku": sku, "name": name, "summary": summary, "sections": sections})
        except Exception:
            logger.exception("Batch item failed for query: %s", item.query)
            errors.append({"query": item.query, "error": "Processing failed — check server logs"})

    # Build zip
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for r in results:
            doc_buf = io.BytesIO()
            save_docx(doc_buf, r["name"], r["sku"], r["summary"], r["sections"])
            doc_buf.seek(0)
            safe_sku = _safe_filename(r["sku"])
            zf.writestr(f"content_{safe_sku}.docx", doc_buf.getvalue())
    zip_buf.seek(0)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="content_batch_{timestamp}.zip"'},
    )


# ── Static files (React SPA) — must come last ─────────────────────────────────

DIST = Path(__file__).parent.parent / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="spa")
