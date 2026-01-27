#!/usr/bin/env python3
import sqlite3
import os

# Change to the correct directory
os.chdir(r'C:\DEVI\projects\Dentist web')

try:
    # Connect to database
    conn = sqlite3.connect('database/dentist.db')
    cursor = conn.cursor()
    
    print("=== ENROLLMENT DEBUG ===")
    
    # Get all student users
    cursor.execute("SELECT id, username FROM users WHERE role = 'student'")
    users = cursor.fetchall()
    print(f"Found {len(users)} student users:")
    for user in users:
        print(f"  User ID: {user[0]}, Username: {user[1]}")
    
    # Get all student records
    cursor.execute("SELECT student_id, student_number, full_name, user_id FROM Student")
    students = cursor.fetchall()
    print(f"\nFound {len(students)} student records:")
    for student in students:
        print(f"  Student ID: {student[0]}, Number: {student[1]}, Name: {student[2]}, User ID: {student[3]}")
    
    # Get all enrollments
    cursor.execute("SELECT enrollment_id, student_id, course_id, status FROM CourseEnrollment")
    enrollments = cursor.fetchall()
    print(f"\nFound {len(enrollments)} enrollments:")
    for enrollment in enrollments:
        print(f"  Enrollment ID: {enrollment[0]}, Student ID: {enrollment[1]}, Course ID: {enrollment[2]}, Status: {enrollment[3]}")
    
    # Check mapping for each user
    print(f"\n=== USER-STUDENT MAPPING ===")
    for user in users:
        user_id = user[0]
        username = user[1]
        
        # Find student record for this user
        student_record = None
        for student in students:
            if student[3] == user_id:  # user_id field
                student_record = student
                break
        
        if student_record:
            student_id = student_record[0]
            print(f"User '{username}' (ID: {user_id}) -> Student ID: {student_id}")
            
            # Find enrollments for this student
            student_enrollments = [e for e in enrollments if e[1] == student_id]
            print(f"  Enrollments: {len(student_enrollments)}")
            for enr in student_enrollments:
                print(f"    - Course {enr[2]}, Status: {enr[3]}")
        else:
            print(f"User '{username}' (ID: {user_id}) -> NO STUDENT RECORD!")
    
    # Check if there are courses available
    cursor.execute("SELECT course_id, title, code FROM Course LIMIT 5")
    courses = cursor.fetchall()
    print(f"\n=== AVAILABLE COURSES ===")
    print(f"Found {len(courses)} courses:")
    for course in courses:
        print(f"  Course ID: {course[0]}, Title: {course[1]}, Code: {course[2]}")
    
    conn.close()
    print("\nDatabase check completed successfully!")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
