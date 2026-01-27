"""
Add missing extended profile columns to Instructor table for SQLite.
Safe to run multiple times.

Run:
  python -m migrations.add_instructor_profile_columns
"""
from __future__ import annotations
import sqlite3
from pathlib import Path

# Match the logic in app.db: project_root / "database" / "dentist.db"
# This file lives at backend/migrations/*.py, so parents[2] -> project root
DB_PATH = Path(__file__).resolve().parents[2] / "database" / "dentist.db"

COLUMNS = [
    ("phone", "TEXT"),
    ("specialization", "TEXT"),
    ("department", "TEXT"),
    ("license_number", "TEXT"),
    ("years_of_experience", "INTEGER"),
    ("address", "TEXT"),
    ("join_date", "DATETIME"),
    ("education_json", "TEXT"),
    ("certifications_json", "TEXT"),
    ("profile_data_json", "TEXT"),
]

def column_exists(cur: sqlite3.Cursor, table: str, column: str) -> bool:
    cur.execute(f"PRAGMA table_info({table});")
    return any(row[1] == column for row in cur.fetchall())


def main() -> None:
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = ON;")
        for col, coltype in COLUMNS:
            if not column_exists(cur, "Instructor", col):
                sql = f"ALTER TABLE Instructor ADD COLUMN {col} {coltype}"
                try:
                    cur.execute(sql)
                    print(f"✓ Added column {col} {coltype}")
                except sqlite3.Error as e:
                    print(f"! Failed to add column {col}: {e}")
        conn.commit()
        print("Done.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
