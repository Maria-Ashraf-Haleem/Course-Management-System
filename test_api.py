#!/usr/bin/env python3

import requests
import json
import sqlite3

# Test the API endpoints and database directly
BASE_URL = "http://localhost:8000"

def check_database_directly():
    """Check database for enrollment data"""
    print("=== CHECKING DATABASE DIRECTLY ===")
    try:
        conn = sqlite3.connect('database/dentist.db')
        cursor = conn.cursor()
        
        # Get student users
        cursor.execute("SELECT id, username FROM users WHERE role = 'student'")
        users = cursor.fetchall()
        print(f"Student users: {len(users)}")
        
        # Get student records
        cursor.execute("SELECT student_id, student_number, user_id FROM Student")
        students = cursor.fetchall()
        print(f"Student records: {len(students)}")
        
        # Get enrollments
        cursor.execute("SELECT enrollment_id, student_id, course_id FROM CourseEnrollment")
        enrollments = cursor.fetchall()
        print(f"Total enrollments: {len(enrollments)}")
        
        if users and students:
            # Test mapping for first user
            user_id = users[0][0]
            username = users[0][1]
            
            # Find student record
            student_record = next((s for s in students if s[2] == user_id), None)
            if student_record:
                student_id = student_record[0]
                student_enrollments = [e for e in enrollments if e[1] == student_id]
                print(f"\nTest: User '{username}' -> Student ID {student_id} -> {len(student_enrollments)} enrollments")
                return student_id, len(student_enrollments) > 0
            else:
                print(f"\nISSUE: User '{username}' has no student record")
                return None, False
        
        conn.close()
        return None, False
        
    except Exception as e:
        print(f"Database error: {e}")
        return None, False

def test_api_health():
    """Test if API is accessible"""
    try:
        response = requests.get(f"{BASE_URL}/docs", timeout=5)
        print(f"API Health: {response.status_code}")
        return response.status_code == 200
    except Exception as e:
        print(f"API not accessible: {e}")
        return False

def test_courses_endpoint():
    """Test courses endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/course-management/courses")
        print(f"Courses endpoint: {response.status_code}")
        if response.status_code == 200:
            courses = response.json()
            print(f"Available courses: {len(courses)}")
            return len(courses) > 0
        return False
    except Exception as e:
        print(f"Courses endpoint error: {e}")
        return False

if __name__ == "__main__":
    print("=== COMPREHENSIVE ENROLLMENT TEST ===")
    
    # Check database first
    student_id, has_enrollments = check_database_directly()
    
    # Check API health
    api_healthy = test_api_health()
    
    # Check courses
    has_courses = test_courses_endpoint()
    
    print(f"\n=== SUMMARY ===")
    print(f"Database has enrollments: {has_enrollments}")
    print(f"API is healthy: {api_healthy}")
    print(f"Courses available: {has_courses}")
    
    if student_id:
        print(f"Test student ID: {student_id}")
    
    if not has_enrollments:
        print("\nRECOMMENDATION: Create test enrollment data")
    elif not api_healthy:
        print("\nRECOMMENDATION: Start backend server")
    else:
        print("\nRECOMMENDATION: Check frontend API calls and browser console")
