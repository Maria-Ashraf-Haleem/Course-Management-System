"""
Create InstructorSchedule table if it does not exist (SQLite).
Run:
  python -m migrations.add_instructor_schedule_table
"""
from __future__ import annotations
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "database" / "dentist.db"

SQL_CREATE = (
    "CREATE TABLE IF NOT EXISTS InstructorSchedule ("
    " id INTEGER PRIMARY KEY AUTOINCREMENT,"
    " instructor_id INTEGER NOT NULL,"
    " title TEXT NOT NULL,"
    " type TEXT NOT NULL DEFAULT 'class',"
    " date DATETIME NOT NULL,"
    " start_time VARCHAR(10) NOT NULL,"
    " end_time VARCHAR(10) NOT NULL,"
    " location TEXT NOT NULL,"
    " description TEXT,"
    " attendees INTEGER DEFAULT 0,"
    " status TEXT NOT NULL DEFAULT 'scheduled',"
    " created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,"
    " updated_at DATETIME,"
    " FOREIGN KEY (instructor_id) REFERENCES Instructor(instructor_id)"
    ")"
)


def main() -> None:
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = ON;")
        cur.execute(SQL_CREATE)
        conn.commit()
        print("✓ Ensured table InstructorSchedule exists")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
