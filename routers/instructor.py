# routers/instructor.py
from __future__ import annotations

from typing import Optional, List, Tuple, Any, Dict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from fastapi.responses import StreamingResponse
import io
import zipfile
from pydantic import BaseModel, Field, confloat
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
import json
import pandas as pd
import io
from typing import Literal

from app.db import get_db
from app import models
from app.deps import get_current_active_user

router = APIRouter(prefix="/instructor", tags=["instructor"])

# ---- Constants ---------------------------------------------------------------

VALID_STATUSES = {"Pending", "Accepted", "Rejected", "NeedsRevision"}
REVIEWABLE_STATUSES = {"Accepted", "Rejected", "NeedsRevision"}  # you can't "review" to Pending

# ---- Pydantic response models (kept inline for convenience) -----------------

class SubmissionListItem(BaseModel):
    id: int
    assignmentId: int
    studentId: int
    title: Optional[str] = None
    course: Optional[str] = None
    submittedAt: Optional[datetime] = None
    status: str
    fileName: Optional[str] = None
    filePath: Optional[str] = None
    fileType: Optional[str] = None
    notes: Optional[str] = None
    grade: Optional[float] = None  # included when requested
    maxGrade: Optional[float] = None

class FeedbackRead(BaseModel):
    id: int
    instructorId: Optional[int] = None
    text: Optional[str] = None
    grade: Optional[float] = None
    createdAt: Optional[datetime] = None

class FileItem(BaseModel):
    name: str
    path: str

class SubmissionDetailResponse(BaseModel):
    submission: SubmissionListItem
    feedback: Optional[FeedbackRead] = None
    files: List[FileItem] = []

class ReviewPayload(BaseModel):
    status: str = Field(..., description="Accepted | Rejected | NeedsRevision")
    grade: Optional[float] = None
    feedback_text: Optional[str] = None

class ReviewResponse(BaseModel):
    ok: bool
    submission: dict
    feedback: Optional[dict] = None

# ---- Helpers ----------------------------------------------------------------

def _require_instructor(user: models.User):
    if (user.role or "").lower() != "instructor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor role required")

def _has_attr(model_or_obj, name: str) -> bool:
    return hasattr(model_or_obj, name)

def _now():
    return datetime.utcnow()

def _touch_created_updated(entity) -> None:
    now = _now()
    if _has_attr(entity, "created_at") and getattr(entity, "created_at") is None:
        setattr(entity, "created_at", now)
    if _has_attr(entity, "updated_at"):
        setattr(entity, "updated_at", now)

def _touch_updated(entity) -> None:
    if _has_attr(entity, "updated_at"):
        setattr(entity, "updated_at", _now())

def _submission_is_assigned_to_instructor(sub: models.Submission, instructor_user_id: int) -> bool:
    """
    Authorization helper: if your schema links submissions/assignments to an instructor,
    enforce that this instructor can only manage their own items. Works dynamically:
    - Prefer Submission.instructor_id / Submission.assigned_instructor_id / Submission.reviewer_id
    - Else check Assignment.instructor_id / Assignment.reviewer_id (if available)
    If none of these columns exist, return True (can't enforce).
    """
    # Direct link on Submission
    for col in ("instructor_id", "assigned_instructor_id", "reviewer_id"):
        if _has_attr(sub, col):
            return getattr(sub, col) == instructor_user_id

    # Fallback via Assignment relation if present
    if _has_attr(sub, "assignment") and sub.assignment is not None:
        for col in ("instructor_id", "reviewer_id"):
            if _has_attr(sub.assignment, col):
                return getattr(sub.assignment, col) == instructor_user_id

    # Could not determine ownership -> allow (schema doesn't provide linkage)
    return True

def _instructor_filter_sql() -> Tuple[str, str]:
    """
    For listing via raw SQL, return a tuple (clause, param_key) to restrict by instructor
    if model columns exist. Checks common column names on Submission/Assignment.
    Returns ("", "") if no suitable column exists.
    """
    # Prefer Submission columns
    if _has_attr(models.Submission, "instructor_id"):
        return " AND s.instructor_id = :instrid ", "instrid"
    if _has_attr(models.Submission, "assigned_instructor_id"):
        return " AND s.assigned_instructor_id = :instrid ", "instrid"
    if _has_attr(models.Submission, "reviewer_id"):
        return " AND s.reviewer_id = :instrid ", "instrid"

    # Then Assignment columns
    if _has_attr(models.Assignment, "instructor_id"):
        return " AND a.instructor_id = :instrid ", "instrid"
    if _has_attr(models.Assignment, "reviewer_id"):
        return " AND a.reviewer_id = :instrid ", "instrid"
    # IMPORTANT: Many schemas link instructor via Assignment.created_by
    if _has_attr(models.Assignment, "created_by"):
        return " AND a.created_by = :instrid ", "instrid"

    return "", ""  # no filter possible

# ---- Routes -----------------------------------------------------------------

@router.get(
    "/submissions",
    response_model=List[SubmissionListItem],
    summary="List submissions for review (instructor)",
)
def list_submissions_for_review(
    status_filter: Optional[str] = Query(None, description="Optional: Pending | Accepted | Rejected | NeedsRevision"),
    student_id: Optional[int]   = Query(None, description="Optional filter by Student.student_id (exactly as stored on Submission.student_id)"),
    assignment_id: Optional[int] = Query(None, description="Optional filter by assignment_id"),
    search: Optional[str]       = Query(None, description="Search assignment title"),
    include_feedback: bool      = Query(False, description="Join feedback to include current grade/text"),
    mine_only: bool             = Query(True, description="If true, restrict to submissions assigned to me (when schema supports it)"),
    limit: int                  = Query(50, ge=1, le=200),
    offset: int                 = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    if status_filter and status_filter not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status filter")

    # IMPORTANT: student_id refers to Student.student_id in our schema.
    # Do NOT remap to auth User.id, because Submission.student_id references Student.student_id.
    # Previous logic attempted to convert to User.id which made the filter return no rows.
    # We keep student_id as-is and filter on Submission.student_id directly.
    if student_id is not None:
        try:
            # Validate the student exists (optional sanity check). Do not change student_id.
            _ = db.query(models.Student).filter(models.Student.student_id == student_id).first()
        except Exception:
            pass

    # dynamic instructor filter (if columns exist)
    instructor_clause, instructor_param = _instructor_filter_sql()
    instructor_bind: Dict[str, Any] = {}
    if mine_only and instructor_param:
        # If we're filtering by Assignment.created_by, the DB stores Instructor.instructor_id
        # not the auth User.id. Use the mapped instructor id.
        if "a.created_by" in instructor_clause:
            try:
                instr = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
                if instr:
                    instructor_bind = {instructor_param: instr.instructor_id}
                else:
                    instructor_bind = {instructor_param: -1}  # no matches
            except Exception:
                instructor_bind = {instructor_param: -1}
        else:
            instructor_bind = {instructor_param: current_user.id}

    # optional feedback join/columns
    fb_select = ", fb.grade AS grade, fb.feedback_text AS feedback_text" if include_feedback else ""
    fb_join = "LEFT JOIN SubmissionFeedback fb ON fb.submission_id = s.submission_id" if include_feedback else ""

    where_search = ""
    # Only include instructor clause when mine_only is True
    instructor_clause_sql = instructor_clause if (mine_only and instructor_bind) else ""
    params = {"status": status_filter, "sid": student_id, "aid": assignment_id, **instructor_bind}
    if search and search.strip():
        where_search = " AND (a.title ILIKE :term) "
        params["term"] = f"%{search.strip()}%"

    # Debug incoming filters before executing
    try:
        print("[DEBUG] GET /instructor/submissions",
              {
                  "status_filter": status_filter,
                  "student_id": student_id,
                  "assignment_id": assignment_id,
                  "mine_only": mine_only,
                  "instructor_clause": instructor_clause_sql,
                  "instructor_bind": instructor_bind,
                  "search": search,
              })
    except Exception:
        pass

    sql = f"""
        SELECT
            s.submission_id, s.assignment_id, s.student_id, s.original_filename, s.file_path, s.file_type,
            s.submitted_at, s.status, s.student_notes,
            a.title AS assignment_title, d.name AS course
            {fb_select}
        FROM Submission s
        JOIN Assignment a ON a.assignment_id = s.assignment_id
        LEFT JOIN Department d ON d.department_id = a.department_id
        {fb_join}
        WHERE (:status IS NULL OR s.status = :status)
          AND (:sid IS NULL OR s.student_id = :sid)
          AND (:aid IS NULL OR s.assignment_id = :aid)
          {instructor_clause_sql}
          {where_search}
        ORDER BY s.submitted_at DESC
        LIMIT :limit OFFSET :offset
    """
    params["limit"] = limit
    params["offset"] = offset

    rows = db.execute(text(sql), params).mappings().all()
    try:
        print(f"[DEBUG] /instructor/submissions -> rows: {len(rows)}")
        if rows:
            sample_ids = [r.get("student_id") for r in rows[:5]]
            print(f"[DEBUG] sample student_ids: {sample_ids}")
    except Exception:
        pass

    items: List[SubmissionListItem] = []
    for r in rows:
        item = SubmissionListItem(
            id=r["submission_id"],
            assignmentId=r["assignment_id"],
            studentId=r["student_id"],
            title=r.get("assignment_title"),
            course=r.get("course"),
            submittedAt=r.get("submitted_at"),
            status=r["status"],
            fileName=r.get("original_filename"),
            filePath=r.get("file_path"),
            fileType=r.get("file_type"),
            notes=r.get("student_notes"),
            grade=r.get("grade") if include_feedback else None,
        )
        items.append(item)
    return items


@router.get(
    "/submissions/{submission_id}",
    response_model=SubmissionDetailResponse,
    summary="Get a single submission + (optional) feedback",
)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    sub = db.execute(
        text("""
        SELECT s.*, a.title AS assignment_title, a.max_grade AS max_grade, d.name AS course
        FROM Submission s
        JOIN Assignment a ON a.assignment_id = s.assignment_id
        LEFT JOIN Department d ON d.department_id = a.department_id
        WHERE s.submission_id = :sid
        """),
        {"sid": submission_id},
    ).mappings().first()

    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    # ORM object for authorization check (uses dynamic column detection)
    sub_obj = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not _submission_is_assigned_to_instructor(sub_obj, current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to access this submission")

    fb = db.execute(
        text("""
        SELECT feedback_id, instructor_id, feedback_text, grade, created_at
        FROM SubmissionFeedback
        WHERE submission_id = :sid
        """),
        {"sid": submission_id},
    ).mappings().first()

    submission = SubmissionListItem(
        id=sub["submission_id"],
        assignmentId=sub["assignment_id"],
        studentId=sub["student_id"],
        title=sub.get("assignment_title"),
        course=sub.get("course"),
        fileName=sub.get("original_filename"),
        filePath=sub.get("file_path"),
        fileType=sub.get("file_type"),
        submittedAt=sub.get("submitted_at"),
        status=sub["status"],
        notes=sub.get("student_notes"),
        maxGrade=sub.get("max_grade"),
    )

    feedback: Optional[FeedbackRead] = None
    if fb:
        feedback = FeedbackRead(
            id=fb["feedback_id"],
            instructorId=fb.get("instructor_id"),
            text=fb.get("feedback_text"),
            grade=fb.get("grade"),
            createdAt=fb.get("created_at"),
        )
    # Build files array (primary + extras)
    out_files: List[FileItem] = []
    if submission.fileName and submission.filePath:
        try:
            out_files.append(FileItem(name=submission.fileName, path=submission.filePath))
        except Exception:
            pass
    try:
        extras = (
            db.query(models.SubmissionFile)
            .filter(models.SubmissionFile.submission_id == submission_id)
            .all()
        )
        for f in extras:
            if getattr(f, "file_name", None) and getattr(f, "file_path", None):
                out_files.append(FileItem(name=f.file_name, path=f.file_path))
    except Exception:
        pass

    return SubmissionDetailResponse(submission=submission, feedback=feedback, files=out_files)

@router.get(
    "/submissions/{submission_id}/zip",
    summary="Download all submission files as ZIP (instructor)",
)
def download_submission_zip(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if not _submission_is_assigned_to_instructor(sub, current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to access this submission")

    # Collect file paths: primary + extras
    items: List[tuple[str, Any]] = []
    if sub.original_filename and sub.file_path:
        p = Path(sub.file_path)
        # map public to disk path
        # reuse logic from submissions router: /uploads/<name>
        try:
            name = p.name
            disk = Path("uploads") / name if not str(p).startswith("/uploads/") else Path("uploads") / str(p).replace("/uploads/", "")
            if disk.is_file():
                items.append((sub.original_filename, disk))
        except Exception:
            pass
    try:
        extras = (
            db.query(models.SubmissionFile)
            .filter(models.SubmissionFile.submission_id == submission_id)
            .all()
        )
        for f in extras:
            try:
                pp = Path(f.file_path)
                disk = Path("uploads") / pp.name if not str(pp).startswith("/uploads/") else Path("uploads") / str(pp).replace("/uploads/", "")
                if disk.is_file():
                    items.append(((f.file_name or disk.name), disk))
            except Exception:
                continue
    except Exception:
        pass

    if not items:
        raise HTTPException(status_code=404, detail="No files to zip")

    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, path in items:
            try:
                zf.write(str(path), arcname=name)
            except Exception:
                continue
    mem.seek(0)
    headers = {"Content-Disposition": f"attachment; filename=submission-{submission_id}.zip"}
    return StreamingResponse(mem, headers=headers, media_type="application/zip")


@router.post(
    "/submissions/{submission_id}/review",
    response_model=ReviewResponse,
    summary="Review (accept/reject/needs-revision) + upsert feedback/grade",
)
def review_submission(
    submission_id: int,
    payload: ReviewPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    if payload.status not in REVIEWABLE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status. Use Accepted | Rejected | NeedsRevision")

    # Business rules (tweak as you like)
    if payload.status == "Accepted" and payload.grade is None:
        raise HTTPException(status_code=400, detail="Grade is required when status is Accepted")
    if payload.status == "NeedsRevision" and (payload.feedback_text is None or not payload.feedback_text.strip()):
        raise HTTPException(status_code=400, detail="Feedback text is required when status is NeedsRevision")

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if not _submission_is_assigned_to_instructor(sub, current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to review this submission")

    try:
        # Validate grade range against assignment.max_grade when provided
        if payload.grade is not None:
            assignment = (
                db.query(models.Assignment)
                .filter(models.Assignment.assignment_id == sub.assignment_id)
                .first()
            )
            if not assignment:
                raise HTTPException(status_code=404, detail="Assignment not found for submission")
            if payload.grade < 0:
                raise HTTPException(status_code=400, detail="Grade must be >= 0")
            max_g = assignment.max_grade or 100.0
            if payload.grade > max_g:
                raise HTTPException(status_code=400, detail=f"Grade exceeds assignment max ({max_g})")

        # Upsert feedback
        fb = db.query(models.SubmissionFeedback).filter(
            models.SubmissionFeedback.submission_id == submission_id
        ).first()

        if fb:
            if payload.feedback_text is not None:
                fb.feedback_text = payload.feedback_text
            if payload.grade is not None:
                fb.grade = payload.grade
            # update instructor_id if column exists and is empty
            if _has_attr(fb, "instructor_id") and getattr(fb, "instructor_id", None) in (None, 0):
                fb.instructor_id = current_user.id
            _touch_updated(fb)
        else:
            fb_kwargs = dict(
                submission_id=submission_id,
                feedback_text=payload.feedback_text,
                grade=payload.grade,
            )
            if _has_attr(models.SubmissionFeedback, "instructor_id"):
                fb_kwargs["instructor_id"] = current_user.id
            fb = models.SubmissionFeedback(**fb_kwargs)
            _touch_created_updated(fb)
            db.add(fb)

        # Update submission status (+ optional reviewed_at if exists)
        sub.status = payload.status
        if _has_attr(sub, "reviewed_at"):
            sub.reviewed_at = _now()
        _touch_updated(sub)

        db.commit()
        db.refresh(sub)
        db.refresh(fb)

        return ReviewResponse(
            ok=True,
            submission={"id": sub.submission_id, "status": sub.status},
            feedback={"id": getattr(fb, "feedback_id"), "grade": getattr(fb, "grade"), "text": getattr(fb, "feedback_text")},
        )

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Database constraint error while saving review")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to submit review")


# ---- Recent Activity ----------------------------------------------------------------

class RecentActivityItem(BaseModel):
    id: int
    type: str  # e.g., 'submission', 'review', 'feedback', 'assignment'
    description: str
    timestamp: datetime
    
    class Config:
        from_attributes = True

@router.get("/recent-activity", response_model=List[RecentActivityItem])
def get_instructor_recent_activity(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get recent activity for the current instructor"""
    _require_instructor(current_user)
    
    # Get recent submissions reviewed by this instructor
    recent_reviews_sql = """
        SELECT 
            sf.feedback_id as id,
            'review' as type,
            CONCAT('Reviewed submission for assignment "', a.title, '"') as description,
            sf.created_at as timestamp
        FROM SubmissionFeedback sf
        JOIN Submission s ON s.submission_id = sf.submission_id
        JOIN Assignment a ON a.assignment_id = s.assignment_id
        WHERE sf.instructor_id = :instructor_id
        AND sf.created_at IS NOT NULL
        ORDER BY sf.created_at DESC
        LIMIT :limit
    """
    
    # Get recent submissions assigned to this instructor
    recent_submissions_sql = """
        SELECT 
            s.submission_id as id,
            'submission' as type,
            CONCAT('New submission received for "', a.title, '"') as description,
            s.submitted_at as timestamp
        FROM Submission s
        JOIN Assignment a ON a.assignment_id = s.assignment_id
        WHERE a.created_by = :instructor_id
          AND s.submitted_at IS NOT NULL
          AND s.status = 'Pending'
        ORDER BY s.submitted_at DESC
        LIMIT :limit
    """
    
    activities = []
    
    try:
        # Get recent reviews
        reviews = db.execute(text(recent_reviews_sql), {
            "instructor_id": current_user.id,
            "limit": limit
        }).mappings().all()
        
        for review in reviews:
            activities.append(RecentActivityItem(
                id=review["id"],
                type=review["type"],
                description=review["description"],
                timestamp=review["timestamp"]
            ))
    except Exception:
        # If reviews query fails, continue without reviews
        pass
    
    try:
        # Get recent submissions
        submissions = db.execute(text(recent_submissions_sql), {
            "instructor_id": current_user.id,
            "limit": limit
        }).mappings().all()
        
        for submission in submissions:
            activities.append(RecentActivityItem(
                id=submission["id"],
                type=submission["type"],
                description=submission["description"],
                timestamp=submission["timestamp"]
            ))
    except Exception:
        # If submissions query fails, continue without submissions
        pass
    
    # Sort all activities by timestamp and limit
    activities.sort(key=lambda x: x.timestamp, reverse=True)
    return activities[:limit]

# ---- Instructor Profile (Extended) ----------------------------------------------------

class InstructorProfileRead(BaseModel):
    id: Optional[int] = None
    fullName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    department: Optional[str] = None
    licenseNumber: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    address: Optional[str] = None
    joinDate: Optional[datetime] = None
    role: Optional[str] = None
    status: Optional[str] = None
    education: Optional[List[Dict[str, Any]]] = None
    certifications: Optional[List[Dict[str, Any]]] = None

class InstructorProfileUpdate(BaseModel):
    fullName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    department: Optional[str] = None
    licenseNumber: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    address: Optional[str] = None
    joinDate: Optional[datetime] = None
    education: Optional[List[Dict[str, Any]]] = None
    certifications: Optional[List[Dict[str, Any]]] = None

def _get_or_create_instructor_for_user(db: Session, user: models.User) -> models.Instructor:
    inst = db.query(models.Instructor).filter(models.Instructor.user_id == user.id).first()
    if not inst:
        inst = models.Instructor(
            user_id=user.id,
            full_name=getattr(user, "full_name", None) or user.username,
            email=user.email,
            role="Instructor",
        )
        db.add(inst)
        try:
            db.commit()
        except Exception:
            db.rollback()
        db.refresh(inst)
    return inst

def _serialize_instructor_profile(inst: models.Instructor) -> InstructorProfileRead:
    certs: Optional[List[Dict[str, Any]]] = None
    educ: Optional[List[Dict[str, Any]]] = None
    try:
        if getattr(inst, "certifications_json", None):
            certs = json.loads(inst.certifications_json)  # type: ignore
    except Exception:
        certs = None
    try:
        if getattr(inst, "education_json", None):
            educ = json.loads(inst.education_json)  # type: ignore
    except Exception:
        educ = None

    try:
        print(
            "[DEBUG] Serialize InstructorProfile: id=", inst.instructor_id,
            " full_name=", getattr(inst, "full_name", None),
            " education_json_len=", len(inst.education_json or "") if hasattr(inst, "education_json") else None,
            " certifications_json_len=", len(inst.certifications_json or "") if hasattr(inst, "certifications_json") else None,
        )
    except Exception:
        pass

    return InstructorProfileRead(
        id=inst.instructor_id,
        fullName=inst.full_name,
        email=inst.email,
        phone=getattr(inst, "phone", None),
        specialization=getattr(inst, "specialization", None),
        department=getattr(inst, "department", None),
        licenseNumber=getattr(inst, "license_number", None),
        yearsOfExperience=getattr(inst, "years_of_experience", None),
        address=getattr(inst, "address", None),
        joinDate=getattr(inst, "join_date", None),
        role=inst.role,
        status="active",
        education=educ,
        certifications=certs,
    )

@router.get("/profile/me", response_model=InstructorProfileRead)
def get_my_instructor_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    inst = _get_or_create_instructor_for_user(db, current_user)
    return _serialize_instructor_profile(inst)

@router.put("/profile/me", response_model=InstructorProfileRead)
def update_my_instructor_profile(
    payload: InstructorProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    inst = _get_or_create_instructor_for_user(db, current_user)

    # Map payload to model fields
    try:
        print("[DEBUG] Incoming InstructorProfileUpdate payload:", payload.model_dump())
    except Exception:
        pass
    if payload.fullName is not None:
        inst.full_name = payload.fullName
    if payload.email is not None:
        inst.email = payload.email
    if payload.phone is not None:
        setattr(inst, "phone", payload.phone)
    if payload.specialization is not None:
        setattr(inst, "specialization", payload.specialization)
    if payload.department is not None:
        setattr(inst, "department", payload.department)
    if payload.licenseNumber is not None:
        setattr(inst, "license_number", payload.licenseNumber)
    if payload.yearsOfExperience is not None:
        setattr(inst, "years_of_experience", payload.yearsOfExperience)
    if payload.address is not None:
        setattr(inst, "address", payload.address)
    if payload.joinDate is not None:
        setattr(inst, "join_date", payload.joinDate)
    if payload.education is not None:
        try:
            setattr(inst, "education_json", json.dumps(payload.education))
        except Exception:
            setattr(inst, "education_json", None)
    if payload.certifications is not None:
        try:
            setattr(inst, "certifications_json", json.dumps(payload.certifications))
        except Exception:
            setattr(inst, "certifications_json", None)

    try:
        try:
            print(
                "[DEBUG] Saving Instructor: id=", inst.instructor_id,
                " user_id=", getattr(inst, "user_id", None),
                " full_name=", getattr(inst, "full_name", None),
                " phone=", getattr(inst, "phone", None),
                " specialization=", getattr(inst, "specialization", None),
                " department=", getattr(inst, "department", None),
                " license_number=", getattr(inst, "license_number", None),
                " years_of_experience=", getattr(inst, "years_of_experience", None),
                " address=", getattr(inst, "address", None),
                " join_date=", getattr(inst, "join_date", None),
                " education_json_len=", len(inst.education_json or "") if hasattr(inst, "education_json") else None,
                " certifications_json_len=", len(inst.certifications_json or "") if hasattr(inst, "certifications_json") else None,
            )
        except Exception:
            pass
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Constraint error while updating profile")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {e}")
    db.refresh(inst)
    try:
        print(
            "[DEBUG] After commit Instructor: id=", inst.instructor_id,
            " education_json_len=", len(inst.education_json or "") if hasattr(inst, "education_json") else None,
            " certifications_json_len=", len(inst.certifications_json or "") if hasattr(inst, "certifications_json") else None,
        )
    except Exception:
        pass
    return _serialize_instructor_profile(inst)

@router.get("/stats")
def get_instructor_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get statistics for the current instructor"""
    _require_instructor(current_user)
    
    stats = {
        "totalStudents": 0,
        "activeAssignments": 0,
        "pendingSubmissions": 0,
        "completedReviews": 0,
        "averageGrade": 0.0,
        "totalSubmissions": 0
    }
    
    try:
        # Count pending submissions for assignments created by this instructor
        pending_count = db.execute(text("""
            SELECT COUNT(*) as count
            FROM Submission s
            JOIN Assignment a ON a.assignment_id = s.assignment_id
            WHERE a.created_by = :instructor_id
              AND s.status = 'Pending'
        """), {"instructor_id": current_user.id}).scalar() or 0
        
        stats["pendingSubmissions"] = pending_count
        
        # Count total submissions for assignments created by this instructor
        total_submissions = db.execute(text("""
            SELECT COUNT(*) as count
            FROM Submission s
            JOIN Assignment a ON a.assignment_id = s.assignment_id
            WHERE a.created_by = :instructor_id
        """), {"instructor_id": current_user.id}).scalar() or 0
        
        stats["totalSubmissions"] = total_submissions
        
        # Count completed reviews
        completed_reviews = db.execute(text("""
            SELECT COUNT(*) as count
            FROM SubmissionFeedback sf
            WHERE sf.instructor_id = :instructor_id
        """), {"instructor_id": current_user.id}).scalar() or 0
        
        stats["completedReviews"] = completed_reviews
        
        # Calculate average grade
        avg_grade = db.execute(text("""
            SELECT AVG(sf.grade) as avg_grade
            FROM SubmissionFeedback sf
            WHERE sf.instructor_id = :instructor_id
            AND sf.grade IS NOT NULL
        """), {"instructor_id": current_user.id}).scalar()
        
        stats["averageGrade"] = float(avg_grade) if avg_grade else 0.0
        
    except Exception as e:
        # If any query fails, return default stats
        print(f"Error getting instructor stats: {e}")
    
    return stats

# ---- Data Export ----------------------------------------------------------------

@router.get("/export/students")
def export_students_data(
    format: Literal["csv", "excel"] = Query("excel", description="Export format: csv or excel"),
    include_grades: bool = Query(True, description="Include grades in export"),
    include_assignments: bool = Query(True, description="Include assignment details"),
    course_id: int | None = Query(None, description="Optional. If provided, only students of this course are exported."),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Export all students related to the current instructor with full details.

    Columns:
      - student_id, student_number, full_name, email, phone, gpa, year_level, status
      - courses_count: number of courses with this instructor
      - courses_list: comma-separated list of course codes/titles
      - average_grade: average of grades given by this instructor to the student's submissions
    """
    _require_instructor(current_user)

    try:
        # Ensure we have/know the Instructor row for this user
        instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        if not instructor:
            instructor = models.Instructor(
                user_id=current_user.id,
                full_name=getattr(current_user, "full_name", None) or f"Prof. {current_user.username}",
                email=current_user.email,
                role="Instructor",
                department_id=None,
            )
            db.add(instructor)
            try:
                db.commit()
            except Exception:
                db.rollback()
            db.refresh(instructor)

        instr_id = instructor.instructor_id

        # 1) Base students related to this instructor (via enrollments OR submissions)
        # Always scope by instructor-owned courses
        df_students = pd.DataFrame()
        if course_id:
            # Students by enrollments in this course
            enroll_students_sql = text(
                """
                SELECT DISTINCT s.student_id, s.student_number, s.full_name, s.email, s.phone, s.gpa, s.year_level, s.status
                FROM Student s
                JOIN CourseEnrollment ce ON ce.student_id = s.student_id
                JOIN Course c ON c.course_id = ce.course_id
                WHERE ce.course_id = :cid AND c.created_by = :instr
                """
            )
            # Students by submissions to assignments in this course
            sub_students_sql = text(
                """
                SELECT DISTINCT s.student_id, s.student_number, s.full_name, s.email, s.phone, s.gpa, s.year_level, s.status
                FROM Student s
                JOIN Submission sub ON sub.student_id = s.student_id
                JOIN Assignment a ON a.assignment_id = sub.assignment_id
                JOIN Course c ON c.course_id = a.course_id
                WHERE a.course_id = :cid AND c.created_by = :instr
                """
            )
            params = {"cid": int(course_id), "instr": instr_id}
            rows_enroll = db.execute(enroll_students_sql, params).mappings().all()
            rows_sub = db.execute(sub_students_sql, params).mappings().all()
            df_students = pd.DataFrame([dict(r) for r in rows_enroll])
            df_students2 = pd.DataFrame([dict(r) for r in rows_sub])
            if not df_students2.empty:
                df_students = pd.concat([df_students, df_students2], ignore_index=True)
            if not df_students.empty:
                df_students.drop_duplicates(subset=["student_id"], inplace=True)
        else:
            # All instructor-owned courses
            enroll_students_sql = text(
                """
                SELECT DISTINCT s.student_id, s.student_number, s.full_name, s.email, s.phone, s.gpa, s.year_level, s.status
                FROM Student s
                JOIN CourseEnrollment ce ON ce.student_id = s.student_id
                JOIN Course c ON c.course_id = ce.course_id
                WHERE c.created_by = :instr
                """
            )
            sub_students_sql = text(
                """
                SELECT DISTINCT s.student_id, s.student_number, s.full_name, s.email, s.phone, s.gpa, s.year_level, s.status
                FROM Student s
                JOIN Submission sub ON sub.student_id = s.student_id
                JOIN Assignment a ON a.assignment_id = sub.assignment_id
                JOIN Course c ON c.course_id = a.course_id
                WHERE c.created_by = :instr
                """
            )
            rows_enroll = db.execute(enroll_students_sql, {"instr": instr_id}).mappings().all()
            rows_sub = db.execute(sub_students_sql, {"instr": instr_id}).mappings().all()
            df_students = pd.DataFrame([dict(r) for r in rows_enroll])
            df_students2 = pd.DataFrame([dict(r) for r in rows_sub])
            if not df_students2.empty:
                if df_students.empty:
                    df_students = df_students2.copy()
                else:
                    df_students = pd.concat([df_students, df_students2], ignore_index=True)
            if not df_students.empty:
                df_students.drop_duplicates(subset=["student_id"], inplace=True)

        # If no students, return empty file gracefully
        if df_students.empty:
            if format == "excel":
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine="openpyxl") as writer:
                    pd.DataFrame().to_excel(writer, sheet_name="Students", index=False)
                output.seek(0)
                filename = f"students_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                return StreamingResponse(
                    io.BytesIO(output.read()),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename={filename}"},
                )
            else:
                output = io.StringIO()
                pd.DataFrame().to_csv(output, index=False)
                output.seek(0)
                filename = f"students_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                return StreamingResponse(
                    io.StringIO(output.getvalue()),
                    media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={filename}"},
                )


        # 2) Enrollments per student (only courses owned by this instructor)
        enroll_sql = text(
            """
            SELECT e.enrollment_id, e.course_id, e.student_id, e.status, e.enrolled_at,
                   c.title AS course_title, c.code AS course_code
            FROM CourseEnrollment e
            JOIN Course c ON c.course_id = e.course_id
            WHERE c.created_by = :instr_id
              AND e.status = 'Active'
              AND (:cid IS NULL OR e.course_id = :cid)
            """
        )
        enroll_params = {"instr_id": instr_id, "cid": int(course_id) if course_id else None}
        enroll_rows = db.execute(enroll_sql, enroll_params).mappings().all()
        df_enroll = pd.DataFrame([dict(r) for r in enroll_rows])

        # 3) Grades per student - comprehensive approach
        print(f"Looking for grades for instructor {instr_id}")
        
        # First, let's check what data we have
        debug_sql = text("SELECT COUNT(*) as total_submissions FROM Submission")
        debug_result = db.execute(debug_sql).mappings().first()
        print(f"Total submissions in database: {debug_result['total_submissions']}")
        
        debug_sql = text("SELECT COUNT(*) as total_feedback FROM SubmissionFeedback")
        debug_result = db.execute(debug_sql).mappings().first()
        print(f"Total feedback records: {debug_result['total_feedback']}")
        
        debug_sql = text("SELECT COUNT(*) as graded_feedback FROM SubmissionFeedback WHERE grade IS NOT NULL AND grade > 0")
        debug_result = db.execute(debug_sql).mappings().first()
        print(f"Graded feedback records: {debug_result['graded_feedback']}")
        
        # Try multiple approaches to get grades
        df_grades = pd.DataFrame()
        
        # Approach 1: Direct SubmissionFeedback grades
        if course_id:
            grades_sql = text(
                """
                SELECT sub.student_id, sf.grade, sf.created_at, a.assignment_id, a.title as assignment_title,
                       c.title as course_title, sf.instructor_id
                FROM Submission sub
                JOIN Assignment a ON a.assignment_id = sub.assignment_id
                JOIN Course c ON c.course_id = a.course_id
                JOIN SubmissionFeedback sf ON sf.submission_id = sub.submission_id
                WHERE sf.grade IS NOT NULL 
                  AND a.course_id = :cid
                  AND a.created_by = :instr
                """
            )
            grade_rows = db.execute(grades_sql, {"cid": int(course_id), "instr": instr_id}).mappings().all()
        else:
            grades_sql = text(
                """
                SELECT sub.student_id, sf.grade, sf.created_at, a.assignment_id, a.title as assignment_title,
                       c.title as course_title, sf.instructor_id
                FROM Submission sub
                JOIN Assignment a ON a.assignment_id = sub.assignment_id
                JOIN Course c ON c.course_id = a.course_id
                JOIN SubmissionFeedback sf ON sf.submission_id = sub.submission_id
                WHERE sf.grade IS NOT NULL 
                  AND a.created_by = :instr
                """
            )
            grade_rows = db.execute(grades_sql, {"instr": instr_id}).mappings().all()
        
        df_grades = pd.DataFrame([dict(r) for r in grade_rows])
        print(f"Found {len(df_grades)} grades from SubmissionFeedback")
        
        # Approach 2: Check CourseEnrollment grades as fallback
        if df_grades.empty:
            print("No SubmissionFeedback grades found, checking CourseEnrollment grades...")
            if course_id:
                enrollment_grades_sql = text(
                    """
                    SELECT ce.student_id, ce.grade, ce.enrolled_at as created_at, 
                           c.course_id as assignment_id, c.title as assignment_title,
                           c.title as course_title, c.created_by as instructor_id
                    FROM CourseEnrollment ce
                    JOIN Course c ON c.course_id = ce.course_id
                    WHERE ce.grade IS NOT NULL 
                      AND ce.course_id = :cid
                      AND c.created_by = :instr
                    """
                )
                enrollment_rows = db.execute(enrollment_grades_sql, {"cid": int(course_id), "instr": instr_id}).mappings().all()
            else:
                enrollment_grades_sql = text(
                    """
                    SELECT ce.student_id, ce.grade, ce.enrolled_at as created_at,
                           c.course_id as assignment_id, c.title as assignment_title,
                           c.title as course_title, c.created_by as instructor_id
                    FROM CourseEnrollment ce
                    JOIN Course c ON c.course_id = ce.course_id
                    WHERE ce.grade IS NOT NULL 
                      AND c.created_by = :instr
                    """
                )
                enrollment_rows = db.execute(enrollment_grades_sql, {"instr": instr_id}).mappings().all()
            
            df_enrollment_grades = pd.DataFrame([dict(r) for r in enrollment_rows])
            print(f"Found {len(df_enrollment_grades)} grades from CourseEnrollment")
            
            if not df_enrollment_grades.empty:
                df_grades = df_enrollment_grades
        
        # Approach 3: Ultra-broad fallback - any grades for students in instructor's courses
        if df_grades.empty:
            print("No grades found with instructor filter, trying broader search...")
            try:
                broad_sql = text(
                    """
                    SELECT DISTINCT sub.student_id, sf.grade, sf.created_at, a.assignment_id, a.title as assignment_title,
                           c.title as course_title, sf.instructor_id
                    FROM Submission sub
                    JOIN Assignment a ON a.assignment_id = sub.assignment_id
                    JOIN Course c ON c.course_id = a.course_id
                    JOIN SubmissionFeedback sf ON sf.submission_id = sub.submission_id
                    WHERE sf.grade IS NOT NULL
                      AND a.created_by = :instr
                    """
                )
                broad_rows = db.execute(broad_sql, {"instr": instr_id}).mappings().all()
                df_grades = pd.DataFrame([dict(r) for r in broad_rows])
                print(f"Broad search found {len(df_grades)} grade records")
            except Exception as e:
                print(f"Broad search failed: {e}")
        
        print(f"Final grade dataset has {len(df_grades)} records")

        # Compute courses_count and courses_list
        if not df_enroll.empty:
            courses_agg = (
                df_enroll.groupby("student_id")
                .agg(
                    courses_count=("course_id", "nunique"),
                    courses_list=("course_code", lambda x: ", ".join(sorted({str(v) for v in x}))),
                )
                .reset_index()
            )
        else:
            courses_agg = pd.DataFrame(columns=["student_id", "courses_count", "courses_list"])

        # Compute average grades and latest (real) grade
        if not df_grades.empty:
            print(f"Processing {len(df_grades)} grade records for average calculation")
            try:
                # ensure created_at is datetime
                if "created_at" in df_grades.columns:
                    df_grades["created_at"] = pd.to_datetime(df_grades["created_at"], errors="coerce")
            except Exception:
                pass

            # Debug: Print sample grades
            print("Sample grade data:")
            print(df_grades.head())
            print(f"Grade range: {df_grades['grade'].min()} - {df_grades['grade'].max()}")

            # Calculate average grade per student across ALL their tasks
            grades_agg = (
                df_grades.groupby("student_id")
                .agg(
                    average_grade=("grade", "mean"),
                    total_assignments=("assignment_id", "nunique"),
                    total_submissions=("grade", "count")
                )
                .reset_index()
            )
            
            # Round average grades to 2 decimal places
            grades_agg["average_grade"] = grades_agg["average_grade"].round(2)
            
            print("Grade aggregation results:")
            print(grades_agg)

            # latest grade per student (by created_at, fallback to as-is order)
            if "created_at" in df_grades.columns and df_grades["created_at"].notna().any():
                df_sorted = df_grades.sort_values(["student_id", "created_at"])  # ascending -> take last
            else:
                df_sorted = df_grades.copy()
            latest = df_sorted.groupby("student_id").tail(1)[["student_id", "grade"]].rename(columns={"grade": "real_grade"})
        else:
            print("No grades found - creating empty aggregation")
            grades_agg = pd.DataFrame(columns=["student_id", "average_grade", "total_assignments", "total_submissions"])
            latest = pd.DataFrame(columns=["student_id", "real_grade"])

        # Ensure students with grades are included in the export
        print(f"Students before filtering: {df_students['student_id'].tolist() if not df_students.empty else 'None'}")
        print(f"Students with grades: {grades_agg['student_id'].tolist() if not grades_agg.empty else 'None'}")
        print(f"Enrolled students: {df_enroll['student_id'].tolist() if not df_enroll.empty else 'None'}")
        
        # Include students who have grades even if they're not in the enrollment list
        if not grades_agg.empty and not df_students.empty:
            students_with_grades = set(grades_agg['student_id'].tolist())
            current_students = set(df_students['student_id'].tolist())
            missing_students = students_with_grades - current_students
            
            if missing_students:
                print(f"Adding missing students with grades: {list(missing_students)}")
                # Get missing student records
                missing_sql = text(
                    """
                    SELECT DISTINCT s.student_id, s.student_number, s.full_name, s.email, s.phone, s.gpa, s.year_level, s.status
                    FROM Student s
                    WHERE s.student_id IN ({})
                    """.format(','.join(map(str, missing_students)))
                )
                missing_rows = db.execute(missing_sql).mappings().all()
                df_missing = pd.DataFrame([dict(r) for r in missing_rows])
                if not df_missing.empty:
                    print(f"Found missing student records: {len(df_missing)}")
                    df_students = pd.concat([df_students, df_missing], ignore_index=True)
                    print(f"df_students now has {len(df_students)} students: {df_students['student_id'].tolist()}")
                else:
                    print(f"No student records found in database for student_ids: {list(missing_students)}")
        
        # Include all students in export (no restrictive filtering by enrollment/grades)
        # Previous filtering excluded students not enrolled in instructor-owned courses or without grades,
        # which caused missing students like ST20 in the CSV. We now export all students.

        # Merge everything
        df = (
            df_students
            .merge(courses_agg, on="student_id", how="left")
            .merge(grades_agg, on="student_id", how="left")
            .merge(latest, on="student_id", how="left")
        )
        df["courses_count"] = df["courses_count"].fillna(0).astype(int)
        df["courses_list"] = df["courses_list"].fillna("")
        
        # Handle grade columns properly - fill NaN with 0 and ensure proper formatting
        df["average_grade"] = df["average_grade"].fillna(0).astype(float).round(2)
        df["real_grade"] = df["real_grade"].fillna(0).astype(float).round(2)
        df["total_assignments"] = df["total_assignments"].fillna(0).astype(int)
        df["total_submissions"] = df["total_submissions"].fillna(0).astype(int)
        
        print("Final export data:")
        print(df[["student_id", "full_name", "average_grade", "total_assignments", "total_submissions"]].head())
        
        # DEBUG: Check for ST100 specifically
        st100_row = df[df['student_id'] == 100]
        if not st100_row.empty:
            print(f"ST100 (student_id=100) data: {st100_row[['student_id', 'full_name', 'average_grade']].to_dict('records')}")
        
        # DEBUG: Check if grade data exists for student_id 101
        if not grades_agg.empty:
            grade_101 = grades_agg[grades_agg['student_id'] == 101]
            if not grade_101.empty:
                print(f"Grade data for student_id 101: {grade_101.to_dict('records')}")
        
        # DEBUG: Check student number mapping
        debug_sql = text("SELECT student_id, student_number, full_name FROM Student WHERE student_number = 'ST100' OR student_id IN (100, 101)")
        debug_rows = db.execute(debug_sql).mappings().all()
        print(f"ST100 mapping debug: {[dict(r) for r in debug_rows]}")
        

        # Drop unneeded columns if present
        for col in ["year_level", "status", "average_grade_100", "real_grade"]:
            if col in df.columns:
                df.drop(columns=[col], inplace=True)

        # Build detailed assignments-by-student sheet (with required columns)
        assignments_export_df = pd.DataFrame()
        try:
            assign_sql = text(
                """
                SELECT 
                    st.student_id,
                    st.full_name,
                    st.email,
                    st.phone,
                    a.assignment_id,
                    a.title AS assignment_title,
                    a.max_grade AS assignment_max_grade,
                    sf.grade AS received_grade,
                    a.course_id
                FROM Submission sub
                JOIN Student st ON st.student_id = sub.student_id
                JOIN Assignment a ON a.assignment_id = sub.assignment_id
                LEFT JOIN SubmissionFeedback sf ON sf.submission_id = sub.submission_id
                JOIN Course c ON c.course_id = a.course_id
                WHERE c.created_by = :instr
                  AND (:cid IS NULL OR a.course_id = :cid)
                ORDER BY st.student_id, a.assignment_id
                """
            )
            assign_rows = db.execute(assign_sql, {"instr": instr_id, "cid": int(course_id) if course_id else None}).mappings().all()
            assignments_export_df = pd.DataFrame([dict(r) for r in assign_rows])
            # Keep only the requested columns and nice names if we have data
            if not assignments_export_df.empty:
                assignments_export_df = assignments_export_df[[
                    "student_id",
                    "full_name",
                    "email",
                    "phone",
                    "assignment_title",
                    "received_grade",
                    "assignment_max_grade",
                ]]
                assignments_export_df.rename(columns={
                    "full_name": "student_full_name",
                    "email": "student_email",
                    "phone": "student_phone",
                    "assignment_title": "assignment",
                    "received_grade": "grade",
                    "assignment_max_grade": "assignment_max",
                }, inplace=True)
        except Exception:
            # Non-fatal; continue without this sheet
            assignments_export_df = pd.DataFrame()

        # Output
        if format == "excel":
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                df.to_excel(writer, sheet_name="Students", index=False)

                if include_assignments:
                    # Write enrollments and grades as detail sheets
                    (df_enroll if not df_enroll.empty else pd.DataFrame()).to_excel(writer, sheet_name="Enrollments", index=False)
                    if include_grades:
                        (df_grades if not df_grades.empty else pd.DataFrame()).to_excel(writer, sheet_name="Grades", index=False)
                    # Always try to include per-student assignments sheet as requested
                    (assignments_export_df if not assignments_export_df.empty else pd.DataFrame(columns=[
                        "student_id","student_full_name","student_email","student_phone","assignment","grade","assignment_max"
                    ])).to_excel(writer, sheet_name="AssignmentsByStudent", index=False)

                    # Build a single flat sheet that matches the exact requested format
                    try:
                        if not assignments_export_df.empty:
                            combined = assignments_export_df.copy()
                        else:
                            # If no assignments yet, still provide headers
                            combined = pd.DataFrame(columns=[
                                "student_id","student_full_name","student_email","student_phone","assignment","grade","assignment_max"
                            ])
                        combined.to_excel(writer, sheet_name="StudentData", index=False)
                    except Exception:
                        pass

            output.seek(0)
            filename = f"students_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            return StreamingResponse(
                io.BytesIO(output.read()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"},
            )
        else:
            output = io.StringIO()
            df.to_csv(output, index=False)
            output.seek(0)
            filename = f"students_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            return StreamingResponse(
                io.StringIO(output.getvalue()),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename={filename}"},
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export data: {str(e)}")

@router.get("/export/assignments")
def export_assignments_data(
    format: Literal["csv", "excel"] = Query("excel", description="Export format: csv or excel"),
    include_submissions: bool = Query(True, description="Include submission details"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Export assignments and submissions data to CSV or Excel"""
    _require_instructor(current_user)
    
    try:
        # Get assignments for this instructor
        assignments_sql = """
            SELECT 
                a.assignment_id,
                a.title,
                a.description,
                a.deadline,
                a.max_grade,
                a.is_active,
                a.created_at,
                d.name as department,
                COUNT(sub.submission_id) as total_submissions,
                COUNT(CASE WHEN sub.status = 'Pending' THEN 1 END) as pending_submissions,
                COUNT(CASE WHEN sub.status = 'Accepted' THEN 1 END) as accepted_submissions,
                COUNT(CASE WHEN sub.status = 'Rejected' THEN 1 END) as rejected_submissions,
                AVG(sf.grade) as average_grade
            FROM Assignment a
            LEFT JOIN Department d ON d.department_id = a.department_id
            LEFT JOIN Submission sub ON sub.assignment_id = a.assignment_id
            LEFT JOIN SubmissionFeedback sf ON sf.submission_id = sub.submission_id
            WHERE a.instructor_id = :instructor_id
            GROUP BY a.assignment_id, a.title, a.description, a.deadline, a.max_grade, a.is_active, a.created_at, d.name
            ORDER BY a.created_at DESC
        """
        
        assignments_data = db.execute(text(assignments_sql), {
            "instructor_id": current_user.id
        }).mappings().all()
        
        df_assignments = pd.DataFrame([dict(row) for row in assignments_data])
        
        if df_assignments.empty:
            df_assignments = pd.DataFrame({
                'assignment_id': [],
                'title': [],
                'description': [],
                'deadline': [],
                'max_grade': [],
                'is_active': [],
                'created_at': [],
                'department': [],
                'total_submissions': [],
                'pending_submissions': [],
                'accepted_submissions': [],
                'rejected_submissions': [],
                'average_grade': []
            })
        
        if include_submissions and not df_assignments.empty:
            # Get detailed submission data
            submissions_sql = """
                SELECT 
                    sub.submission_id,
                    a.title as assignment_title,
                    s.full_name as student_name,
                    s.student_number,
                    sub.submitted_at,
                    sub.status,
                    sub.original_filename,
                    sf.grade,
                    sf.feedback_text,
                    sf.created_at as graded_at
                FROM Submission sub
                JOIN Assignment a ON a.assignment_id = sub.assignment_id
                JOIN Student s ON s.student_id = sub.student_id
                LEFT JOIN SubmissionFeedback sf ON sf.submission_id = sub.submission_id
                WHERE a.instructor_id = :instructor_id
                ORDER BY a.title, s.full_name
            """
            
            submissions_data = db.execute(text(submissions_sql), {
                "instructor_id": current_user.id
            }).mappings().all()
            
            df_submissions = pd.DataFrame([dict(row) for row in submissions_data])
            
            if format == "excel":
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    # Assignments overview
                    df_assignments.to_excel(writer, sheet_name='Assignments Overview', index=False)
                    
                    # Submissions detail
                    if not df_submissions.empty:
                        df_submissions.to_excel(writer, sheet_name='Submissions Detail', index=False)
                
                output.seek(0)
                filename = f"assignments_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                
                return StreamingResponse(
                    io.BytesIO(output.read()),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename={filename}"}
                )
            else:
                # For CSV, create a combined view
                if not df_submissions.empty:
                    output = io.StringIO()
                    df_submissions.to_csv(output, index=False)
                    output.seek(0)
                    
                    filename = f"assignments_submissions_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                    
                    return StreamingResponse(
                        io.StringIO(output.getvalue()),
                        media_type="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={filename}"}
                    )
        
        # Export only assignments data
        if format == "excel":
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df_assignments.to_excel(writer, sheet_name='Assignments', index=False)
            
            output.seek(0)
            filename = f"assignments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            
            return StreamingResponse(
                io.BytesIO(output.read()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        else:
            output = io.StringIO()
            df_assignments.to_csv(output, index=False)
            output.seek(0)
            
            filename = f"assignments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
            return StreamingResponse(
                io.StringIO(output.getvalue()),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export assignments data: {str(e)}")# ---- Instructor Schedule ----------------------------------------------------------

class ScheduleItemRead(BaseModel):
    id: int
    title: str
    type: str
    startTime: str
    endTime: str
    date: datetime
    location: str
    description: Optional[str] = None
    status: str

class ScheduleItemCreate(BaseModel):
    title: str
    type: Literal["class", "office_hours", "meeting", "exam"] = "class"
    date: datetime
    startTime: str
    endTime: str
    location: str
    description: Optional[str] = None
    status: Literal["scheduled", "completed", "cancelled"] = "scheduled"

class ScheduleItemUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[Literal["class", "office_hours", "meeting", "exam"]] = None
    date: Optional[datetime] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["scheduled", "completed", "cancelled"]] = None

def _serialize_schedule_item(it: models.InstructorSchedule) -> ScheduleItemRead:
    return ScheduleItemRead(
        id=it.id,
        title=it.title,
        type=it.type,
        startTime=it.start_time,
        endTime=it.end_time,
        date=it.date,
        location=it.location,
        description=it.description,
        status=it.status,
    )

@router.get("/analytics")
def get_instructor_analytics(
    period: str = Query("month", description="Time period: week, month, quarter, year"),
    course_id: int = Query(None, description="Filter by specific course ID"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get comprehensive analytics data for instructor dashboard."""
    _require_instructor(current_user)
    
    # Get instructor
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    
    # Calculate date range based on period
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    if period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    elif period == "quarter":
        start_date = now - timedelta(days=90)
    else:  # year
        start_date = now - timedelta(days=365)
    
    # Get instructor's courses (support schemas storing created_by as instructor_id or user.id)
    from sqlalchemy import or_ as sa_or
    courses_query = db.query(models.Course).filter(
        sa_or(
            models.Course.created_by == instructor.instructor_id,
            models.Course.created_by == current_user.id,
        )
    )
    
    # Filter by specific course if provided
    if course_id is not None:
        courses_query = courses_query.filter(models.Course.course_id == course_id)
        # Verify the course belongs to this instructor
        course = courses_query.first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found or not accessible")
        courses = [course]
        course_ids = [course_id]
    else:
        courses = courses_query.all()
        course_ids = [c.course_id for c in courses]
    
    # Get students enrolled in instructor's courses (filtered by specific course if provided)
    students_query = (
        db.query(models.Student)
        .join(models.CourseEnrollment, models.CourseEnrollment.student_id == models.Student.student_id)
        .filter(models.CourseEnrollment.course_id.in_(course_ids))
        .filter(models.CourseEnrollment.status == "Active")
        .distinct()
    )
    total_students = students_query.count()
    
    # Build assignments query limited to this instructor and active only
    q_assign = db.query(models.Assignment)
    # Ownership: support Assignment.created_by being instructor.instructor_id or current_user.id
    if hasattr(models.Assignment, "created_by"):
        q_assign = q_assign.filter(
            sa_or(
                models.Assignment.created_by == instructor.instructor_id,
                models.Assignment.created_by == current_user.id,
            )
        )
    else:
        # If schema lacks created_by, fall back to zero to avoid inflating with others' data
        print("DEBUG: Assignment.created_by missing; treating owned assignments as empty for analytics")
        assignments = []
        assignment_ids = []
        total_submissions = 0
        average_grade = 0
        submission_trends = []
        grade_distribution = []
        course_performance = []
        top_students = []
        print("DEBUG: Analytics summary -> totalStudents=0, activeAssignments=0, totalSubmissions=0, avgGrade=0, topStudents=0")
        return {
            "overview": {
                "totalStudents": total_students,
                "activeAssignments": 0,
                "totalSubmissions": 0,
                "averageGrade": 0,
            },
            "submissionTrends": submission_trends,
            "gradeDistribution": grade_distribution,
            "coursePerformance": course_performance,
            "topStudents": top_students,
        }
    
    # Filter by specific course if provided
    if course_id is not None:
        q_assign = q_assign.filter(models.Assignment.course_id == course_id)
    # Active flags
    if hasattr(models.Assignment, "is_active"):
        q_assign = q_assign.filter(models.Assignment.is_active == True)

    # Require that the assignment's course exists and is active and owned by this instructor (EXISTS subquery)
    try:
        from sqlalchemy import exists, and_ as sa_and
        if hasattr(models, "Course"):
            course_exists = (
                db.query(models.Course.course_id)
                .filter(
                    models.Course.course_id == models.Assignment.course_id,
                    (
                        sa_or(
                            models.Course.created_by == instructor.instructor_id,
                            models.Course.created_by == current_user.id,
                        )
                    ) if hasattr(models.Course, "created_by") else True,
                    (models.Course.is_active == True) if hasattr(models.Course, "is_active") else True,
                )
                .exists()
            )
            q_assign = q_assign.filter(course_exists)
    except Exception:
        # If EXISTS fails for any reason, we keep previous filters (still owned by instructor via Assignment.created_by)
        pass
    assignments = q_assign.all()

    assignment_ids = [a.assignment_id for a in assignments]
    
    # Debug: Add comprehensive logging
    print(f"DEBUG: Analytics request - Period: {period}, Course ID: {course_id}")
    print(f"DEBUG: Found {len(courses)} courses, {total_students} students, {len(assignments)} assignments")
    print(f"DEBUG: Course IDs: {course_ids}")
    print(f"DEBUG: Assignment IDs: {assignment_ids}")
    
    # Validation: Ensure data consistency
    if course_id is not None and course_id not in course_ids:
        print(f"ERROR: Requested course {course_id} not found in instructor's courses {course_ids}")
        raise HTTPException(status_code=404, detail="Course not found or not accessible")
    
    # Additional validation for course-specific requests
    if course_id is not None:
        course_enrollments = (
            db.query(models.CourseEnrollment)
            .filter(models.CourseEnrollment.course_id == course_id)
            .filter(models.CourseEnrollment.status == "Active")
            .count()
        )
        print(f"DEBUG: Course {course_id} has {course_enrollments} active enrollments")
    
    # Get submissions for instructor's assignments (course-specific if filtering)
    if assignment_ids:
        submissions_query = (
            db.query(models.Submission)
            .filter(models.Submission.assignment_id.in_(assignment_ids))
            .filter(models.Submission.submitted_at >= start_date)
        )
        total_submissions = submissions_query.count()
    else:
        total_submissions = 0
    
    # Do NOT use any global fallback here. If the instructor has no assignments/submissions,
    # keep totals at 0 to avoid leaking other instructors' data.
    print(f"DEBUG: Using instructor-scoped submissions count: {total_submissions}")
    
    # Get grades with feedback (course-specific if filtering), normalized to percentage by assignment max_grade
    if assignment_ids:
        try:
            denom = func.nullif(func.coalesce(models.Assignment.max_grade, 100.0), 0)
            avg_percent = (
                db.query(func.avg((models.SubmissionFeedback.grade * 100.0) / denom))
                .join(models.Submission, models.Submission.submission_id == models.SubmissionFeedback.submission_id)
                .join(models.Assignment, models.Assignment.assignment_id == models.Submission.assignment_id)
                .filter(models.Submission.assignment_id.in_(assignment_ids))
                .filter(models.SubmissionFeedback.grade.isnot(None))
                .scalar()
            )
        except Exception:
            avg_percent = None
        average_grade = float(avg_percent) if avg_percent is not None else 0.0
    else:
        average_grade = 0.0
    
    # Do NOT use any global fallback here. If the instructor has no grades,
    # keep average at 0 to avoid leaking other instructors' data.
    print(f"DEBUG: Using instructor-scoped average grade: {average_grade}")
    
    # Submission trends over time (course-specific if filtering)
    from sqlalchemy import func, text
    submission_trends = []
    days_range = 7 if period == "week" else 30 if period == "month" else 90 if period == "quarter" else 365
    
    if assignment_ids:
        for i in range(days_range):
            date = now - timedelta(days=days_range - 1 - i)
            day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = date.replace(hour=23, minute=59, second=59, microsecond=999999)
            
            # Course-specific submissions for this day
            day_submissions = (
                db.query(models.Submission)
                .filter(models.Submission.assignment_id.in_(assignment_ids))
                .filter(models.Submission.submitted_at >= day_start)
                .filter(models.Submission.submitted_at <= day_end)
                .count()
            )
            
            # Course-specific reviews for this day
            day_reviews = (
                db.query(models.SubmissionFeedback)
                .join(models.Submission, models.Submission.submission_id == models.SubmissionFeedback.submission_id)
                .filter(models.Submission.assignment_id.in_(assignment_ids))
                .filter(models.SubmissionFeedback.created_at >= day_start)
                .filter(models.SubmissionFeedback.created_at <= day_end)
                .count()
            )
            
            submission_trends.append({
                "date": date.strftime("%b %d"),
                "submissions": day_submissions,
                "reviews": day_reviews
            })
    else:
        # Generate empty data for the period
        for i in range(days_range):
            date = now - timedelta(days=days_range - 1 - i)
            submission_trends.append({
                "date": date.strftime("%b %d"),
                "submissions": 0,
                "reviews": 0
            })
    
    # Grade distribution (normalized to percentage)
    grade_distribution = []
    percents: list[float] = []
    if assignment_ids:
        try:
            denom = func.nullif(func.coalesce(models.Assignment.max_grade, 100.0), 0)
            rows = (
                db.query((models.SubmissionFeedback.grade * 100.0) / denom)
                .join(models.Submission, models.Submission.submission_id == models.SubmissionFeedback.submission_id)
                .join(models.Assignment, models.Assignment.assignment_id == models.Submission.assignment_id)
                .filter(models.Submission.assignment_id.in_(assignment_ids))
                .filter(models.SubmissionFeedback.grade.isnot(None))
                .all()
            )
            percents = [float(r[0]) for r in rows if r[0] is not None]
        except Exception:
            percents = []

    if percents:
        excellent = len([p for p in percents if p >= 90])
        good = len([p for p in percents if 70 <= p < 90])
        average = len([p for p in percents if 60 <= p < 70])
        below = len([p for p in percents if p < 60])

        grade_distribution = [
            {"name": "Excellent (>=90%)", "value": excellent, "color": "#10b981"},
            {"name": "Good (70–89%)", "value": good, "color": "#0ea5e9"},
            {"name": "Average (60–69%)", "value": average, "color": "#eab308"},
            {"name": "Below (<60%)", "value": below, "color": "#ef4444"},
        ]
        # Also set the overall average grade (percent) from the same normalized list
        try:
            average_grade = float(sum(percents) / len(percents))
        except Exception:
            pass
    
    # Course performance
    course_performance = []
    for course in courses:
        course_assignments = [a for a in assignments if a.course_id == course.course_id]
        course_assignment_ids = [a.assignment_id for a in course_assignments]
        
        if course_assignment_ids:
            course_submissions = (
                db.query(models.Submission)
                .filter(models.Submission.assignment_id.in_(course_assignment_ids))
                .count()
            )
            
            # Normalize per-course average grade to percent
            try:
                denom = func.nullif(func.coalesce(models.Assignment.max_grade, 100.0), 0)
                course_avg_grade_val = (
                    db.query(func.avg((models.SubmissionFeedback.grade * 100.0) / denom))
                    .join(models.Submission, models.Submission.submission_id == models.SubmissionFeedback.submission_id)
                    .join(models.Assignment, models.Assignment.assignment_id == models.Submission.assignment_id)
                    .filter(models.Submission.assignment_id.in_(course_assignment_ids))
                    .filter(models.SubmissionFeedback.grade.isnot(None))
                    .scalar()
                )
                course_avg_grade = float(course_avg_grade_val) if course_avg_grade_val is not None else 0.0
            except Exception:
                course_avg_grade = 0.0
            
            # Calculate completion rate - robust approach with multiple safeguards
            enrolled_students = (
                db.query(models.CourseEnrollment)
                .filter(models.CourseEnrollment.course_id == course.course_id)
                .filter(models.CourseEnrollment.status == "Active")
                .count()
            )
            
            # Calculate completion rate as: (unique students who submitted) / (total enrolled students) * 100
            unique_students_submitted = (
                db.query(models.Submission.student_id)
                .filter(models.Submission.assignment_id.in_(course_assignment_ids))
                .distinct()
                .count()
            )
            
            # Multiple safeguards for completion rate calculation
            if enrolled_students <= 0:
                completion_rate = 0
            elif unique_students_submitted <= 0:
                completion_rate = 0
            elif unique_students_submitted > enrolled_students:
                # This should never happen, but if it does, cap at 100%
                print(f"WARNING: More students submitted ({unique_students_submitted}) than enrolled ({enrolled_students}) for course {course.course_id}")
                completion_rate = 100
            else:
                completion_rate = (unique_students_submitted / enrolled_students) * 100
            
            # Final safety cap at 100%
            completion_rate = min(max(completion_rate, 0), 100)
            
            # Debug logging for completion rate calculation
            print(f"DEBUG: Course {course.course_id} ({course.title}) - Enrolled: {enrolled_students}, Submitted: {unique_students_submitted}, Completion: {completion_rate:.1f}%")
            
            course_performance.append({
                "course": course.title,
                "avgGrade": round(course_avg_grade, 1),
                "submissions": course_submissions,
                "completion": round(completion_rate, 0)
            })
        else:
            # Add course even if no assignments, with zero values
            course_performance.append({
                "course": course.title,
                "avgGrade": 0,
                "submissions": 0,
                "completion": 0
            })
    
    # Top performing students
    top_students = []
    student_grades = {}
    
    # Collect graded submissions for these assignments as raw tuples to avoid lazy relationship pitfalls
    graded_rows = []  # (student_id, submission_id, grade, max_grade, full_name)
    if assignment_ids:
        # Base query for graded submissions
        base_query = (
            db.query(
                models.Submission.student_id,
                models.Submission.submission_id,
                models.SubmissionFeedback.grade,
                models.Assignment.max_grade,
                models.Student.full_name,
            )
            .join(models.SubmissionFeedback, models.SubmissionFeedback.submission_id == models.Submission.submission_id)
            .join(models.Assignment, models.Assignment.assignment_id == models.Submission.assignment_id)
            .outerjoin(models.Student, models.Student.student_id == models.Submission.student_id)
            .filter(models.Submission.assignment_id.in_(assignment_ids))
            .filter(models.SubmissionFeedback.grade.isnot(None))
        )
        
        # If filtering by specific course, only include students enrolled in that course
        if course_id is not None:
            graded_rows = (
                base_query
                .join(models.CourseEnrollment, models.CourseEnrollment.student_id == models.Submission.student_id)
                .filter(models.CourseEnrollment.course_id == course_id)
                .filter(models.CourseEnrollment.status == "Active")
                .all()
            )
        else:
            graded_rows = base_query.all()
            
        print(f"DEBUG: Found {len(graded_rows)} graded rows (by assignment_ids)")
    
    # Fallback: if none found, try grades given by the current instructor regardless of assignment linkage
    # BUT ONLY if we're not filtering by a specific course (to avoid showing wrong students)
    if not graded_rows and course_id is None:
        try:
            print("DEBUG: Falling back to grades by current instructor (SubmissionFeedback.instructor_id)")
            fallback_query = (
                db.query(
                    models.Submission.student_id,
                    models.Submission.submission_id,
                    models.SubmissionFeedback.grade,
                    models.Assignment.max_grade,
                    models.Student.full_name,
                )
                .join(models.SubmissionFeedback, models.SubmissionFeedback.submission_id == models.Submission.submission_id)
                .join(models.Assignment, models.Assignment.assignment_id == models.Submission.assignment_id)
                .outerjoin(models.Student, models.Student.student_id == models.Submission.student_id)
                .filter(models.SubmissionFeedback.instructor_id == current_user.id)
                .filter(models.SubmissionFeedback.grade.isnot(None))
            )
            
            graded_rows = fallback_query.all()
            print(f"DEBUG: Fallback found {len(graded_rows)} graded rows by instructor")
        except Exception as e:
            print(f"DEBUG: Fallback by instructor failed: {e}")
    elif not graded_rows and course_id is not None:
        print(f"DEBUG: No graded submissions found for course {course_id} - this is expected if no assignments have been graded yet")

    # Aggregate graded rows by student (build primary Top Performers from grades)
    if graded_rows:
        # Additional validation: ensure we only process students enrolled in the course
        enrolled_student_ids = set()
        if course_id is not None:
            enrolled_student_ids = set(
                db.query(models.CourseEnrollment.student_id)
                .filter(models.CourseEnrollment.course_id == course_id)
                .filter(models.CourseEnrollment.status == "Active")
                .all()
            )
            enrolled_student_ids = {sid[0] for sid in enrolled_student_ids}
            print(f"DEBUG: Course {course_id} has {len(enrolled_student_ids)} enrolled students: {enrolled_student_ids}")
        
        for sid, sub_id, grade, max_g, full_name in graded_rows:
            # Skip if filtering by course and student is not enrolled
            if course_id is not None and sid not in enrolled_student_ids:
                print(f"DEBUG: Skipping student {sid} - not enrolled in course {course_id}")
                continue
                
            if sid not in student_grades:
                student_grades[sid] = {"percents": [], "submissions": 0}
            if grade is not None:
                try:
                    mg = float(max_g) if max_g is not None else 100.0
                    if mg > 0:
                        pct = (float(grade) * 100.0) / mg
                        student_grades[sid]["percents"].append(pct)
                except Exception:
                    pass
            student_grades[sid]["submissions"] += 1
            print(f"DEBUG: Student {sid} ({full_name}) submission {sub_id}: grade {grade}")

        # Calculate averages and build top list from graded data
        for sid, data in student_grades.items():
            if data["percents"]:
                avg = sum(data["percents"]) / len(data["percents"]) if data["percents"] else 0
                # Get student name with better error handling
                try:
                    student = db.query(models.Student).filter(models.Student.student_id == sid).first()
                    if student and student.full_name:
                        name = student.full_name
                    else:
                        # Try to get name from enrollment record
                        enrollment = db.query(models.CourseEnrollment).filter(
                            models.CourseEnrollment.student_id == sid
                        ).first()
                        if enrollment and hasattr(enrollment, 'student_name'):
                            name = enrollment.student_name
                        else:
                            name = f"Student ID {sid}"
                except Exception as e:
                    print(f"DEBUG: Error getting name for student {sid}: {e}")
                    name = f"Student ID {sid}"
                
                top_students.append({
                    "name": name,
                    "grade": round(avg, 1),  # already a percent
                    "submissions": data["submissions"],
                })
                print(f"DEBUG: Added top performer: {name} (ID: {sid}) - Grade: {avg:.1f}, Submissions: {data['submissions']}")
        
        # Keep best 5 by grade and add validation
        top_students = sorted(top_students, key=lambda x: x["grade"], reverse=True)[:5]
        
        # Final validation: ensure we don't exceed enrolled students count
        if course_id is not None and len(top_students) > len(enrolled_student_ids):
            print(f"WARNING: Top performers count ({len(top_students)}) exceeds enrolled students ({len(enrolled_student_ids)}) for course {course_id}")
            # This shouldn't happen with our filtering, but if it does, truncate
            top_students = top_students[:len(enrolled_student_ids)]
        
        print(f"DEBUG: Final top performers count: {len(top_students)} for course {course_id}")

    # Fallback 2: If still empty, use CourseEnrollment.grade for students in instructor's courses
    # BUT ONLY for "all courses" view, not for specific course filtering
    if not top_students and course_ids and course_id is None:
        try:
            print("DEBUG: Falling back to CourseEnrollment grades for instructor's courses")
            enrollment_grades = (
                db.query(models.CourseEnrollment.student_id, models.CourseEnrollment.grade)
                .filter(models.CourseEnrollment.course_id.in_(course_ids))
                .filter(models.CourseEnrollment.grade.isnot(None))
                .all()
            )
            # Aggregate by student_id
            temp: Dict[int, Dict[str, Any]] = {}
            for sid, gr in enrollment_grades:
                if sid not in temp:
                    temp[sid] = {"grades": [], "submissions": 0}
                temp[sid]["grades"].append(float(gr))
                # Treat each course grade as one submission-equivalent for ranking display
                temp[sid]["submissions"] += 1
            # Build top_students from enrollment grades
            for sid, data in temp.items():
                student = db.query(models.Student).filter(models.Student.student_id == sid).first()
                if student and data["grades"]:
                    avg_grade = sum(data["grades"]) / len(data["grades"])
                    top_students.append({
                        "name": student.full_name,
                        "grade": round(avg_grade, 1),
                        "submissions": data["submissions"],
                    })
            # Sort and keep top 5
            top_students = sorted(top_students, key=lambda x: x["grade"], reverse=True)[:5]
            print(f"DEBUG: Enrollment fallback produced {len(top_students)} top students")
        except Exception as e:
            print(f"DEBUG: Enrollment grades fallback failed: {e}")
        
        # Note: primary graded Top Performers already computed above; enrollment fallback builds a separate list when needed

    # Fallback: If still no top students (no grades yet), build from submissions only (ungraded)
    # BUT ONLY for "all courses" view, not for specific course filtering
    if not top_students and assignment_ids and course_id is None:
        try:
            print("DEBUG: Building Top Performers from ungraded submissions (fallback)")
            submit_counts = (
                db.query(
                    models.Submission.student_id,
                    models.Student.full_name,
                    func.count(models.Submission.submission_id),
                )
                .outerjoin(models.Student, models.Student.student_id == models.Submission.student_id)
                .filter(models.Submission.assignment_id.in_(assignment_ids))
                .filter(models.Submission.submitted_at >= start_date)
                .group_by(models.Submission.student_id, models.Student.full_name)
                .all()
            )
            temp = []
            for sid, full_name, cnt in submit_counts:
                name = full_name or f"Student ID {sid}"
                temp.append({
                    "name": name,
                    "grade": None,  # no grade yet
                    "submissions": int(cnt),
                })
            # Rank by submissions desc and take top 5
            temp = sorted(temp, key=lambda x: x["submissions"], reverse=True)[:5]
            if temp:
                print(f"DEBUG: Ungraded Top Performers fallback produced {len(temp)} students")
            top_students = temp
        except Exception as e:
            print(f"DEBUG: Ungraded Top Performers fallback failed: {e}")
    elif not top_students and course_id is not None:
        print(f"DEBUG: No top performers found for course {course_id} - this is expected if no graded submissions exist")

    # Removed global Top Performers fallback to prevent cross-instructor leakage.
    
    # Final fallback for overview average: if still zero/None but we have top_students with grades,
    # derive average from top_students percent grades to avoid showing 0 when data exists.
    try:
        if (average_grade is None or float(average_grade) == 0.0) and top_students:
            ts_grades = [float(t.get("grade", 0)) for t in top_students if t.get("grade") is not None]
            if ts_grades:
                average_grade = sum(ts_grades) / len(ts_grades)
    except Exception:
        pass

    # Final validation and data consistency checks
    try:
        # Validate completion rates in course performance
        for course_perf in course_performance:
            if course_perf.get("completion", 0) > 100:
                print(f"WARNING: Course {course_perf.get('course', 'Unknown')} has completion rate > 100%: {course_perf.get('completion')}")
                course_perf["completion"] = 100
        
        # Validate top students count for course-specific requests
        if course_id is not None:
            enrolled_count = (
                db.query(models.CourseEnrollment)
                .filter(models.CourseEnrollment.course_id == course_id)
                .filter(models.CourseEnrollment.status == "Active")
                .count()
            )
            if len(top_students) > enrolled_count:
                print(f"WARNING: Top students count ({len(top_students)}) exceeds enrolled students ({enrolled_count}) for course {course_id}")
                top_students = top_students[:enrolled_count]
        
        # Final debug summary
        print(f"DEBUG: Analytics summary -> totalStudents={total_students}, activeAssignments={len(assignments)}, totalSubmissions={total_submissions}, avgGrade={round(average_grade,1)}, topStudents={len(top_students)}")
        print(f"DEBUG: Course performance data: {len(course_performance)} courses")
        for cp in course_performance:
            print(f"DEBUG: Course '{cp.get('course')}' - Completion: {cp.get('completion')}%, Submissions: {cp.get('submissions')}")
            
    except Exception as e:
        print(f"ERROR: Final validation failed: {e}")

    return {
        "overview": {
            "totalStudents": total_students,
            "activeAssignments": len(assignments),
            "totalSubmissions": total_submissions,
            "averageGrade": round(average_grade, 1)
        },
        "submissionTrends": submission_trends,
        "gradeDistribution": grade_distribution,
        "coursePerformance": course_performance,
        "topStudents": top_students
    }

@router.get("/schedule", response_model=List[ScheduleItemRead])
def list_schedule(
    date: Optional[str] = Query(None, description="YYYY-MM-DD to filter a single day"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    # find instructor row
    inst = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not inst:
        inst = _get_or_create_instructor_for_user(db, current_user)

    q = db.query(models.InstructorSchedule).filter(models.InstructorSchedule.instructor_id == inst.instructor_id)
    if date:
        try:
            # parse yyyy-mm-dd and compute day range
            day = datetime.fromisoformat(date)
            start = datetime(day.year, day.month, day.day)
            end = datetime(day.year, day.month, day.day, 23, 59, 59)
            q = q.filter(models.InstructorSchedule.date >= start, models.InstructorSchedule.date <= end)
        except Exception:
            pass
    items = q.order_by(models.InstructorSchedule.date.asc(), models.InstructorSchedule.start_time.asc()).all()
    return [_serialize_schedule_item(it) for it in items]

@router.post("/schedule", response_model=ScheduleItemRead)
def create_schedule_item(
    payload: ScheduleItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    inst = _get_or_create_instructor_for_user(db, current_user)

    it = models.InstructorSchedule(
        instructor_id=inst.instructor_id,
        title=payload.title,
        type=payload.type,
        date=payload.date,
        start_time=payload.startTime,
        end_time=payload.endTime,
        location=payload.location,
        description=payload.description,
        status=payload.status,
    )
    _touch_created_updated(it)
    db.add(it)
    try:
        db.commit()
        db.refresh(it)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create schedule item")
    return _serialize_schedule_item(it)

@router.put("/schedule/{item_id}", response_model=ScheduleItemRead)
def update_schedule_item(
    item_id: int,
    payload: ScheduleItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    inst = _get_or_create_instructor_for_user(db, current_user)
    it = db.query(models.InstructorSchedule).filter(
        models.InstructorSchedule.id == item_id,
        models.InstructorSchedule.instructor_id == inst.instructor_id,
    ).first()
    if not it:
        raise HTTPException(status_code=404, detail="Schedule item not found")

    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        it.title = data["title"]
    if "type" in data and data["type"]:
        it.type = data["type"]
    if "date" in data and data["date"]:
        it.date = data["date"]
    if "startTime" in data and data["startTime"] is not None:
        it.start_time = data["startTime"]
    if "endTime" in data and data["endTime"] is not None:
        it.end_time = data["endTime"]
    if "location" in data and data["location"] is not None:
        it.location = data["location"]
    if "description" in data:
        it.description = data["description"]
    if "status" in data and data["status"]:
        it.status = data["status"]
    _touch_updated(it)
    try:
        db.commit()
        db.refresh(it)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update schedule item")
    return _serialize_schedule_item(it)

@router.delete("/schedule/{item_id}")
def delete_schedule_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    inst = _get_or_create_instructor_for_user(db, current_user)
    it = db.query(models.InstructorSchedule).filter(
        models.InstructorSchedule.id == item_id,
        models.InstructorSchedule.instructor_id == inst.instructor_id,
    ).first()
    if not it:
        raise HTTPException(status_code=404, detail="Schedule item not found")
    try:
        db.delete(it)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete schedule item")
    return {"ok": True}


# ------------------- QUIZ ENTRIES (Instructor-entered) -----------------------
class QuizEntryCreate(BaseModel):
    student_id: int
    title: str
    quiz_date: Optional[datetime] = None
    course_id: Optional[int] = None
    max_grade: Optional[confloat(ge=0)] = None
    grade: Optional[confloat(ge=0)] = None
    notes: Optional[str] = None


class QuizEntryRead(BaseModel):
    id: int
    student_id: int
    course_id: Optional[int] = None
    title: str
    quiz_date: Optional[datetime] = None
    max_grade: Optional[float] = None
    grade: Optional[float] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


@router.post("/quiz-entries", response_model=QuizEntryRead, summary="Create a quiz entry")
def create_quiz_entry(
    payload: QuizEntryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    instr = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instr:
        raise HTTPException(status_code=403, detail="Instructor profile not found")

    stu = db.query(models.Student).filter(models.Student.student_id == payload.student_id).first()
    if not stu:
        raise HTTPException(status_code=404, detail="Student not found")
    if payload.course_id is not None:
        course = db.query(models.Course).filter(models.Course.course_id == payload.course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

    # Validation rules
    if payload.quiz_date is not None:
        try:
            # Compare only by date component
            today = datetime.utcnow().date()
            qdate = payload.quiz_date.date()
            if qdate > today:
                raise HTTPException(status_code=400, detail="Quiz date cannot be in the future")
        except Exception:
            pass
    if payload.max_grade is not None and float(payload.max_grade) < 0:
        raise HTTPException(status_code=400, detail="Max grade cannot be negative")
    if payload.grade is not None and float(payload.grade) < 0:
        raise HTTPException(status_code=400, detail="Grade cannot be negative")
    if payload.grade is not None and payload.max_grade is not None:
        if float(payload.grade) > float(payload.max_grade):
            raise HTTPException(status_code=400, detail="Grade cannot exceed max grade")

    entity = models.QuizEntry(
        instructor_id=instr.instructor_id,
        student_id=payload.student_id,
        course_id=payload.course_id,
        title=payload.title,
        quiz_date=payload.quiz_date,
        max_grade=float(payload.max_grade) if payload.max_grade is not None else None,
        grade=float(payload.grade) if payload.grade is not None else None,
        notes=payload.notes,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return QuizEntryRead(
        id=entity.id,
        student_id=entity.student_id,
        course_id=entity.course_id,
        title=entity.title,
        quiz_date=entity.quiz_date,
        max_grade=entity.max_grade,
        grade=entity.grade,
        notes=entity.notes,
        created_at=entity.created_at,
    )


@router.get("/quiz-entries", response_model=List[QuizEntryRead], summary="List my quiz entries")
def list_quiz_entries(
    student_id: Optional[int] = None,
    course_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    instr = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instr:
        raise HTTPException(status_code=403, detail="Instructor profile not found")

    q = db.query(models.QuizEntry).filter(models.QuizEntry.instructor_id == instr.instructor_id)
    if student_id is not None:
        q = q.filter(models.QuizEntry.student_id == student_id)
    if course_id is not None:
        q = q.filter(models.QuizEntry.course_id == course_id)

    rows = q.order_by(models.QuizEntry.created_at.desc()).all()
    return [
        QuizEntryRead(
            id=r.id,
            student_id=r.student_id,
            course_id=r.course_id,
            title=r.title,
            quiz_date=r.quiz_date,
            max_grade=r.max_grade,
            grade=r.grade,
            notes=r.notes,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.delete("/quiz-entries/{entry_id}", summary="Delete a quiz entry")
def delete_quiz_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    instr = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instr:
        raise HTTPException(status_code=403, detail="Instructor profile not found")

    ent = db.query(models.QuizEntry).filter(
        models.QuizEntry.id == entry_id,
        models.QuizEntry.instructor_id == instr.instructor_id,
    ).first()
    if not ent:
        raise HTTPException(status_code=404, detail="Quiz entry not found")
    try:
        db.delete(ent)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete quiz entry")
    return {"ok": True}


