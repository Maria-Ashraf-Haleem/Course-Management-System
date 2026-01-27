import sqlite3
import os

def clear_database():
    """Clear all test data from the database while preserving structure"""
    
    db_path = 'database/dentist.db'
    
    if not os.path.exists(db_path):
        print(f"Database file not found: {db_path}")
        return
    
    # Create backup first
    backup_path = f"{db_path}.backup"
    import shutil
    shutil.copy2(db_path, backup_path)
    print(f"Backup created: {backup_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Starting database cleanup...")
        
        # Disable foreign key constraints temporarily
        cursor.execute("PRAGMA foreign_keys = OFF")
        
        # Clear data in dependency order (child tables first)
        tables_to_clear = [
            "AnnouncementReadReceipt",
            "SubmissionFeedback", 
            "Submission",
            "CourseEnrollment",
            "Assignment",
            "Course",
            "Student",
            "Announcement",
            "Instructor"
        ]
        
        for table in tables_to_clear:
            try:
                # Check if table exists and has data
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                
                if count > 0:
                    cursor.execute(f"DELETE FROM {table}")
                    print(f"Cleared {count} records from {table}")
                else:
                    print(f"{table} was already empty")
                    
            except sqlite3.Error as e:
                print(f"Error clearing {table}: {e}")
        
        # Reset auto-increment counters
        reset_tables = [
            "Student", "Course", "Assignment", "Submission", 
            "SubmissionFeedback", "CourseEnrollment", "Instructor", 
            "Announcement", "AnnouncementReadReceipt"
        ]
        
        for table in reset_tables:
            try:
                cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}'")
                print(f"Reset auto-increment for {table}")
            except sqlite3.Error as e:
                print(f"Note: Could not reset auto-increment for {table}: {e}")
        
        # Re-enable foreign key constraints
        cursor.execute("PRAGMA foreign_keys = ON")
        
        # Commit all changes
        conn.commit()
        print("\n✅ Database cleanup completed successfully!")
        
        # Verify cleanup
        print("\nVerifying cleanup:")
        for table in tables_to_clear:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                print(f"  {table}: {count} records")
            except sqlite3.Error:
                pass
                
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
        conn.rollback()
        
    finally:
        conn.close()

def preserve_admin_user():
    """Preserve admin/instructor users while clearing student data"""
    db_path = 'database/dentist.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if there are any users we should preserve
        cursor.execute("SELECT id, username, role FROM users WHERE role != 'student'")
        admin_users = cursor.fetchall()
        
        if admin_users:
            print(f"\nFound {len(admin_users)} non-student users:")
            for user in admin_users:
                print(f"  ID: {user[0]}, Username: {user[1]}, Role: {user[2]}")
            print("These users will be preserved.")
        
    except sqlite3.Error as e:
        print(f"Error checking users: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    print("🗑️  Database Cleanup Tool")
    print("=" * 50)
    
    # Show what will be preserved
    preserve_admin_user()
    
    # Ask for confirmation
    response = input("\n⚠️  This will delete ALL student data, submissions, grades, and courses. Continue? (yes/no): ")
    
    if response.lower() in ['yes', 'y']:
        clear_database()
        print("\n🎉 Database is now clean and ready for real data!")
        print("You can now add your actual students, courses, and assignments.")
    else:
        print("❌ Operation cancelled.")
