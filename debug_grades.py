import sqlite3
import pandas as pd

# Connect to the database
conn = sqlite3.connect('database/dentist.db')
cursor = conn.cursor()

print("=== DATABASE INVESTIGATION ===")

# Check what tables exist
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print(f"Tables in database: {[t[0] for t in tables]}")

# Check SubmissionFeedback table structure
print("\n=== SubmissionFeedback Table ===")
try:
    cursor.execute("PRAGMA table_info(SubmissionFeedback);")
    schema = cursor.fetchall()
    print("Schema:", schema)
    
    cursor.execute("SELECT COUNT(*) FROM SubmissionFeedback;")
    count = cursor.fetchone()[0]
    print(f"Total records: {count}")
    
    if count > 0:
        cursor.execute("SELECT * FROM SubmissionFeedback LIMIT 5;")
        sample = cursor.fetchall()
        print("Sample data:", sample)
        
        cursor.execute("SELECT grade FROM SubmissionFeedback WHERE grade IS NOT NULL AND grade > 0 LIMIT 5;")
        grades = cursor.fetchall()
        print("Sample grades > 0:", grades)
except Exception as e:
    print(f"SubmissionFeedback error: {e}")

# Check Submission table
print("\n=== Submission Table ===")
try:
    cursor.execute("PRAGMA table_info(Submission);")
    schema = cursor.fetchall()
    print("Schema:", schema)
    
    cursor.execute("SELECT COUNT(*) FROM Submission;")
    count = cursor.fetchone()[0]
    print(f"Total records: {count}")
    
    if count > 0:
        cursor.execute("SELECT submission_id, student_id, assignment_id, status FROM Submission LIMIT 5;")
        sample = cursor.fetchall()
        print("Sample data:", sample)
except Exception as e:
    print(f"Submission error: {e}")

# Check if grades might be stored in Submission table instead
print("\n=== Checking for grades in Submission table ===")
try:
    cursor.execute("SELECT * FROM Submission WHERE submission_id = 1;")
    sample = cursor.fetchone()
    print("Sample submission record:", sample)
except Exception as e:
    print(f"Error: {e}")

# Check Student table
print("\n=== Student Table ===")
try:
    cursor.execute("SELECT COUNT(*) FROM Student;")
    count = cursor.fetchone()[0]
    print(f"Total students: {count}")
    
    cursor.execute("SELECT student_id, full_name FROM Student LIMIT 3;")
    students = cursor.fetchall()
    print("Sample students:", students)
except Exception as e:
    print(f"Student error: {e}")

# Check Course table
print("\n=== Course Table ===")
try:
    cursor.execute("SELECT COUNT(*) FROM Course;")
    count = cursor.fetchone()[0]
    print(f"Total courses: {count}")
    
    cursor.execute("SELECT course_id, title, created_by FROM Course LIMIT 3;")
    courses = cursor.fetchall()
    print("Sample courses:", courses)
except Exception as e:
    print(f"Course error: {e}")

# Check Assignment table
print("\n=== Assignment Table ===")
try:
    cursor.execute("SELECT COUNT(*) FROM Assignment;")
    count = cursor.fetchone()[0]
    print(f"Total assignments: {count}")
    
    cursor.execute("SELECT assignment_id, title, course_id FROM Assignment LIMIT 3;")
    assignments = cursor.fetchall()
    print("Sample assignments:", assignments)
except Exception as e:
    print(f"Assignment error: {e}")

# Check Instructor table
print("\n=== Instructor Table ===")
try:
    cursor.execute("SELECT COUNT(*) FROM Instructor;")
    count = cursor.fetchone()[0]
    print(f"Total instructors: {count}")
    
    cursor.execute("SELECT instructor_id, user_id, full_name FROM Instructor LIMIT 3;")
    instructors = cursor.fetchall()
    print("Sample instructors:", instructors)
except Exception as e:
    print(f"Instructor error: {e}")

conn.close()
print("\n=== INVESTIGATION COMPLETE ===")
