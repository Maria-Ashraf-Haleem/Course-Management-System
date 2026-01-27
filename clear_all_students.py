#!/usr/bin/env python3

import sys
import os
sys.path.append('.')
sys.path.append('./backend')

from backend.app.database import get_db
from backend.app import models

def clear_all_student_data():
    """Delete all student data and related records to start fresh"""
    
    db = next(get_db())
    
    try:
        print("=== CLEARING ALL STUDENT DATA ===")
        
        # 1. Delete all submission feedback first (foreign key constraint)
        feedback_count = db.query(models.SubmissionFeedback).count()
        db.query(models.SubmissionFeedback).delete()
        print(f"Deleted {feedback_count} submission feedback records")
        
        # 2. Delete all submissions
        submission_count = db.query(models.Submission).count()
        db.query(models.Submission).delete()
        print(f"Deleted {submission_count} submissions")
        
        # 3. Delete all course enrollments
        enrollment_count = db.query(models.CourseEnrollment).count()
        db.query(models.CourseEnrollment).delete()
        print(f"Deleted {enrollment_count} course enrollments")
        
        # 4. Delete all students
        student_count = db.query(models.Student).count()
        db.query(models.Student).delete()
        print(f"Deleted {student_count} students")
        
        # 5. Delete student users (role = 'student')
        user_count = db.query(models.User).filter(models.User.role == 'student').count()
        db.query(models.User).filter(models.User.role == 'student').delete()
        print(f"Deleted {user_count} student user accounts")
        
        db.commit()
        
        print("\n=== VERIFICATION ===")
        remaining_students = db.query(models.Student).count()
        remaining_submissions = db.query(models.Submission).count()
        remaining_enrollments = db.query(models.CourseEnrollment).count()
        remaining_feedback = db.query(models.SubmissionFeedback).count()
        remaining_student_users = db.query(models.User).filter(models.User.role == 'student').count()
        
        print(f"Remaining students: {remaining_students}")
        print(f"Remaining submissions: {remaining_submissions}")
        print(f"Remaining enrollments: {remaining_enrollments}")
        print(f"Remaining feedback: {remaining_feedback}")
        print(f"Remaining student users: {remaining_student_users}")
        
        if all(count == 0 for count in [remaining_students, remaining_submissions, remaining_enrollments, remaining_feedback, remaining_student_users]):
            print("\n✅ ALL STUDENT DATA SUCCESSFULLY CLEARED!")
            print("You can now import your CSV file without header row issues.")
        else:
            print("\n⚠️ Some data may still remain - check the counts above")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    clear_all_student_data()
