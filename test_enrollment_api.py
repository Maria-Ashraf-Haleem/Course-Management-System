import requests
import json
import sqlite3

# Test the enrollment API endpoints
BASE_URL = "http://localhost:8000"

def test_database_direct():
    """Check database directly"""
    print("=== DIRECT DATABASE CHECK ===")
    try:
        conn = sqlite3.connect('database/dentist.db')
        cursor = conn.cursor()
        
        # Check users
        cursor.execute("SELECT id, username, role FROM users WHERE role = 'student'")
        users = cursor.fetchall()
        print(f"Student users: {len(users)}")
        for user in users:
            print(f"  User ID: {user[0]}, Username: {user[1]}")
        
        # Check students
        cursor.execute("SELECT student_id, student_number, full_name, user_id FROM Student")
        students = cursor.fetchall()
        print(f"Student records: {len(students)}")
        for student in students:
            print(f"  Student ID: {student[0]}, Number: {student[1]}, User ID: {student[3]}")
        
        # Check enrollments
        cursor.execute("SELECT enrollment_id, student_id, course_id, status FROM CourseEnrollment")
        enrollments = cursor.fetchall()
        print(f"Enrollments: {len(enrollments)}")
        for enrollment in enrollments:
            print(f"  Enrollment: {enrollment[0]}, Student ID: {enrollment[1]}, Course: {enrollment[2]}")
        
        # Check mapping
        if users and students:
            user_id = users[0][0]
            student_record = next((s for s in students if s[3] == user_id), None)
            if student_record:
                student_id = student_record[0]
                student_enrollments = [e for e in enrollments if e[1] == student_id]
                print(f"\nMapping check:")
                print(f"  User ID {user_id} -> Student ID {student_id}")
                print(f"  Enrollments for Student ID {student_id}: {len(student_enrollments)}")
            else:
                print(f"\nISSUE: User ID {user_id} has no Student record!")
        
        conn.close()
        return users, students, enrollments
        
    except Exception as e:
        print(f"Database error: {e}")
        return [], [], []

def test_api_endpoints():
    """Test API endpoints if server is running"""
    print("\n=== API ENDPOINT TESTS ===")
    
    # Test if server is running
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        print("Server is running")
    except:
        print("Server is not running - skipping API tests")
        return
    
    # Test login (you'll need actual credentials)
    # For now, just test if endpoints are accessible
    
if __name__ == "__main__":
    users, students, enrollments = test_database_direct()
    test_api_endpoints()
