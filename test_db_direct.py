import sqlite3
import json

# Connect to database
conn = sqlite3.connect('database/dentist.db')
cursor = conn.cursor()

print("=== DATABASE DEBUG ===")

# 1. Check users with student role
print("1. Student users:")
cursor.execute("SELECT id, username, email FROM users WHERE role = 'student'")
student_users = cursor.fetchall()
for user in student_users:
    print(f"   User ID: {user[0]}, Username: {user[1]}")

# 2. Check Student table
print("\n2. Student records:")
cursor.execute("SELECT student_id, student_number, full_name, user_id FROM Student")
students = cursor.fetchall()
for student in students:
    print(f"   Student ID: {student[0]}, Number: {student[1]}, Name: {student[2]}, User ID: {student[3]}")

# 3. Check enrollments
print("\n3. Course enrollments:")
cursor.execute("SELECT enrollment_id, student_id, course_id, status FROM CourseEnrollment")
enrollments = cursor.fetchall()
for enrollment in enrollments:
    print(f"   Enrollment ID: {enrollment[0]}, Student ID: {enrollment[1]}, Course: {enrollment[2]}")

print(f"\nSummary: {len(student_users)} users, {len(students)} student records, {len(enrollments)} enrollments")

# 4. Check for specific user-student mapping
if student_users and students:
    test_user = student_users[0]
    user_id = test_user[0]
    username = test_user[1]
    
    # Find corresponding student record
    matching_student = None
    for student in students:
        if student[3] == user_id:  # user_id matches
            matching_student = student
            break
    
    if matching_student:
        student_id = matching_student[0]
        print(f"\nTest case: User '{username}' (ID: {user_id}) -> Student ID: {student_id}")
        
        # Check enrollments for this student
        user_enrollments = [e for e in enrollments if e[1] == student_id]
        print(f"Enrollments for this student: {len(user_enrollments)}")
        
        if user_enrollments:
            print("Enrollment details:")
            for enr in user_enrollments:
                print(f"  - Enrollment {enr[0]}: Course {enr[2]}, Status: {enr[3]}")
    else:
        print(f"\nISSUE: User '{username}' (ID: {user_id}) has NO corresponding student record!")

conn.close()
