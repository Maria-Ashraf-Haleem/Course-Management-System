#!/usr/bin/env python3
"""
Comprehensive Database Data Clearing Script
==========================================

This script clears ALL data from the database while preserving table structure.
It handles all tables in the correct dependency order to avoid foreign key conflicts.

Tables cleared (in dependency order):
1. Child tables first (AnnouncementReadReceipt, SubmissionFeedback, etc.)
2. Parent tables last (User, Student, Instructor, etc.)

Usage:
    python clear_all_data.py

Features:
- Creates automatic backup before clearing
- Handles foreign key constraints properly
- Resets auto-increment counters
- Provides detailed logging
- Verification of cleanup
"""

import sqlite3
import os
import shutil
from datetime import datetime
from pathlib import Path

def create_backup(db_path):
    """Create a timestamped backup of the database"""
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return None
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.backup_{timestamp}"
    
    try:
        shutil.copy2(db_path, backup_path)
        print(f"✅ Backup created: {backup_path}")
        return backup_path
    except Exception as e:
        print(f"❌ Backup failed: {e}")
        return None

def get_table_counts(cursor):
    """Get current record counts for all tables"""
    tables = [
        "AnnouncementReadReceipt", "SubmissionFeedback", "SubmissionFile", "Submission",
        "LectureAttendance", "Lecture", "QuizEntry", "CourseEnrollment", 
        "Assignment", "Course", "Student", "Instructor", "InstructorSchedule",
        "Announcement", "users", "Department", "AssignmentType"
    ]
    
    counts = {}
    for table in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            counts[table] = cursor.fetchone()[0]
        except sqlite3.Error:
            counts[table] = "N/A (table doesn't exist)"
    
    return counts

def clear_all_data():
    """Clear all data from the database while preserving structure"""
    
    # Database path
    db_path = 'database/dentist.db'
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return False
    
    print("🗑️  COMPREHENSIVE DATABASE DATA CLEARING")
    print("=" * 60)
    
    # Create backup
    backup_path = create_backup(db_path)
    if not backup_path:
        return False
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("\n📊 Current data counts:")
        initial_counts = get_table_counts(cursor)
        for table, count in initial_counts.items():
            if count != "N/A (table doesn't exist)":
                print(f"  {table}: {count} records")
        
        print("\n🧹 Starting data clearing process...")
        
        # Disable foreign key constraints temporarily
        cursor.execute("PRAGMA foreign_keys = OFF")
        
        # Define tables in dependency order (children first, parents last)
        # This order ensures foreign key constraints are respected
        tables_to_clear = [
            # Child tables first
            "AnnouncementReadReceipt",    # References Announcement, Student
            "SubmissionFeedback",          # References Submission
            "SubmissionFile",              # References Submission
            "Submission",                  # References Assignment, Student
            "LectureAttendance",          # References Lecture, Student
            "Lecture",                    # References Course, Instructor
            "QuizEntry",                  # References Instructor, Student, Course
            "CourseEnrollment",           # References Course, Student
            "Assignment",                 # References Course, Instructor, AssignmentType, Department
            "InstructorSchedule",         # References Instructor
            "Announcement",               # References Instructor
            "Lecture",                    # References Course, Instructor (if not already cleared)
            
            # Parent tables last
            "Student",                    # References User (optional)
            "Instructor",                 # References User
            "Course",                     # References Instructor
            "users",                      # Base user table
            "Department",                 # Master data
            "AssignmentType"              # Master data
        ]
        
        # Remove duplicates while preserving order
        seen = set()
        unique_tables = []
        for table in tables_to_clear:
            if table not in seen:
                seen.add(table)
                unique_tables.append(table)
        
        cleared_count = 0
        total_cleared = 0
        
        for table in unique_tables:
            try:
                # Check if table exists
                cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
                if not cursor.fetchone():
                    print(f"⏭️  {table}: Table doesn't exist, skipping")
                    continue
                
                # Get count before clearing
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                
                if count > 0:
                    # Clear the table
                    cursor.execute(f"DELETE FROM {table}")
                    print(f"✅ {table}: Cleared {count} records")
                    total_cleared += count
                else:
                    print(f"ℹ️  {table}: Already empty")
                
                cleared_count += 1
                
            except sqlite3.Error as e:
                print(f"❌ {table}: Error clearing - {e}")
        
        print(f"\n📈 Summary: Cleared {cleared_count} tables, {total_cleared} total records")
        
        # Reset auto-increment counters for all tables
        print("\n🔄 Resetting auto-increment counters...")
        try:
            cursor.execute("DELETE FROM sqlite_sequence")
            print("✅ Auto-increment counters reset")
        except sqlite3.Error as e:
            print(f"ℹ️  Note: Could not reset auto-increment counters: {e}")
        
        # Re-enable foreign key constraints
        cursor.execute("PRAGMA foreign_keys = ON")
        
        # Commit all changes
        conn.commit()
        print("\n✅ All changes committed successfully!")
        
        # Verify cleanup
        print("\n🔍 Verification - Final counts:")
        final_counts = get_table_counts(cursor)
        all_empty = True
        
        for table, count in final_counts.items():
            if count != "N/A (table doesn't exist)":
                status = "✅" if count == 0 else "❌"
                print(f"  {status} {table}: {count} records")
                if count > 0:
                    all_empty = False
        
        if all_empty:
            print("\n🎉 SUCCESS: All data cleared! Database is clean and ready for new data.")
        else:
            print("\n⚠️  WARNING: Some tables still contain data. Check the output above.")
        
        # VACUUM to reclaim space
        print("\n🧹 Optimizing database...")
        try:
            cursor.execute("VACUUM")
            print("✅ Database optimized")
        except sqlite3.Error as e:
            print(f"ℹ️  Note: VACUUM failed: {e}")
        
        return True
        
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        conn.rollback()
        return False
        
    finally:
        conn.close()

def main():
    """Main execution function"""
    print("🚀 Starting comprehensive database data clearing...")
    print("⚠️  This will delete ALL data while preserving table structure.")
    print("📁 A backup will be created automatically.")
    
    # Ask for confirmation
    response = input("\n🤔 Are you sure you want to clear ALL data? (yes/no): ").lower().strip()
    
    if response in ['yes', 'y']:
        success = clear_all_data()
        if success:
            print("\n🎯 Database clearing completed successfully!")
            print("💡 You can now add your new test data.")
        else:
            print("\n💥 Database clearing failed. Check the error messages above.")
    else:
        print("\n❌ Operation cancelled by user.")

if __name__ == "__main__":
    main()
