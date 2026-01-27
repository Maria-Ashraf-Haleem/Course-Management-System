#!/usr/bin/env python3
"""
Migration: Add attachment fields to Assignment table
===================================================
Adds attachment_file_path and attachment_file_name fields to store PDF attachments.
"""

import sqlite3
import os
from pathlib import Path

def migrate():
    """Add attachment fields to Assignment table"""
    db_path = Path("../database/dentist.db")
    
    if not db_path.exists():
        print(f"❌ Database file not found: {db_path}")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("🔄 Adding attachment fields to Assignment table...")
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(Assignment)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if "attachment_file_path" not in columns:
            cursor.execute("""
                ALTER TABLE Assignment 
                ADD COLUMN attachment_file_path TEXT
            """)
            print("✅ Added attachment_file_path column")
        else:
            print("ℹ️  attachment_file_path column already exists")
        
        if "attachment_file_name" not in columns:
            cursor.execute("""
                ALTER TABLE Assignment 
                ADD COLUMN attachment_file_name TEXT
            """)
            print("✅ Added attachment_file_name column")
        else:
            print("ℹ️  attachment_file_name column already exists")
        
        conn.commit()
        print("✅ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    print("🚀 Starting migration: Add assignment attachment fields")
    success = migrate()
    if success:
        print("🎉 Migration completed!")
    else:
        print("💥 Migration failed!")

