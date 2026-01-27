# app/db.py
from __future__ import annotations
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

try:
    # prefer configured URL if your core.config provides one
    from core.config import settings  # type: ignore
    DATABASE_URL = getattr(settings, "DATABASE_URL", None)
except Exception:
    settings = None  # type: ignore
    DATABASE_URL = None

if not DATABASE_URL:
    # sqlite in the backend folder (dentist.db)
    # adjust if you keep the db elsewhere
    DB_PATH = Path(__file__).resolve().parents[2] / "database" / "dentist.db"
    # DB_PATH = Path("D:/Dentist web (6)/Dentist web/database/dentist.db") # Hardcoded absolute path
    DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"
    # ...existing code...

# sqlite needs check_same_thread=False for FastAPI
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()

# FastAPI dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
