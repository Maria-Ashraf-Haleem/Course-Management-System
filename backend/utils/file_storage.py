import os
from typing import Iterable
from fastapi import UploadFile, HTTPException
from core.config import settings   # CHANGED

UPLOAD_DIR = settings.UPLOAD_DIR
ALLOWED_EXTS = set(x.lower() for x in settings.ALLOWED_FILE_TYPES)
MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024

os.makedirs(UPLOAD_DIR, exist_ok=True)

def _ensure_ext(filename: str):
    ext = os.path.splitext(filename)[1].lower()
    if ALLOWED_EXTS and ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed")

def _ensure_size(size: int):
    if size and size > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large (>{settings.MAX_FILE_SIZE_MB} MB)")

async def save_upload(file: UploadFile, subdir: str = "") -> str:
    _ensure_ext(file.filename)
    os.makedirs(os.path.join(UPLOAD_DIR, subdir), exist_ok=True)
    target = os.path.join(UPLOAD_DIR, subdir, file.filename)
    data = await file.read()
    _ensure_size(len(data))
    with open(target, "wb") as f:
        f.write(data)
    return target
