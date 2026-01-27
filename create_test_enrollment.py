#!/usr/bin/env python3
"""
Create test enrollment data directly in the database
"""
import sqlite3
import datetime
import os

# Change to project directory
os.chdir(r'C:\DEVI\projects\Dentist web')

try:
    conn = sqlite3.connect('database/dentist.db')
    cursor = conn.cursor()
    
    print("=== CREATING TEST ENROLLMENT ===")
    
    # Get first student user and their student record
    cursor.execute("""
        SELECT u.id as user_id, u.username, s.student_id, s.student_number, s.full_name
        FROM users u 
        JOIN Student s ON u.id = s.user_id 
        WHERE u.role = 'student' 
        LIMIT 1
    """)
    student_data = cursor.fetchone()
    
    if not student_data:
        print("No student found with linked user account!")
        conn.close()
        exit(1)
    
    user_id, username, student_id, student_number, full_name = student_data
    print(f"Found student: {full_name} ({student_number})")
    print(f"User ID: {user_id}, Student ID: {student_id}")
    
    # Get first available course
    cursor.execute("SELECT course_id, title, code FROM Course WHERE is_active = 1 LIMIT 1")
    course_data = cursor.fetchone()
    
    if not course_data:
        print("No active courses found!")
        conn.close()
        exit(1)
    
    course_id, course_title, course_code = course_data
    print(f"Found course: {course_title} ({course_code})")
    
    # Check if enrollment already exists
    cursor.execute("""
        SELECT enrollment_id FROM CourseEnrollment 
        WHERE student_id = ? AND course_id = ?
    """, (student_id, course_id))
    
    existing = cursor.fetchone()
    if existing:
        print(f"Enrollment already exists: {existing[0]}")
    else:
        # Create test enrollment
        cursor.execute("""
            INSERT INTO CourseEnrollment (student_id, course_id, status, enrolled_at)
            VALUES (?, ?, 'Active', ?)
        """, (student_id, course_id, datetime.datetime.utcnow().isoformat()))
        
        conn.commit()
        enrollment_id = cursor.lastrowid
        print(f"Created test enrollment: {enrollment_id}")
    
    # Verify enrollment exists
    cursor.execute("""
        SELECT ce.enrollment_id, ce.student_id, ce.course_id, ce.status,
               c.title, c.code
        FROM CourseEnrollment ce
        JOIN Course c ON ce.course_id = c.course_id
        WHERE ce.student_id = ?
    """, (student_id,))
    
    enrollments = cursor.fetchall()
    print(f"\nVerification: Found {len(enrollments)} enrollments for student_id {student_id}")
    for enr in enrollments:
        print(f"  - {enr[4]} ({enr[5]}) - Status: {enr[3]}")
    
    print(f"\nTest complete! Student ID {student_id} should now show enrollments in doctor's view.")
    
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
