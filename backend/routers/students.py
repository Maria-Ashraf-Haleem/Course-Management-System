# routers/student.py
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    Query,
    status,
)
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from core.config import settings
from app.db import get_db
from app import models
from app.deps import get_current_active_user
from app.schemas import SubmissionRead

router = APIRouter(prefix="/student", tags=["student"])

# ------------------------------ Files & Limits --------------------------------

UPLOAD_DIR = Path(getattr(settings, "UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHUNK_SIZE = 1024 * 1024  # 1MB
MAX_UPLOAD_MB = int(getattr(settings, "MAX_UPLOAD_MB", 50))

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff"}
PPT_EXTS = {".ppt", ".pptx"}
PDF_EXTS = {".pdf"}
OTHER_ALLOWED_EXTS = {
    ".doc", ".docx", ".txt", ".rtf", ".zip", ".rar", ".7z",
    ".xlsx", ".xls", ".csv", ".md"
}
ALLOWED_EXTS = IMAGE_EXTS | PPT_EXTS | PDF_EXTS | OTHER_ALLOWED_EXTS

VALID_STATUSES = {"Pending", "Accepted", "Rejected", "NeedsRevision"}

# ------------------------------ Helpers ---------------------------------------

def _has_attr(obj, name: str) -> bool:
    return hasattr(obj, name)

def _require_student(user: models.User):
    if (user.role or "").lower() not in {"student"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")

def _infer_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXTS: return "Image"
    if ext in PPT_EXTS: return "PPT"
    if ext in PDF_EXTS: return "PDF"
    return "Other"

def _safe_name(filename: str) -> str:
    # keep basename only, strip directories
    return Path(filename or "upload").name

def _unique_disk_name(safe_name: str) -> str:
    from uuid import uuid4
    return f"{uuid4().hex}_{safe_name}"

def _public_path_for(unique_name: str) -> str:
    # your static files routing should serve /uploads/*
    return f"/uploads/{unique_name}"

def _save_stream_to_disk(file: UploadFile, dest: Path) -> Tuple[int, str]:
    """
    Streams to disk, enforces MAX_UPLOAD_MB, returns (bytes_written, mime_type).
    """
    total = 0
    mime = file.content_type or ""
    with dest.open("wb") as out:
        while True:
            chunk = file.file.read(CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_MB * 1024 * 1024:
                # stop early, cleanup, then raise
                out.close()
                try:
                    dest.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds {MAX_UPLOAD_MB} MB limit",
                )
            out.write(chunk)
    return total, mime

def _to_read(row: models.Submission) -> SubmissionRead:
    return SubmissionRead(
        id=row.submission_id,
        assignmentId=row.assignment_id,
        title=getattr(row, 'assignment_title', None) or f"Assignment {row.assignment_id}",
        course=getattr(row, 'course', None) or "Dental Course",
        submittedAt=row.submitted_at,
        status=row.status,
        fileName=row.original_filename,
        fileUrl=row.file_path,
        fileType=row.file_type,
        notes=row.student_notes,
    )

def _to_read_from_dict(row_dict) -> SubmissionRead:
    return SubmissionRead(
        id=row_dict["submission_id"],
        assignmentId=row_dict["assignment_id"],
        title=row_dict.get("assignment_title") or f"Assignment {row_dict['assignment_id']}",
        course=row_dict.get("course") or "Dental Course",
        submittedAt=row_dict["submitted_at"],
        status=row_dict["status"],
        fileName=row_dict["original_filename"],
        fileUrl=row_dict["file_path"],
        fileType=row_dict["file_type"],
        notes=row_dict.get("student_notes"),
        grade=row_dict.get("grade"),
        maxGrade=row_dict.get("max_grade"),
        feedback=row_dict.get("feedback_text"),
        gradedAt=row_dict.get("graded_at"),
    )

def _current_student_id(db: Session, user: models.User) -> int:
    st = db.query(models.Student).filter(models.Student.user_id == user.id).first()
    if not st:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")
    return st.student_id

def _ensure_submission_ownership(sub: models.Submission, db: Session, user: models.User):
    sid = _current_student_id(db, user)
    if sub.student_id != sid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your submission")

def _validate_submission_for_edit(sub: models.Submission, allow_when_needs_revision: bool = True):
    # Allow modify if Pending
    if sub.status == "Pending":
        return
    # Allow modify if NeedsRevision (when enabled)
    if allow_when_needs_revision and sub.status == "NeedsRevision":
        return
    # Also allow resubmission when Rejected (common workflow)
    if sub.status == "Rejected":
        return
    # Otherwise, block (e.g., Accepted)
    raise HTTPException(status_code=400, detail=f"Cannot modify a submission in status '{sub.status}'")

def _assignment_time_window_ok(assignment: models.Assignment) -> bool:
    """
    If your Assignment model has time window columns, enforce them.
    Recognizes: start_at/start_date/open_at/available_from and
                due_at/due_date/deadline/close_at/available_until
    If none exist, allow by default.
    """
    now = datetime.utcnow()
    starts = None
    ends = None

    for col in ("start_at", "start_date", "open_at", "available_from"):
        if _has_attr(assignment, col):
            starts = getattr(assignment, col)
            break
    for col in ("due_at", "due_date", "deadline", "close_at", "available_until"):
        if _has_attr(assignment, col):
            ends = getattr(assignment, col)
            break

    if starts and now < starts:
        return False
    if ends and now > ends:
        return False
    return True

def _remove_disk_file_if_local(public_path: str):
    """
    Remove the physical file only if it lives under configured UPLOAD_DIR.
    """
    try:
        # expected format: /uploads/<name>
        name = Path(public_path).name
        candidate = UPLOAD_DIR / name
        if candidate.is_file() and candidate.resolve().is_relative_to(UPLOAD_DIR.resolve()):
            candidate.unlink()
    except Exception:
        pass

# ------------------------------ Schemas (student) ------------------------------

class StudentFileItem(BaseModel):
    id: Optional[int] = None
    name: str
    path: str
    is_primary: bool = False

# ------------------------------ Routes ----------------------------------------

@router.get(
    "/assignments",
    response_model=List[dict],
    summary="List available assignments for students to submit to",
)
def list_available_assignments(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    target_year: Optional[str] = Query(None, description="Filter by target year"),
    search: Optional[str] = Query(None, description="Search in assignment title"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List assignments that students can submit to."""
    _require_student(current_user)
    
    # Build query for assignments
    where_conditions = [
        "a.deadline > datetime('now')",
        "a.is_active = 1"
    ]
    params = {"limit": limit, "offset": offset}
    
    # Add department filter
    if department_id is not None:
        where_conditions.append("a.department_id = :dept_id")
        params["dept_id"] = department_id
    
    # Add target year filter
    if target_year and target_year != "All":
        where_conditions.append("(a.target_year = :target_year OR a.target_year = 'All')")
        params["target_year"] = target_year
    
    # Add search filter
    if search and search.strip():
        where_conditions.append("a.title LIKE :search_term")
        params["search_term"] = f"%{search.strip()}%"
    
    where_clause = " AND ".join(where_conditions)
    
    # Query to get assignments with submission status for current student
    # Only show assignments from courses the student is enrolled in
    sql = f"""
        SELECT 
            a.assignment_id,
            a.title,
            a.description,
            a.deadline,
            a.max_grade,
            a.max_file_size_mb,
            a.instructions,
            a.target_year,
            c.title AS department_name,
            at.name AS assignment_type,
            CASE 
                WHEN s.submission_id IS NOT NULL THEN 'submitted'
                ELSE 'available'
            END AS submission_status,
            s.submission_id,
            s.status AS submission_status_detail,
            s.submitted_at
        FROM Assignment a
        INNER JOIN Course c ON c.course_id = a.course_id
        INNER JOIN CourseEnrollment ce ON ce.course_id = c.course_id
        INNER JOIN Student st ON st.student_id = ce.student_id AND st.user_id = :user_id
        LEFT JOIN AssignmentType at ON at.type_id = a.type_id
        LEFT JOIN Submission s ON s.assignment_id = a.assignment_id AND s.student_id = st.student_id
        WHERE {where_clause} AND ce.status = 'Active' AND s.submission_id IS NULL
        ORDER BY a.deadline ASC
        LIMIT :limit OFFSET :offset
    """
    params["user_id"] = current_user.id
    
    rows = db.execute(text(sql), params).mappings().all()
    
    # Convert to list of dictionaries
    assignments = []
    for row in rows:
        assignment = {
            "assignment_id": row.assignment_id,
            "title": row.title,
            "description": row.description,
            "deadline": row.deadline.isoformat() if hasattr(row.deadline, 'isoformat') else str(row.deadline) if row.deadline else None,
            "max_grade": row.max_grade,
            "max_file_size_mb": row.max_file_size_mb,
            "instructions": row.instructions,
            "target_year": row.target_year,
            "department_name": row.department_name,
            "assignment_type": row.assignment_type,
            "submission_status": row.submission_status,
            "submission_id": row.submission_id,
            "submission_status_detail": row.submission_status_detail,
            "submitted_at": row.submitted_at.isoformat() if hasattr(row.submitted_at, 'isoformat') else str(row.submitted_at) if row.submitted_at else None
        }
        assignments.append(assignment)
    
    return assignments


@router.get(
    "/announcements",
    summary="List announcements visible to students",
)
def list_student_announcements(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Return announcements targeted to students or all users."""
    _require_student(current_user)

    q = (
        db.query(models.Announcement)
        .filter(models.Announcement.status == "sent")
        .filter(models.Announcement.target_audience.in_(["all", "students"]))
        .order_by(models.Announcement.sent_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        {
            "id": a.id,
            "title": a.title,
            "message": a.message,
            "priority": a.priority,
            "target_audience": a.target_audience,
            "timestamp": a.sent_at.isoformat() if a.sent_at else None,
        }
        for a in q
    ]


@router.get(
    "/submissions",
    response_model=List[SubmissionRead],
    summary="List my submissions with optional filters",
)
def list_my_submissions(
    status_filter: Optional[str] = Query(None, description="Pending | Accepted | Rejected | NeedsRevision"),
    assignment_id: Optional[int] = Query(None),
    order_by: str = Query("submitted_at", regex="^(submitted_at|status|assignment_id)$"),
    order_dir: str = Query("desc", regex="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)

    sid = _current_student_id(db, current_user)
    q = (
        db.query(models.Submission)
        .join(models.Assignment, models.Assignment.assignment_id == models.Submission.assignment_id)
        .outerjoin(models.Department, models.Department.department_id == models.Assignment.department_id)
        .filter(models.Submission.student_id == sid)
    )

    if status_filter:
        if status_filter not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        q = q.filter(models.Submission.status == status_filter)

    if assignment_id is not None:
        q = q.filter(models.Submission.assignment_id == assignment_id)

    order_col = {
        "submitted_at": getattr(models.Submission, "submitted_at"),
        "status": getattr(models.Submission, "status"),
        "assignment_id": getattr(models.Submission, "assignment_id"),
    }[order_by]
    q = q.order_by(order_col.asc() if order_dir == "asc" else order_col.desc())

    # Execute query with joins to get assignment, department, and feedback info
    rows = db.execute(
        text("""
        SELECT 
            s.submission_id, s.assignment_id, s.student_id, s.original_filename, 
            s.file_path, s.file_type, s.submitted_at, s.status, s.student_notes,
            a.title AS assignment_title, c.title AS course, a.deadline AS assignment_deadline,
            a.max_grade AS max_grade,
            CASE WHEN s.status = 'Accepted' THEN sf.grade ELSE NULL END AS grade,
            sf.feedback_text, sf.created_at AS graded_at
        FROM Submission s
        JOIN Assignment a ON a.assignment_id = s.assignment_id
        LEFT JOIN Course c ON c.course_id = a.course_id
        LEFT JOIN SubmissionFeedback sf ON sf.submission_id = s.submission_id
        WHERE s.student_id = :student_id
        ORDER BY s.submitted_at DESC
        LIMIT :limit OFFSET :offset
        """),
        {
            "student_id": sid,
            "limit": limit,
            "offset": offset
        }
    ).mappings().all()
    
    return [_to_read_from_dict(r) for r in rows]


@router.get(
    "/submissions/{submission_id}",
    response_model=SubmissionRead,
    summary="Get one of my submissions by ID",
)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)

    # Get submission with feedback data
    sid = _current_student_id(db, current_user)
    row = db.execute(
        text("""
        SELECT 
            s.submission_id, s.assignment_id, s.student_id, s.original_filename, 
            s.file_path, s.file_type, s.submitted_at, s.status, s.student_notes,
            a.title AS assignment_title, c.title AS course, a.deadline AS assignment_deadline,
            a.max_grade AS max_grade,
            CASE WHEN s.status = 'Accepted' THEN sf.grade ELSE NULL END AS grade,
            sf.feedback_text, sf.created_at AS graded_at
        FROM Submission s
        JOIN Assignment a ON a.assignment_id = s.assignment_id
        LEFT JOIN Course c ON c.course_id = a.course_id
        LEFT JOIN SubmissionFeedback sf ON sf.submission_id = s.submission_id
        WHERE s.submission_id = :submission_id AND s.student_id = :student_id
        """),
        {
            "submission_id": submission_id,
            "student_id": sid
        }
    ).mappings().first()
    
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    
    return _to_read_from_dict(row)


@router.post(
    "/submissions",
    response_model=SubmissionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a new submission (multi-file supported)",
)
async def create_submission(
    assignment_id: int = Form(...),
    # Primary single-file (legacy)
    file: Optional[UploadFile] = File(None),
    # Common multi-file field names accepted for compatibility
    files: Optional[list[UploadFile]] = File(None),
    files_br: Optional[list[UploadFile]] = File(None, alias="files[]"),
    attachments: Optional[list[UploadFile]] = File(None),
    attachments_br: Optional[list[UploadFile]] = File(None, alias="attachments[]"),
    documents: Optional[list[UploadFile]] = File(None),
    upload_br: Optional[list[UploadFile]] = File(None, alias="upload[]"),
    student_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)

    if assignment_id <= 0:
        raise HTTPException(status_code=400, detail="assignment_id must be positive")

    # Validate assignment exists
    assignment = db.query(models.Assignment).filter(models.Assignment.assignment_id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Optional: enforce assignment time window if present in schema
    if not _assignment_time_window_ok(assignment):
        raise HTTPException(status_code=400, detail="Submission window is closed or not yet open")

    # Collect all incoming files (deduplicated by filename where possible)
    incoming: list[UploadFile] = []
    for group in (files, files_br, attachments, attachments_br, documents, upload_br):
        if group:
            incoming.extend([f for f in group if f is not None])
    if file is not None:
        incoming.insert(0, file)
    # Ensure at least one file provided
    if not incoming:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # Validate and save first file (stored in Submission legacy columns)
    first_file = incoming[0]
    safe_name = _safe_name(first_file.filename or "upload")
    ext = Path(safe_name).suffix.lower()
    if ext and (ext not in ALLOWED_EXTS):
        raise HTTPException(status_code=400, detail=f"File type '{ext}' is not allowed")

    unique_name = _unique_disk_name(safe_name)
    dest = UPLOAD_DIR / unique_name
    bytes_written, _mime = _save_stream_to_disk(first_file, dest)

    file_type = _infer_file_type(safe_name)
    public_path = _public_path_for(unique_name)

    sid = _current_student_id(db, current_user)
    row = models.Submission(
        assignment_id=assignment_id,
        student_id=sid,
        original_filename=safe_name,
        file_path=public_path,
        file_type=file_type,
        submitted_at=datetime.utcnow(),
        status="Pending",
        student_notes=(student_notes or None),
    )

    try:
        db.add(row)
        db.commit()
        db.refresh(row)

        # Save any additional files to SubmissionFile table
        extra = incoming[1:]
        for extra_file in extra:
            try:
                ename = _safe_name(extra_file.filename or "upload")
                eext = Path(ename).suffix.lower()
                if eext and (eext not in ALLOWED_EXTS):
                    # skip unsupported types silently for now
                    continue
                eun = _unique_disk_name(ename)
                edest = UPLOAD_DIR / eun
                _bytes, _mime2 = _save_stream_to_disk(extra_file, edest)
                epublic = _public_path_for(eun)
                sf = models.SubmissionFile(
                    submission_id=row.submission_id,
                    file_name=ename,
                    file_path=epublic,
                    file_type=_infer_file_type(ename),
                )
                db.add(sf)
                db.commit()
            except Exception:
                db.rollback()
                # do not fail whole submission on one file failure
                try:
                    _remove_disk_file_if_local(_public_path_for(eun))
                except Exception:
                    pass
        # Defensive cleanup: if a stale SubmissionFeedback exists with this reused submission_id, remove it
        try:
            stale_fb = db.query(models.SubmissionFeedback).filter(
                models.SubmissionFeedback.submission_id == row.submission_id
            ).first()
            if stale_fb:
                db.delete(stale_fb)
                db.commit()
        except Exception:
            # Non-fatal cleanup failure; better to proceed than fail the submission
            pass
        return _to_read(row)
    except IntegrityError:
        # e.g. a unique constraint (student_id, assignment_id) exists
        _remove_disk_file_if_local(public_path)
        db.rollback()
        raise HTTPException(status_code=400, detail="You have already submitted for this assignment")
    except Exception:
        _remove_disk_file_if_local(public_path)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create submission")


@router.patch(
    "/submissions/{submission_id}/notes",
    response_model=SubmissionRead,
    summary="Update notes for my submission (Pending/NeedsRevision)",
)
def update_submission_notes(
    submission_id: int,
    student_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    _ensure_submission_ownership(sub, db, current_user)
    _validate_submission_for_edit(sub, allow_when_needs_revision=True)

    sub.student_notes = (student_notes or None)
    try:
        db.commit()
        db.refresh(sub)
        return _to_read(sub)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update notes")


@router.patch(
    "/submissions/{submission_id}/file",
    response_model=SubmissionRead,
    summary="Replace file for my submission (Pending/NeedsRevision)",
)
async def replace_submission_file(
    submission_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    _ensure_submission_ownership(sub, db, current_user)
    _validate_submission_for_edit(sub, allow_when_needs_revision=True)

    # Validate extension
    safe_name = _safe_name(file.filename or "upload")
    ext = Path(safe_name).suffix.lower()
    if ext and (ext not in ALLOWED_EXTS):
        raise HTTPException(status_code=400, detail=f"File type '{ext}' is not allowed")

    # Save new file
    unique_name = _unique_disk_name(safe_name)
    dest = UPLOAD_DIR / unique_name
    bytes_written, _mime = _save_stream_to_disk(file, dest)

    new_public = _public_path_for(unique_name)
    old_public = sub.file_path

    # Update row
    sub.original_filename = safe_name
    sub.file_path = new_public
    sub.file_type = _infer_file_type(safe_name)
    sub.submitted_at = datetime.utcnow()  # bump submission time on replacement
    # Reset status to Pending for fresh review cycle
    sub.status = "Pending"
    # Clear reviewed_at if column exists
    if hasattr(sub, "reviewed_at"):
        setattr(sub, "reviewed_at", None)
    # Remove any existing feedback/grade for this submission so old grades don't carry over
    try:
        existing_fb = db.query(models.SubmissionFeedback).filter(
            models.SubmissionFeedback.submission_id == submission_id
        ).first()
        if existing_fb:
            db.delete(existing_fb)
    except Exception:
        # Non-fatal: if cleanup fails we still proceed; grade will be overwritten on next review
        pass
    try:
        db.commit()
        db.refresh(sub)
        # Remove old file after successful commit
        if old_public and old_public != new_public:
            _remove_disk_file_if_local(old_public)
        return _to_read(sub)
    except Exception:
        # cleanup new file on failure
        _remove_disk_file_if_local(new_public)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to replace submission file")


@router.get(
    "/submissions/{submission_id}/files",
    response_model=List[StudentFileItem],
    summary="List files for my submission (primary + additional)",
)
def list_my_submission_files(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)
    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _ensure_submission_ownership(sub, db, current_user)

    out: List[StudentFileItem] = []
    if sub.original_filename and sub.file_path:
        out.append(StudentFileItem(id=None, name=sub.original_filename, path=sub.file_path, is_primary=True))
    try:
        extras = (
            db.query(models.SubmissionFile)
            .filter(models.SubmissionFile.submission_id == submission_id)
            .all()
        )
        for f in extras:
            out.append(StudentFileItem(id=f.id, name=f.file_name, path=f.file_path, is_primary=False))
    except Exception:
        pass
    return out


@router.post(
    "/submissions/{submission_id}/files",
    response_model=List[StudentFileItem],
    summary="Append additional files to my submission (Pending/NeedsRevision)",
)
async def add_files_to_submission(
    submission_id: int,
    files: List[UploadFile] = File(..., alias="files"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)
    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _ensure_submission_ownership(sub, db, current_user)
    _validate_submission_for_edit(sub, allow_when_needs_revision=True)

    created: List[StudentFileItem] = []
    for up in files or []:
        if up is None:
            continue
        try:
            ename = _safe_name(up.filename or "upload")
            eext = Path(ename).suffix.lower()
            if eext and (eext not in ALLOWED_EXTS):
                # skip unsupported types
                continue
            eun = _unique_disk_name(ename)
            edest = UPLOAD_DIR / eun
            _bytes, _mime2 = _save_stream_to_disk(up, edest)
            epublic = _public_path_for(eun)
            sf = models.SubmissionFile(
                submission_id=submission_id,
                file_name=ename,
                file_path=epublic,
                file_type=_infer_file_type(ename),
            )
            db.add(sf)
            db.commit()
            db.refresh(sf)
            created.append(StudentFileItem(id=sf.id, name=ename, path=epublic, is_primary=False))
        except Exception:
            db.rollback()
            try:
                _remove_disk_file_if_local(_public_path_for(eun))  # type: ignore[name-defined]
            except Exception:
                pass
            # continue with next file
            continue

    # return full list after addition
    return list_my_submission_files(submission_id, db, current_user)  # type: ignore[arg-type]


@router.delete(
    "/submissions/{submission_id}/files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an additional file from my submission (not the primary)",
)
def delete_additional_file(
    submission_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)
    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _ensure_submission_ownership(sub, db, current_user)
    _validate_submission_for_edit(sub, allow_when_needs_revision=True)

    sf = db.query(models.SubmissionFile).filter(
        models.SubmissionFile.id == file_id,
        models.SubmissionFile.submission_id == submission_id,
    ).first()
    if not sf:
        raise HTTPException(status_code=404, detail="File not found")

    old_public = sf.file_path
    try:
        db.delete(sf)
        db.commit()
        _remove_disk_file_if_local(old_public)
        return
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete file")


@router.delete(
    "/submissions/{submission_id}/primary-file",
    response_model=SubmissionRead,
    summary="Delete primary file by promoting an additional file to primary (Pending/NeedsRevision)",
)
def delete_primary_file(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)
    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _ensure_submission_ownership(sub, db, current_user)
    _validate_submission_for_edit(sub, allow_when_needs_revision=True)

    # Find an extra file to promote
    extra = (
        db.query(models.SubmissionFile)
        .filter(models.SubmissionFile.submission_id == submission_id)
        .order_by(models.SubmissionFile.uploaded_at.asc())
        .first()
    )
    if not extra:
        # cannot remove primary while no extra exists due to NOT NULL constraints
        raise HTTPException(status_code=400, detail="Cannot delete primary file because there are no additional files to promote. Add a new file first.")

    old_public = sub.file_path
    try:
        # Promote extra to primary
        sub.original_filename = extra.file_name
        sub.file_path = extra.file_path
        sub.file_type = extra.file_type or _infer_file_type(extra.file_name)
        sub.submitted_at = datetime.utcnow()
        sub.status = "Pending"
        if hasattr(sub, "reviewed_at"):
            setattr(sub, "reviewed_at", None)

        # Remove any existing feedback/grade for this submission
        try:
            existing_fb = db.query(models.SubmissionFeedback).filter(
                models.SubmissionFeedback.submission_id == submission_id
            ).first()
            if existing_fb:
                db.delete(existing_fb)
        except Exception:
            pass

        # Delete the promoted extra row
        db.delete(extra)
        db.commit()
        db.refresh(sub)

        # Remove old primary file from disk
        if old_public and old_public != sub.file_path:
            _remove_disk_file_if_local(old_public)

        return _to_read(sub)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete primary file")


@router.delete(
    "/submissions/{submission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete/cancel my submission (Pending only by default)",
)
def delete_submission(
    submission_id: int,
    allow_when_needs_revision: bool = Query(False, description="Allow delete if status is NeedsRevision"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    _ensure_submission_ownership(sub, db, current_user)
    _validate_submission_for_edit(sub, allow_when_needs_revision=allow_when_needs_revision)

    old_public = sub.file_path
    try:
        # Remove related feedback first to avoid leaving stale rows that could collide with PK reuse
        try:
            fb = db.query(models.SubmissionFeedback).filter(
                models.SubmissionFeedback.submission_id == submission_id
            ).first()
            if fb:
                db.delete(fb)
        except Exception:
            pass
        db.delete(sub)
        db.commit()
        _remove_disk_file_if_local(old_public)
        return
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete submission")


@router.get(
    "/submissions/stats",
    summary="My submission stats by status",
)
def my_submission_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student(current_user)

    sid = _current_student_id(db, current_user)
    total = (
        db.query(models.Submission)
        .filter(models.Submission.student_id == sid)
        .count()
    )
    counts = {s: 0 for s in VALID_STATUSES}
    if total:
        for s in VALID_STATUSES:
            counts[s] = (
                db.query(models.Submission)
                .filter(
                    models.Submission.student_id == sid,
                    models.Submission.status == s,
                )
                .count()
            )

    return {
        "total": total,
        "by_status": counts,
        "generated_at": datetime.utcnow().isoformat(),
    }
