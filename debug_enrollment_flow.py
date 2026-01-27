#!/usr/bin/env python3
"""
Debug script to trace the complete enrollment flow and identify ID mismatches
"""
import sqlite3
import sys
from pathlib import Path

def debug_enrollment_flow():
    db_path = "database/dentist.db"
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("=== DEBUGGING ENROLLMENT FLOW ===\n")
        
        # 1. Check all users with student role
        print("1. Users with student role:")
        cursor.execute("SELECT id, username, email, role FROM users WHERE role = 'student'")
        student_users = cursor.fetchall()
        for user in student_users:
            print(f"   User ID: {user[0]}, Username: {user[1]}, Email: {user[2]}")
        
        # 2. Check Student table and link to users
        print("\n2. Student records linked to users:")
        cursor.execute("""
            SELECT s.student_id, s.student_number, s.full_name, s.user_id, u.username, u.email
            FROM Student s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE u.role = 'student' OR s.user_id IS NOT NULL
        """)
        students = cursor.fetchall()
        for student in students:
            print(f"   Student ID: {student[0]}, Student Number: {student[1]}")
            print(f"   Name: {student[2]}, User ID: {student[3]}")
            print(f"   Username: {student[4]}, Email: {student[5]}")
            print("   ---")
        
        # 3. Check CourseEnrollment table
        print("\n3. All course enrollments:")
        cursor.execute("""
            SELECT ce.enrollment_id, ce.student_id, ce.course_id, ce.status, ce.enrolled_at,
                   s.student_number, s.full_name, s.user_id
            FROM CourseEnrollment ce
            LEFT JOIN Student s ON ce.student_id = s.student_id
            ORDER BY ce.enrolled_at DESC
        """)
        enrollments = cursor.fetchall()
        for enrollment in enrollments:
            print(f"   Enrollment ID: {enrollment[0]}")
            print(f"   Student ID in enrollment: {enrollment[1]}")
            print(f"   Course ID: {enrollment[2]}, Status: {enrollment[3]}")
            print(f"   Student: {enrollment[6]} ({enrollment[5]}), User ID: {enrollment[7]}")
            print(f"   Enrolled at: {enrollment[4]}")
            print("   ---")
        
        # 4. Cross-check: Find potential ID mismatches
        print("\n4. Checking for ID mismatches:")
        
        # Get the most recent enrollment
        if enrollments:
            recent_enrollment = enrollments[0]
            enrolled_student_id = recent_enrollment[1]
            enrolled_user_id = recent_enrollment[7]
            
            print(f"   Most recent enrollment uses student_id: {enrolled_student_id}")
            print(f"   This student_id belongs to user_id: {enrolled_user_id}")
            
            # Check if there are other student records for the same user
            cursor.execute("SELECT student_id, student_number, full_name FROM Student WHERE user_id = ?", (enrolled_user_id,))
            user_students = cursor.fetchall()
            print(f"   All student records for user_id {enrolled_user_id}:")
            for us in user_students:
                print(f"     student_id: {us[0]}, student_number: {us[1]}, name: {us[2]}")
        
        # 5. Check if there are students without user_id (potential orphans)
        print("\n5. Students without linked user accounts:")
        cursor.execute("SELECT student_id, student_number, full_name FROM Student WHERE user_id IS NULL")
        orphan_students = cursor.fetchall()
        for orphan in orphan_students:
            print(f"   Student ID: {orphan[0]}, Number: {orphan[1]}, Name: {orphan[2]}")
        
        if not orphan_students:
            print("   No orphaned students found.")
        
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_enrollment_flow()
