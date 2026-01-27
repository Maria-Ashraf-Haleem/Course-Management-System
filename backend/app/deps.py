# app/deps.py
from __future__ import annotations
from datetime import datetime, timezone
from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.db import get_db
from app import models

# The login endpoint is /auth/login (form-urlencoded)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# pull settings if available, but keep safe fallbacks
try:
    from core.config import settings  # type: ignore
    SECRET_KEY = getattr(settings, "SECRET_KEY", "dev-secret-change-me")
    ALGORITHM = getattr(settings, "ALGORITHM", "HS256")
except Exception:
    SECRET_KEY = "dev-secret-change-me"
    ALGORITHM = "HS256"

def _decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # optional exp check (jose handles it if 'exp' present)
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> models.User:
    payload = _decode_token(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    try:
        user_id = int(sub)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token subject")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_current_active_user(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    # add extra checks here if you later add 'is_active' etc.
    return current_user
