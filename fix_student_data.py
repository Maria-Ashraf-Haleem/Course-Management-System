#!/usr/bin/env python3

import sys
import os
sys.path.append('.')

from app.database import get_db
from app import models

def fix_student_data():
    """Transfer all data from student ID 101 to student ID 100 (Noah Garcia)"""
    
    # Get database session
    db = next(get_db())
    
    try:
        print("=== BEFORE UPDATE ===")
        # Check current data
        submissions_101 = db.query(models.Submission).filter(models.Submission.student_id == 101).all()
        submissions_100 = db.query(models.Submission).filter(models.Submission.student_id == 100).all()
        
        print(f"Student 101 submissions: {len(submissions_101)}")
        for sub in submissions_101:
            grades = [f.grade for f in sub.feedback if f.grade is not None]
            print(f"  Submission {sub.submission_id}: assignment {sub.assignment_id}, grades {grades}")
        
        print(f"Student 100 submissions: {len(submissions_100)}")
        for sub in submissions_100:
            grades = [f.grade for f in sub.feedback if f.grade is not None]
            print(f"  Submission {sub.submission_id}: assignment {sub.assignment_id}, grades {grades}")
        
        # Update all submissions from student 101 to student 100
        print("\n=== UPDATING DATA ===")
        updated = db.query(models.Submission).filter(models.Submission.student_id == 101).update({'student_id': 100})
        db.commit()
        
        print(f"Updated {updated} submissions from student 101 to student 100")
        
        print("\n=== AFTER UPDATE ===")
        # Verify the changes
        submissions_101_after = db.query(models.Submission).filter(models.Submission.student_id == 101).all()
        submissions_100_after = db.query(models.Submission).filter(models.Submission.student_id == 100).all()
        
        print(f"Student 101 submissions: {len(submissions_101_after)}")
        print(f"Student 100 submissions: {len(submissions_100_after)}")
        
        # Show all grades for student 100
        all_grades = []
        for sub in submissions_100_after:
            grades = [f.grade for f in sub.feedback if f.grade is not None]
            all_grades.extend(grades)
            print(f"  Submission {sub.submission_id}: assignment {sub.assignment_id}, grades {grades}")
        
        if all_grades:
            avg_grade = sum(all_grades) / len(all_grades)
            print(f"\nNoah Garcia (ID: 100) now has {len(all_grades)} grades: {all_grades}")
            print(f"Average grade: {avg_grade:.1f}")
        
        print("\nData transfer completed successfully!")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_student_data()
