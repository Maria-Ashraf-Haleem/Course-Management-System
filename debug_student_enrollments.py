#!/usr/bin/env python3
"""
Simple debug script to check enrollment data
"""
import sqlite3
import os

# Ensure we're in the right directory
os.chdir(r'C:\DEVI\projects\Dentist web')

try:
    conn = sqlite3.connect('database/dentist.db')
    cursor = conn.cursor()
    
    print("=== ENROLLMENT DEBUG ===")
    
    # Quick counts
    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'student'")
    user_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM Student")
    student_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM CourseEnrollment")
    enrollment_count = cursor.fetchone()[0]
    
    print(f"Users (students): {user_count}")
    print(f"Student records: {student_count}")
    print(f"Enrollments: {enrollment_count}")
    
    if enrollment_count > 0:
        print("\nRecent enrollments:")
        cursor.execute("""
            SELECT ce.enrollment_id, ce.student_id, ce.course_id, ce.status,
                   s.student_number, s.full_name
            FROM CourseEnrollment ce
            LEFT JOIN Student s ON ce.student_id = s.student_id
            ORDER BY ce.enrolled_at DESC LIMIT 3
        """)
        for row in cursor.fetchall():
            print(f"  Enrollment {row[0]}: Student ID {row[1]} -> Course {row[2]} ({row[3]})")
            print(f"    Student: {row[5]} ({row[4]})")
    
    # Check specific user-student mapping
    cursor.execute("SELECT id, username FROM users WHERE role = 'student' LIMIT 1")
    test_user = cursor.fetchone()
    if test_user:
        user_id, username = test_user
        cursor.execute("SELECT student_id FROM Student WHERE user_id = ?", (user_id,))
        student_record = cursor.fetchone()
        if student_record:
            student_id = student_record[0]
            cursor.execute("SELECT COUNT(*) FROM CourseEnrollment WHERE student_id = ?", (student_id,))
            user_enrollments = cursor.fetchone()[0]
            print(f"\nTest case: User '{username}' (ID:{user_id}) -> Student ID:{student_id} -> {user_enrollments} enrollments")
        else:
            print(f"\nISSUE: User '{username}' has no student record!")
    
    conn.close()
    print("\nDatabase check completed.")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
