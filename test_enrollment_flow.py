#!/usr/bin/env python3
"""
Test the complete enrollment flow to identify the issue
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_enrollment_flow():
    print("=== TESTING ENROLLMENT FLOW ===")
    
    # Test 1: Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/docs", timeout=5)
        print("✓ Backend server is running")
    except requests.exceptions.RequestException as e:
        print(f"✗ Backend server not accessible: {e}")
        return False
    
    # Test 2: Try to get available courses
    try:
        response = requests.get(f"{BASE_URL}/course-management/courses")
        if response.status_code == 200:
            courses = response.json()
            print(f"✓ Found {len(courses)} available courses")
            if courses:
                print(f"  Sample course: {courses[0].get('title', 'Unknown')} (ID: {courses[0].get('course_id', 'Unknown')})")
        else:
            print(f"✗ Failed to get courses: {response.status_code}")
    except Exception as e:
        print(f"✗ Error getting courses: {e}")
    
    # Test 3: Try to get students (this might require authentication)
    try:
        response = requests.get(f"{BASE_URL}/doctor/students")
        if response.status_code == 200:
            students = response.json()
            print(f"✓ Found {len(students)} students")
        elif response.status_code == 401:
            print("! Students endpoint requires authentication (expected)")
        else:
            print(f"? Students endpoint returned: {response.status_code}")
    except Exception as e:
        print(f"✗ Error getting students: {e}")
    
    return True

if __name__ == "__main__":
    test_enrollment_flow()
