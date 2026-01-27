import sqlite3
import shutil

# Create backup first
shutil.copy2('database/dentist.db', 'database/dentist.db.backup')
print("Backup created: database/dentist.db.backup")

# Connect and clear data
conn = sqlite3.connect('database/dentist.db')
cursor = conn.cursor()

# Disable foreign keys temporarily
cursor.execute("PRAGMA foreign_keys = OFF")

# Clear tables in order
tables = [
    'AnnouncementReadReceipt',
    'SubmissionFeedback', 
    'Submission',
    'CourseEnrollment',
    'Assignment',
    'Course',
    'Student',
    'Announcement'
]

for table in tables:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = cursor.fetchone()[0]
        if count > 0:
            cursor.execute(f"DELETE FROM {table}")
            print(f"Cleared {count} records from {table}")
        else:
            print(f"{table} was already empty")
    except Exception as e:
        print(f"Error with {table}: {e}")

# Reset auto-increment counters
for table in tables:
    try:
        cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}'")
    except:
        pass

# Re-enable foreign keys and commit
cursor.execute("PRAGMA foreign_keys = ON")
conn.commit()
conn.close()

print("\n✅ Database cleared successfully!")
print("All test data removed. You can now add real students and data.")
