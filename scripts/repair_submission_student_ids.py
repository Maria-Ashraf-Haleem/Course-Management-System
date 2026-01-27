import sys
import os

# Ensure backend package is importable
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.db import get_db
from app import models


def repair_submission_student_ids(dry_run: bool = False) -> None:
    """
    Fix submissions created with wrong student_id (User.id instead of Student.student_id).

    Strategy:
    - Build a map: user_id -> student_id from Student.user_id.
    - Find submissions where s.student_id matches an existing users.id but NOT any Student.student_id.
    - For each such submission, if user_id maps to a Student.student_id, update s.student_id accordingly.
    - Print a summary and optionally run in dry_run mode.
    """
    db = next(get_db())
    try:
        # Map user_id -> student_id
        pairs = db.query(models.Student.user_id, models.Student.student_id).all()
        user_to_student = {uid: sid for (uid, sid) in pairs if uid is not None}
        print(f"Loaded {len(user_to_student)} user->student mappings")

        # Collect valid student_ids
        valid_student_ids = set(sid for (_, sid) in pairs)

        # Find candidate submissions where student_id is actually a user_id
        # A simple heuristic: student_id in users table but not in Student.student_id set
        user_ids = [u.id for u in db.query(models.User.id).all()]
        bad_ids = set(user_ids) - valid_student_ids
        if not bad_ids:
            print("No mismatched IDs detected by heuristic.")
        
        cands = (
            db.query(models.Submission.submission_id, models.Submission.student_id)
            .filter(models.Submission.student_id.in_(bad_ids))
            .all()
        )
        print(f"Found {len(cands)} submissions with suspicious student_id values")

        fixed = 0
        skipped = 0
        for sub_id, sid in cands:
            # Interpret sid as user_id and map
            new_sid = user_to_student.get(sid)
            if new_sid:
                print(f"Fixing Submission {sub_id}: {sid} -> {new_sid}")
                if not dry_run:
                    db.query(models.Submission).filter(models.Submission.submission_id == sub_id).update(
                        {models.Submission.student_id: new_sid}, synchronize_session=False
                    )
                fixed += 1
            else:
                print(f"Skipping Submission {sub_id}: {sid} (no Student mapped from this user_id)")
                skipped += 1

        if not dry_run:
            db.commit()
        print(f"Done. Fixed={fixed}, Skipped={skipped}, DryRun={dry_run}")

    except Exception as e:
        db.rollback()
        print("Repair failed:", e)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="Repair Submission.student_id values mistaken for User.id")
    p.add_argument("--dry-run", action="store_true", help="Do not write changes, just report")
    args = p.parse_args()
    repair_submission_student_ids(dry_run=args.dry_run)
