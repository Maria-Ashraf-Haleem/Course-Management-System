# routers/feedback.py
from __future__ import annotations

from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, confloat
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db import get_db
from app import models
from app.deps import get_current_active_user

router = APIRouter(prefix="/feedback", tags=["feedback"])

# ---- Pydantic Schemas --------------------------------------------------------

class FeedbackIn(BaseModel):
    submission_id: int = Field(..., description="Target submission ID")
    text: Optional[str] = Field(None, description="Feedback text")
    grade: Optional[float] = Field(None, description="Numeric grade")

class FeedbackUpdate(BaseModel):
    text: Optional[str] = Field(None, description="Feedback text")
    grade: Optional[float] = Field(None, description="Numeric grade")

class FeedbackRead(BaseModel):
    id: int
    submissionId: int
    doctorId: Optional[int] = None
    text: Optional[str] = None
    grade: Optional[float] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None

class UpsertResponse(BaseModel):
    ok: bool
    feedback: FeedbackRead

# ---- Helpers -----------------------------------------------------------------

def _require_doctor(user: models.User):
    if (user.role or "").lower() != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor role required"
        )

def _has_attr(obj, name: str) -> bool:
    return hasattr(obj, name)

def _now() -> datetime:
    return datetime.utcnow()

def _touch_created_updated(entity) -> None:
    now = _now()
    if _has_attr(entity, "created_at") and getattr(entity, "created_at", None) is None:
        setattr(entity, "created_at", now)
    if _has_attr(entity, "updated_at"):
        setattr(entity, "updated_at", now)

def _touch_updated(entity) -> None:
    if _has_attr(entity, "updated_at"):
        setattr(entity, "updated_at", _now())

def _submission_is_assigned_to_doctor(sub: models.Submission, doctor_user_id: int) -> bool:
    """
    If your schema links submissions to a doctor (e.g., doctor_id / reviewer_id),
    enforce that only that doctor can write/update feedback. If no linkage exists,
    allow (return True).
    """
    for col in ("doctor_id", "assigned_doctor_id", "reviewer_id"):
        if _has_attr(sub, col):
            return getattr(sub, col) == doctor_user_id

    # Fallback via Assignment relation if present
    if _has_attr(sub, "assignment") and sub.assignment is not None:
        for col in ("doctor_id", "reviewer_id"):
            if _has_attr(sub.assignment, col):
                return getattr(sub.assignment, col) == doctor_user_id

    return True  # can't enforce if no linkage information exists

def _ensure_can_modify_feedback(
    fb: Optional[models.SubmissionFeedback],
    sub: models.Submission,
    current_user: models.User
):
    """Authorize the doctor to create/update/delete feedback for this submission."""
    _require_doctor(current_user)

    # If submission ownership is defined, enforce it
    if not _submission_is_assigned_to_doctor(sub, current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to modify feedback for this submission")

    # If feedback already exists and has a doctor_id, ensure same doctor (unless admin)
    if fb and _has_attr(fb, "doctor_id"):
        if fb.doctor_id not in (None, 0) and fb.doctor_id != current_user.id and (current_user.role or "").lower() != "admin":
            raise HTTPException(status_code=403, detail="Only the authoring doctor (or admin) can modify this feedback")

def _to_read(fb: models.SubmissionFeedback) -> FeedbackRead:
    return FeedbackRead(
        id=getattr(fb, "feedback_id"),
        submissionId=getattr(fb, "submission_id"),
        doctorId=getattr(fb, "doctor_id", None),
        text=getattr(fb, "feedback_text", None),
        grade=getattr(fb, "grade", None),
        createdAt=getattr(fb, "created_at", None),
        updatedAt=getattr(fb, "updated_at", None),
    )

# ---- Routes ------------------------------------------------------------------

@router.get(
    "",
    response_model=List[FeedbackRead],
    summary="List feedback (doctor-only by default)",
)
def list_feedback(
    submission_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None, description="Filter by submission's student_id"),
    mine_only: bool = Query(True, description="Restrict to feedback authored by me (if doctor_id exists)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_doctor(current_user)

    q = db.query(models.SubmissionFeedback)

    # Filter by submission_id directly
    if submission_id is not None:
        q = q.filter(models.SubmissionFeedback.submission_id == submission_id)

    # Restrict to my authored feedback if column exists
    if mine_only and _has_attr(models.SubmissionFeedback, "doctor_id"):
        q = q.filter(models.SubmissionFeedback.doctor_id == current_user.id)

    # Filter by student via join to Submission if needed
    if student_id is not None:
        q = q.join(models.Submission, models.SubmissionFeedback.submission_id == models.Submission.submission_id)
        q = q.filter(models.Submission.student_id == student_id)

    q = q.order_by(getattr(models.SubmissionFeedback, "created_at", getattr(models.SubmissionFeedback, "feedback_id")).desc())
    rows = q.offset(offset).limit(limit).all()

    return [_to_read(r) for r in rows]


@router.get(
    "/submissions/{submission_id}",
    response_model=FeedbackRead,
    summary="Get feedback for a specific submission (doctor or authoring doctor).",
)
def get_feedback_for_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_doctor(current_user)

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    fb = db.query(models.SubmissionFeedback).filter(models.SubmissionFeedback.submission_id == submission_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    # Only allow if assigned to doctor (when schema supports it) or if same doctor authored it (when column exists)
    if not _submission_is_assigned_to_doctor(sub, current_user.id):
        if _has_attr(fb, "doctor_id") and fb.doctor_id != current_user.id and (current_user.role or "").lower() != "admin":
            raise HTTPException(status_code=403, detail="Not allowed to view this feedback")

    return _to_read(fb)


@router.post(
    "",
    response_model=UpsertResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or update feedback for a submission (doctor).",
)
def upsert_feedback(
    body: FeedbackIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    sub = db.query(models.Submission).filter(models.Submission.submission_id == body.submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    fb = db.query(models.SubmissionFeedback).filter(models.SubmissionFeedback.submission_id == body.submission_id).first()
    _ensure_can_modify_feedback(fb, sub, current_user)

    try:
        # Validate grade against assignment's max_grade when provided
        if body.grade is not None:
            assignment = (
                db.query(models.Assignment)
                .join(models.Submission, models.Submission.assignment_id == models.Assignment.assignment_id)
                .filter(models.Submission.submission_id == body.submission_id)
                .first()
            )
            if not assignment:
                raise HTTPException(status_code=404, detail="Assignment not found for submission")
            if body.grade < 0:
                raise HTTPException(status_code=400, detail="Grade must be >= 0")
            max_g = assignment.max_grade or 100.0
            if body.grade > max_g:
                raise HTTPException(status_code=400, detail=f"Grade exceeds assignment max ({max_g})")
        if fb:
            if body.text is not None:
                fb.feedback_text = body.text
            if body.grade is not None:
                fb.grade = body.grade
            # set doctor_id if exists and is missing
            if _has_attr(fb, "doctor_id") and (fb.doctor_id in (None, 0)):
                fb.doctor_id = current_user.id
            _touch_updated(fb)
        else:
            kwargs = dict(
                submission_id=body.submission_id,
                feedback_text=body.text,
                grade=body.grade,
            )
            if _has_attr(models.SubmissionFeedback, "doctor_id"):
                kwargs["doctor_id"] = current_user.id

            fb = models.SubmissionFeedback(**kwargs)
            _touch_created_updated(fb)
            db.add(fb)

        db.commit()
        db.refresh(fb)
        return UpsertResponse(ok=True, feedback=_to_read(fb))

    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Constraint error while saving feedback")
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save feedback")


@router.patch(
    "/{feedback_id}",
    response_model=FeedbackRead,
    summary="Update existing feedback by ID (authoring doctor or admin).",
)
def update_feedback(
    feedback_id: int,
    body: FeedbackUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_doctor(current_user)

    fb = db.query(models.SubmissionFeedback).filter(models.SubmissionFeedback.feedback_id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    # load submission to enforce assignment ownership if schema supports it
    sub = db.query(models.Submission).filter(models.Submission.submission_id == fb.submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found for this feedback")

    _ensure_can_modify_feedback(fb, sub, current_user)

    try:
        changed = False
        if body.text is not None:
            fb.feedback_text = body.text
            changed = True
        if body.grade is not None:
            fb.grade = body.grade
            changed = True

        if not changed:
            return _to_read(fb)

        _touch_updated(fb)
        db.commit()
        db.refresh(fb)
        return _to_read(fb)

    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Constraint error while updating feedback")
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update feedback")


@router.delete(
    "/{feedback_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete feedback (authoring doctor or admin).",
)
def delete_feedback(
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_doctor(current_user)

    fb = db.query(models.SubmissionFeedback).filter(models.SubmissionFeedback.feedback_id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    # load submission to enforce assignment ownership (if applicable)
    sub = db.query(models.Submission).filter(models.Submission.submission_id == fb.submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found for this feedback")

    _ensure_can_modify_feedback(fb, sub, current_user)

    try:
        db.delete(fb)
        db.commit()
        return
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete feedback")
