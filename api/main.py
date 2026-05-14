"""
Prompt Queens — FastAPI backend
Serves the React SPA and exposes JSON endpoints for search, generation, and download.
"""

import io
import os
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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

# ── Environment ───────────────────────────────────────────────────────────────

load_env()

APP_USERNAME = os.environ.get("APP_USERNAME", "admin")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")

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


# ── Auth ──────────────────────────────────────────────────────────────────────

def verify_credentials(credentials: Annotated[HTTPBasicCredentials, Depends(security)]):
    import secrets
    correct_username = secrets.compare_digest(credentials.username, APP_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, APP_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


# ── Pydantic models ───────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class SearchRequest(BaseModel):
    query: str
    sku_mode: bool = False
    top_k: int = 3


class GenerateRequest(BaseModel):
    sku: str
    product_summary: str


class BatchItem(BaseModel):
    query: str
    sku_mode: bool = False


class BatchRequest(BaseModel):
    items: list[BatchItem]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: LoginRequest):
    import secrets
    ok_user = secrets.compare_digest(body.username, APP_USERNAME)
    ok_pass = secrets.compare_digest(body.password, APP_PASSWORD)
    if not (ok_user and ok_pass):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
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
                "id": m["id"],
                "score": m["score"],
                "sku": meta.get("Product_Code", m["id"]),
                "name": product_display_name(meta, m["id"]),
                "summary": format_product(meta),
            }
        )
    return {"results": results}


@app.post("/api/generate")
def generate(body: GenerateRequest, _: str = Depends(verify_credentials)):
    raw = call_claude(
        body.sku,
        body.product_summary,
        _resources["claude"],
        _resources["brand_voice"],
    )
    sections = parse_sections(raw)
    return {"sections": sections, "section_keys": SECTION_KEYS}


@app.post("/api/download")
def download(body: GenerateRequest, _: str = Depends(verify_credentials)):
    # body.sku and body.product_summary are reused; we also need sections
    # Client sends sku + product_summary + sections in a combined payload
    raise HTTPException(status_code=400, detail="Use /api/download-doc instead")


class DownloadRequest(BaseModel):
    sku: str
    name: str
    product_summary: str
    sections: dict[str, str]


@app.post("/api/download-doc")
def download_doc(body: DownloadRequest, _: str = Depends(verify_credentials)):
    buf = io.BytesIO()
    save_docx(buf, body.name, body.sku, body.product_summary, body.sections)
    buf.seek(0)
    safe_sku = body.sku.replace("/", "-")
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="content_{safe_sku}.docx"'},
    )


class BatchRequestFull(BaseModel):
    items: list[BatchItem]


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
        except Exception as e:
            errors.append({"query": item.query, "error": str(e)})

    # Build zip
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for r in results:
            doc_buf = io.BytesIO()
            save_docx(doc_buf, r["name"], r["sku"], r["summary"], r["sections"])
            doc_buf.seek(0)
            safe_sku = r["sku"].replace("/", "-")
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
