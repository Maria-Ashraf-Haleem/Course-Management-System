import sqlite3
con = sqlite3.connect(r".\database\dentist.db")
cur = con.cursor()

print("=== DEBUGGING STUDENT ENROLLMENTS ===")

# Check Students table
print("\n1. Students:")
try:
    students = cur.execute("SELECT student_id, student_number, full_name, user_id FROM Student LIMIT 5;").fetchall()
    for s in students:
        print(f"  student_id: {s[0]}, student_number: {s[1]}, name: {s[2]}, user_id: {s[3]}")
except Exception as e:
    print(f"  Error: {e}")

# Check Course Enrollments
print("\n2. Course Enrollments:")
try:
    enrollments = cur.execute("SELECT enrollment_id, student_id, course_id, status, enrolled_at FROM CourseEnrollment LIMIT 5;").fetchall()
    for e in enrollments:
        print(f"  enrollment_id: {e[0]}, student_id: {e[1]}, course_id: {e[2]}, status: {e[3]}")
except Exception as e:
    print(f"  Error: {e}")

# Check Users table  
print("\n3. Users (students):")
try:
    users = cur.execute("SELECT id, username, email, role FROM users WHERE role = 'student' LIMIT 5;").fetchall()
    for u in users:
        print(f"  user_id: {u[0]}, username: {u[1]}, email: {u[2]}, role: {u[3]}")
except Exception as e:
    print(f"  Error: {e}")

# Cross-reference
print("\n4. Students with enrollments:")
try:
    query = """
    SELECT s.student_id, s.student_number, s.full_name, s.user_id, 
           COUNT(ce.enrollment_id) as enrollment_count
    FROM Student s
    LEFT JOIN CourseEnrollment ce ON s.student_id = ce.student_id
    GROUP BY s.student_id, s.student_number, s.full_name, s.user_id
    LIMIT 10
    """
    results = cur.execute(query).fetchall()
    for r in results:
        print(f"  student_id: {r[0]}, name: {r[2]}, user_id: {r[3]}, enrollments: {r[4]}")
except Exception as e:
    print(f"  Error: {e}")

con.close()
