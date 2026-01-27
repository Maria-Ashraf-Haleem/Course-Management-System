# Backend (FastAPI) — Dev DB quickstart

## Initialize or reset the SQLite dev database

If you deleted or are creating the DB for the first time, run:

```powershell
cd .\backend
$code = @'
from app.db import Base, engine
import app.models  # register models
Base.metadata.create_all(bind=engine)
print("DB initialized:", engine.url)
'@
Set-Content -Path .\init_db.py -Value $code
python .\init_db.py
```

Optional: peek tables/columns
```powershell
$peek = @'
from sqlalchemy import text
from app.db import engine
with engine.connect() as conn:
    print("tables:", conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'" )).fetchall())
    print("user_cols:", conn.execute(text("PRAGMA table_info([User]);")).fetchall())
'@
Set-Content -Path .\peek_db.py -Value $peek
python .\peek_db.py
```

## Required packages

```powershell
pip install passlib[bcrypt] email-validator python-multipart
```

## Start the API

```powershell
uvicorn app.main:app --reload --port 8000
```

## Test auth endpoints

Register (JSON):
```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/auth/register -ContentType 'application/json' -Body '{"username":"u1","email":"u1@example.com","password":"P@ssw0rd!","role":"student"}'
```

Login (form):
```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/auth/login -ContentType 'application/x-www-form-urlencoded' -Body 'username=u1&password=P@ssw0rd!'
```
