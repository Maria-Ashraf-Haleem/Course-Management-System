import sys
import os

# Ensure we can import the backend app package
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.db import get_db
from app import models


def wipe_all():
    db = next(get_db())
    try:
        print("\n=== START FULL WIPE ===")
        # Announcements first
        try:
            ar_cnt = db.query(models.AnnouncementReadReceipt).count()
            db.query(models.AnnouncementReadReceipt).delete()
            print(f"Deleted {ar_cnt} announcement read receipts")
        except Exception as e:
            print("AnnouncementReadReceipt wipe error:", e)
        try:
            a_cnt = db.query(models.Announcement).count()
            db.query(models.Announcement).delete()
            print(f"Deleted {a_cnt} announcements")
        except Exception as e:
            print("Announcement wipe error:", e)

        # Feedback then submissions
        try:
            fb_cnt = db.query(models.SubmissionFeedback).count()
            db.query(models.SubmissionFeedback).delete()
            print(f"Deleted {fb_cnt} submission feedback records")
        except Exception as e:
            print("SubmissionFeedback wipe error:", e)
        try:
            sub_cnt = db.query(models.Submission).count()
            db.query(models.Submission).delete()
            print(f"Deleted {sub_cnt} submissions")
        except Exception as e:
            print("Submission wipe error:", e)

        # Enrollments (null grades first for clarity), then delete
        try:
            changed = (
                db.query(models.CourseEnrollment)
                .filter(models.CourseEnrollment.grade.isnot(None))
                .update({models.CourseEnrollment.grade: None}, synchronize_session=False)
            )
            if changed:
                print(f"Nullified grade for {changed} enrollments")
            enr_cnt = db.query(models.CourseEnrollment).count()
            db.query(models.CourseEnrollment).delete()
            print(f"Deleted {enr_cnt} course enrollments")
        except Exception as e:
            print("CourseEnrollment wipe error:", e)

        # Assignments and Courses
        try:
            asg_cnt = db.query(models.Assignment).count()
            db.query(models.Assignment).delete()
            print(f"Deleted {asg_cnt} assignments")
        except Exception as e:
            print("Assignment wipe error:", e)
        try:
            crs_cnt = db.query(models.Course).count()
            db.query(models.Course).delete()
            print(f"Deleted {crs_cnt} courses")
        except Exception as e:
            print("Course wipe error:", e)

        # Students
        try:
            stu_cnt = db.query(models.Student).count()
            db.query(models.Student).delete()
            print(f"Deleted {stu_cnt} students")
        except Exception as e:
            print("Student wipe error:", e)

        # Users (students only)
        try:
            stu_user_cnt = db.query(models.User).filter(models.User.role == 'student').count()
            db.query(models.User).filter(models.User.role == 'student').delete()
            print(f"Deleted {stu_user_cnt} student users")
        except Exception as e:
            print("User wipe error:", e)

        # Commit
        db.commit()
        print("=== FULL WIPE COMPLETED ===\n")

        # Verification
        print("VERIFICATION:")
        print("Remaining announcements:", db.query(models.Announcement).count())
        print("Remaining feedback:", db.query(models.SubmissionFeedback).count())
        print("Remaining submissions:", db.query(models.Submission).count())
        print("Remaining enrollments:", db.query(models.CourseEnrollment).count())
        print("Remaining assignments:", db.query(models.Assignment).count())
        print("Remaining courses:", db.query(models.Course).count())
        print("Remaining students:", db.query(models.Student).count())
        print("Remaining student users:", db.query(models.User).filter(models.User.role == 'student').count())
    except Exception as e:
        db.rollback()
        print("WIPE FAILED:", e)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    wipe_all()
