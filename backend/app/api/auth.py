# app/routers/auth.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas

try:
    from core.config import settings  # type: ignore
    SECRET_KEY = getattr(settings, "SECRET_KEY", "dev-secret-change-me")
    ALGORITHM = getattr(settings, "ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 8 * 60))
except Exception:
    SECRET_KEY = "dev-secret-change-me"
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 8 * 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/auth", tags=["auth"])

# --- utils ---
def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def create_access_token(sub: int, role: str, username: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(sub),
        "role": role,
        "username": username,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# --- endpoints ---
@router.post("/register", response_model=schemas.UserRead, status_code=201)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    # unique username/email
    exists = db.query(models.User).filter(
        (models.User.username == user_in.username) | (models.User.email == user_in.email)
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Username or email already registered")

    user = models.User(
        username=user_in.username.strip(),
        email=user_in.email.lower(),
        password_hash=hash_password(user_in.password),
        role=user_in.role.lower(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user  # pydantic v2 from_attributes enabled in schemas.UserRead

@router.post("/login", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Accepts form-urlencoded: username, password.
    'username' may be actual username OR email.
    Returns: { access_token, token_type }
    """
    u = db.query(models.User).filter(models.User.username == form.username).first()
    if not u:
        u = db.query(models.User).filter(models.User.email == form.username).first()
    if not u or not verify_password(form.password, u.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_access_token(sub=u.id, role=u.role, username=u.username)
    return schemas.Token(access_token=token)
