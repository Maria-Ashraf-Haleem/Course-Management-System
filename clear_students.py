import sys
sys.path.append('./backend')
from backend.app.database import get_db
from backend.app import models

db = next(get_db())

try:
    print('=== CLEARING ALL STUDENT DATA ===')
    
    # 1. Delete all submission feedback first
    feedback_count = db.query(models.SubmissionFeedback).count()
    db.query(models.SubmissionFeedback).delete()
    print(f'Deleted {feedback_count} submission feedback records')
    
    # 2. Delete all submissions
    submission_count = db.query(models.Submission).count()
    db.query(models.Submission).delete()
    print(f'Deleted {submission_count} submissions')
    
    # 3. Delete all course enrollments
    enrollment_count = db.query(models.CourseEnrollment).count()
    db.query(models.CourseEnrollment).delete()
    print(f'Deleted {enrollment_count} course enrollments')
    
    # 4. Delete all students
    student_count = db.query(models.Student).count()
    db.query(models.Student).delete()
    print(f'Deleted {student_count} students')
    
    # 5. Delete student users
    user_count = db.query(models.User).filter(models.User.role == 'student').count()
    db.query(models.User).filter(models.User.role == 'student').delete()
    print(f'Deleted {user_count} student user accounts')
    
    db.commit()
    
    print('\n=== VERIFICATION ===')
    print(f'Remaining students: {db.query(models.Student).count()}')
    print(f'Remaining submissions: {db.query(models.Submission).count()}')
    print(f'Remaining enrollments: {db.query(models.CourseEnrollment).count()}')
    print(f'Remaining feedback: {db.query(models.SubmissionFeedback).count()}')
    
    remaining_student_users = db.query(models.User).filter(models.User.role == 'student').count()
    print(f'Remaining student users: {remaining_student_users}')
    
    print('\n✅ ALL STUDENT DATA SUCCESSFULLY CLEARED!')
    
except Exception as e:
    print(f'Error: {e}')
    db.rollback()
finally:
    db.close()
