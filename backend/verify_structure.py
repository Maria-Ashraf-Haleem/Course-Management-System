#!/usr/bin/env python3
"""
Verify Database Structure
========================
Quick script to verify that all tables still exist after data clearing.
"""

import sqlite3
import os

def verify_database_structure():
    """Verify that all expected tables still exist"""
    db_path = '../database/dentist.db'
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        print("📋 Tables found in database:")
        for table in sorted(tables):
            print(f"  ✅ {table}")
        
        # Expected tables based on models.py (note: User model maps to 'users' table)
        expected_tables = [
            "AnnouncementReadReceipt", "SubmissionFeedback", "SubmissionFile", "Submission",
            "LectureAttendance", "Lecture", "QuizEntry", "CourseEnrollment", 
            "Assignment", "InstructorSchedule", "Announcement", "Student", 
            "Instructor", "Course", "users", "Department", "AssignmentType"
        ]
        
        print(f"\n📊 Found {len(tables)} tables total")
        print(f"📊 Expected {len(expected_tables)} tables")
        
        # Check for missing tables
        missing = set(expected_tables) - set(tables)
        if missing:
            print(f"\n⚠️  Missing tables: {missing}")
        else:
            print("\n✅ All expected tables are present!")
        
        # Check for extra tables
        extra = set(tables) - set(expected_tables)
        if extra:
            print(f"\nℹ️  Additional tables: {extra}")
        
        return len(missing) == 0
        
    except Exception as e:
        print(f"❌ Error verifying structure: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    print("🔍 Verifying database structure...")
    success = verify_database_structure()
    if success:
        print("\n🎉 Database structure is intact!")
    else:
        print("\n❌ Database structure verification failed!")
