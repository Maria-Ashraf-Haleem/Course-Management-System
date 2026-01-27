# routers/submissions.py
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse
import io
import zipfile
from pydantic import BaseModel, Field, confloat
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from core.config import settings
from app.db import get_db
from app import models
from app.deps import get_current_active_user

router = APIRouter(prefix="/submissions", tags=["submissions"])

# ------------------------------ Config / Files --------------------------------

UPLOAD_DIR = Path(getattr(settings, "UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Accepted status values used elsewhere across the app
VALID_STATUSES = {"Pending", "Accepted", "Rejected", "NeedsRevision"}

# ------------------------------ Schemas ---------------------------------------

class SubmissionListItem(BaseModel):
    id: int
    assignmentId: int
    studentId: int
    title: Optional[str] = None          # assignment title
    course: Optional[str] = None         # department/course name
    submittedAt: Optional[datetime] = None
    status: str
    fileName: Optional[str] = None
    filePath: Optional[str] = None
    fileType: Optional[str] = None
    notes: Optional[str] = None
    grade: Optional[float] = None
    reviewerId: Optional[int] = None

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

class StatusUpdatePayload(BaseModel):
    status: str = Field(..., description="Accepted | Rejected | NeedsRevision | Pending")
    grade: Optional[float] = Field(None, description="Numeric grade; commonly required if Accepted")
    feedback_text: Optional[str] = Field(None, description="Reviewer feedback text")

# ------------------------------ Helpers ---------------------------------------

def _has_attr(obj, name: str) -> bool:
    return hasattr(obj, name)

def _require_admin_or_instructor(user: models.User):
    role = (user.role or "").lower()
    if role not in {"admin", "instructor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or instructor role required")

def _is_instructor(user: models.User) -> bool:
    return (user.role or "").lower() == "instructor"

def _now() -> datetime:
    return datetime.utcnow()

def _touch_updated(entity) -> None:
    if _has_attr(entity, "updated_at"):
        setattr(entity, "updated_at", _now())

def _submission_is_assigned_to_instructor(sub: models.Submission, instructor_user_id: int) -> bool:
    """
    Authorization helper: if your schema links submission/assignment to an instructor,
    enforce that the current instructor can only manage their own items.
    """
    for col in ("instructor_id", "assigned_instructor_id", "reviewer_id"):
        if _has_attr(sub, col):
            return getattr(sub, col) == instructor_user_id
    if _has_attr(sub, "assignment") and sub.assignment is not None:
        for col in ("instructor_id", "reviewer_id"):
            if _has_attr(sub.assignment, col):
                return getattr(sub.assignment, col) == instructor_user_id
    # No linkage found -> allow
    return True

def _instructor_filter_sql() -> Tuple[str, str]:
    """
    For list queries, produce a WHERE clause to restrict by the current instructor if schema supports it.
    Returns ("", "") if no filter is possible.
    """
    if _has_attr(models.Submission, "instructor_id"):
        return " AND s.instructor_id = :instrid ", "instrid"
    if _has_attr(models.Submission, "assigned_instructor_id"):
        return " AND s.assigned_instructor_id = :instrid ", "instrid"
    if _has_attr(models.Submission, "reviewer_id"):
        return " AND s.reviewer_id = :instrid ", "instrid"
    if _has_attr(models.Assignment, "instructor_id"):
        return " AND a.instructor_id = :instrid ", "instrid"
    if _has_attr(models.Assignment, "reviewer_id"):
        return " AND a.reviewer_id = :instrid ", "instrid"
    return "", ""

def _disk_path_from_public(public_path: str) -> Path:
    """
    Map saved public URL (/uploads/<name>) back to disk inside UPLOAD_DIR.
    """
    if not public_path:
        return UPLOAD_DIR / ""
    
    # Handle both full paths and just filenames
    if public_path.startswith("/uploads/"):
        name = public_path.replace("/uploads/", "")
    else:
        name = Path(public_path).name
    
    return UPLOAD_DIR / name

# ------------------------------ Routes ----------------------------------------

@router.get(
    "",
    response_model=List[SubmissionListItem],
    summary="List submissions (admin/instructor).",
)
def list_submissions(
    status_filter: Optional[str] = Query(None, description="Pending | Accepted | Rejected | NeedsRevision"),
    student_id: Optional[int] = Query(None),
    assignment_id: Optional[int] = Query(None),
    department_id: Optional[int] = Query(None, description="Filter by assignment's department"),
    search: Optional[str] = Query(None, description="Search in assignment title"),
    include_feedback: bool = Query(False, description="Join feedback to include grade/text"),
    mine_only: bool = Query(True, description="For instructors, restrict to submissions assigned to me (if schema supports it)"),
    from_date: Optional[datetime] = Query(None, description="Filter submissions from (UTC)"),
    to_date: Optional[datetime] = Query(None, description="Filter submissions to (UTC)"),
    order_by: str = Query("submitted_at", regex="^(submitted_at|status|assignmentId|studentId)$"),
    order_dir: str = Query("desc", regex="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_admin_or_instructor(current_user)
    if status_filter and status_filter not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status filter")

    # apply instructor restriction if needed
    instructor_clause, instructor_param = _instructor_filter_sql()
    instructor_bind = {instructor_param: current_user.id} if (_is_instructor(current_user) and mine_only and instructor_param) else {}

    # feedback join
    fb_select = ", fb.grade AS grade, fb.feedback_text AS feedback_text, fb.instructor_id AS reviewer_id" if include_feedback else ""
    fb_join = "LEFT JOIN SubmissionFeedback fb ON fb.submission_id = s.submission_id" if include_feedback else ""

    # date filters
    date_from = " AND (:from_date IS NULL OR s.submitted_at >= :from_date) "
    date_to   = " AND (:to_date   IS NULL OR s.submitted_at <= :to_date) "

    # department filter (via assignment)
    dept_filter = " AND (:dept_id IS NULL OR d.department_id = :dept_id) "

    # search in title
    where_search = ""
    params = {
        "status": status_filter,
        "sid": student_id,
        "aid": assignment_id,
        "dept_id": department_id,
        "from_date": from_date,
        "to_date": to_date,
        **instructor_bind,
    }
    if search and search.strip():
        where_search = " AND (a.title ILIKE :term) "
        params["term"] = f"%{search.strip()}%"

    # order
    order_col = {
        "submitted_at": "s.submitted_at",
        "status": "s.status",
        "assignmentId": "s.assignment_id",
        "studentId": "s.student_id",
    }[order_by]
    order_sql = f" ORDER BY {order_col} {'ASC' if order_dir == 'asc' else 'DESC'} "

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
          {dept_filter}
          {instructor_clause}
          {date_from}
          {date_to}
          {where_search}
        {order_sql}
        LIMIT :limit OFFSET :offset
    """
    params["limit"] = limit
    params["offset"] = offset

    rows = db.execute(sql, params).mappings().all()
    out: List[SubmissionListItem] = []
    for r in rows:
        out.append(SubmissionListItem(
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
            reviewerId=r.get("reviewer_id") if include_feedback else None,
        ))
    return out


@router.get(
    "/{submission_id}",
    response_model=SubmissionDetailResponse,
    summary="Get a submission with its feedback (admin/instructor).",
)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_admin_or_instructor(current_user)

    sub_row = db.execute(
        """
        SELECT s.*, a.title AS assignment_title, d.name AS course
        FROM Submission s
        JOIN Assignment a ON a.assignment_id = s.assignment_id
        LEFT JOIN Department d ON d.department_id = a.department_id
        WHERE s.submission_id = :sid
        """,
        {"sid": submission_id},
    ).mappings().first()

    if not sub_row:
        raise HTTPException(status_code=404, detail="Submission not found")

    # ORM object for fine-grained instructor ownership checks
    sub_obj = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if _is_instructor(current_user) and not _submission_is_assigned_to_instructor(sub_obj, current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to access this submission")

    fb = db.execute(
        """
        SELECT feedback_id, instructor_id, feedback_text, grade, created_at
        FROM SubmissionFeedback
        WHERE submission_id = :sid
        """,
        {"sid": submission_id},
    ).mappings().first()

    submission = SubmissionListItem(
        id=sub_row["submission_id"],
        assignmentId=sub_row["assignment_id"],
        studentId=sub_row["student_id"],
        title=sub_row.get("assignment_title"),
        course=sub_row.get("course"),
        fileName=sub_row.get("original_filename"),
        filePath=sub_row.get("file_path"),
        fileType=sub_row.get("file_type"),
        submittedAt=sub_row.get("submitted_at"),
        status=sub_row["status"],
        notes=sub_row.get("student_notes"),
    )

    feedback = None
    if fb:
        feedback = FeedbackRead(
            id=fb["feedback_id"],
            instructorId=fb.get("instructor_id"),
            text=fb.get("feedback_text"),
            grade=fb.get("grade"),
            createdAt=fb.get("created_at"),
        )

    # Build files array: include primary + additional submission files
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
    "/{submission_id}/zip",
    summary="Download all submission files as ZIP (admin/instructor).",
)
def download_submission_zip(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_admin_or_instructor(current_user)

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if _is_instructor(current_user) and not _submission_is_assigned_to_instructor(sub, current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to access this submission")

    # Collect file paths: primary + extras
    items: List[tuple[str, Path]] = []
    if sub.original_filename and sub.file_path:
        p = _disk_path_from_public(sub.file_path)
        if p.is_file():
            items.append((sub.original_filename, p))
    try:
        extras = (
            db.query(models.SubmissionFile)
            .filter(models.SubmissionFile.submission_id == submission_id)
            .all()
        )
        for f in extras:
            pp = _disk_path_from_public(f.file_path)
            if pp.is_file():
                items.append((f.file_name or pp.name, pp))
    except Exception:
        pass

    if not items:
        raise HTTPException(status_code=404, detail="No files to zip")

    # Stream a zip
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, path in items:
            try:
                zf.write(str(path), arcname=name)
            except Exception:
                # skip unreadable files
                continue
    mem.seek(0)
    headers = {"Content-Disposition": f"attachment; filename=submission-{submission_id}.zip"}
    return StreamingResponse(mem, headers=headers, media_type="application/zip")


@router.get(
    "/{submission_id}/file",
    response_class=FileResponse,
    summary="Download submission file (admin/instructor).",
)
def download_submission_file(
    submission_id: int,
    inline: bool = Query(False, description="If true, set Content-Disposition inline when possible"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_admin_or_instructor(current_user)

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if _is_instructor(current_user) and not _submission_is_assigned_to_instructor(sub, current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to access this submission")

    # Simple approach: find the actual file
    disk = None
    
    # First try the stored path
    if sub.file_path:
        disk = _disk_path_from_public(sub.file_path)
        if disk.is_file():
            # Check if it's the right content type
            with open(disk, 'rb') as f:
                header = f.read(4)
                # If it's a txt file but contains PDF content, serve it as PDF
                if header == b'%PDF' and sub.original_filename and sub.original_filename.lower().endswith('.pdf'):
                    pass  # This is fine, we'll handle content-type below
                elif disk.name.endswith('.txt') and sub.original_filename and not sub.original_filename.endswith('.txt'):
                    # Wrong file type, try to find correct one
                    disk = None
    
    # If no valid file found, search by original filename
    if not disk or not disk.is_file():
        uploads_dir = UPLOAD_DIR
        if sub.original_filename:
            # Try exact match first
            for file_path in uploads_dir.glob(f"*{sub.original_filename}"):
                if file_path.is_file():
                    disk = file_path
                    break
            
            # If still not found, try base name match
            if not disk or not disk.is_file():
                base_name = Path(sub.original_filename).stem
                for file_path in uploads_dir.glob(f"*{base_name}*"):
                    if file_path.is_file():
                        with open(file_path, 'rb') as f:
                            header = f.read(4)
                            # Match content type with expected type
                            if sub.original_filename.lower().endswith('.pdf') and header == b'%PDF':
                                disk = file_path
                                break
                            elif sub.original_filename.lower().endswith(('.png', '.jpg', '.jpeg')) and (header.startswith(b'\x89PNG') or header.startswith(b'\xff\xd8\xff')):
                                disk = file_path
                                break
    
    if not disk or not disk.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    headers = {}
    
    # Force correct content type based on actual file content
    with open(disk, 'rb') as f:
        header = f.read(4)
        if header == b'%PDF':
            headers["Content-Type"] = "application/pdf"
        elif header.startswith(b'\x89PNG'):
            headers["Content-Type"] = "image/png"
        elif header.startswith(b'\xff\xd8\xff'):
            headers["Content-Type"] = "image/jpeg"
        else:
            # Fallback to original filename extension
            if sub.original_filename:
                if sub.original_filename.lower().endswith('.pdf'):
                    headers["Content-Type"] = "application/pdf"
                elif sub.original_filename.lower().endswith('.png'):
                    headers["Content-Type"] = "image/png"
                elif sub.original_filename.lower().endswith(('.jpg', '.jpeg')):
                    headers["Content-Type"] = "image/jpeg"
    
    # Always use original filename for download
    download_filename = sub.original_filename or disk.name
    
    if inline:
        headers["Content-Disposition"] = f'inline; filename="{download_filename}"'
    else:
        headers["Content-Disposition"] = f'attachment; filename="{download_filename}"'

    return FileResponse(
        path=str(disk),
        headers=headers,
        filename=download_filename,
    )


@router.patch(
    "/{submission_id}/status",
    response_model=SubmissionDetailResponse,
    summary="Update submission status and (optionally) upsert feedback (admin/instructor).",
)
def update_submission_status(
    submission_id: int,
    body: StatusUpdatePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_admin_or_instructor(current_user)

    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    # Optional business rules
    if body.status == "Accepted" and body.grade is None:
        raise HTTPException(status_code=400, detail="Grade is required when accepting a submission")
    if body.status == "NeedsRevision" and (body.feedback_text is None or not body.feedback_text.strip()):
        raise HTTPException(status_code=400, detail="Feedback text is required when marking NeedsRevision")

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if _is_instructor(current_user) and not _submission_is_assigned_to_instructor(sub, current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to modify this submission")

    # Validate grade dynamically against assignment max when provided
    if body.grade is not None:
        assignment = (
            db.query(models.Assignment)
            .filter(models.Assignment.assignment_id == sub.assignment_id)
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found for submission")
        if body.grade < 0:
            raise HTTPException(status_code=400, detail="Grade must be >= 0")
        max_g = assignment.max_grade or 100.0
        if body.grade > max_g:
            raise HTTPException(status_code=400, detail=f"Grade exceeds assignment max ({max_g})")

    try:
        # Update status (+ reviewed_at if exists)
        sub.status = body.status
        if _has_attr(sub, "reviewed_at"):
            sub.reviewed_at = _now()
        _touch_updated(sub)

        # Upsert feedback if provided
        fb = db.query(models.SubmissionFeedback).filter(
            models.SubmissionFeedback.submission_id == submission_id
        ).first()

        has_any_feedback = (body.feedback_text is not None) or (body.grade is not None)

        if has_any_feedback:
            if fb:
                if body.feedback_text is not None:
                    fb.feedback_text = body.feedback_text
                if body.grade is not None:
                    fb.grade = body.grade
                # ensure instructor_id if missing
                if _has_attr(fb, "instructor_id") and getattr(fb, "instructor_id", None) in (None, 0) and _is_instructor(current_user):
                    fb.instructor_id = current_user.id
                _touch_updated(fb)
            else:
                kwargs = dict(
                    submission_id=submission_id,
                    feedback_text=body.feedback_text,
                    grade=body.grade,
                )
                if _has_attr(models.SubmissionFeedback, "instructor_id") and _is_instructor(current_user):
                    kwargs["instructor_id"] = current_user.id
                fb = models.SubmissionFeedback(**kwargs)
                db.add(fb)

        db.commit()

        # Re-fetch detail payload
        sub_row = db.execute(
            """
            SELECT s.*, a.title AS assignment_title, d.name AS course
            FROM Submission s
            JOIN Assignment a ON a.assignment_id = s.assignment_id
            LEFT JOIN Department d ON d.department_id = a.department_id
            WHERE s.submission_id = :sid
            """,
            {"sid": submission_id},
        ).mappings().first()

        fb_row = db.execute(
            """
            SELECT feedback_id, instructor_id, feedback_text, grade, created_at
            FROM SubmissionFeedback
            WHERE submission_id = :sid
            """,
            {"sid": submission_id},
        ).mappings().first()

        submission = SubmissionListItem(
            id=sub_row["submission_id"],
            assignmentId=sub_row["assignment_id"],
            studentId=sub_row["student_id"],
            title=sub_row.get("assignment_title"),
            course=sub_row.get("course"),
            fileName=sub_row.get("original_filename"),
            filePath=sub_row.get("file_path"),
            fileType=sub_row.get("file_type"),
            submittedAt=sub_row.get("submitted_at"),
            status=sub_row["status"],
            notes=sub_row.get("student_notes"),
            grade=fb_row.get("grade") if fb_row else None,
            reviewerId=fb_row.get("instructor_id") if fb_row else None,
        )
        feedback = None
        if fb_row:
            feedback = FeedbackRead(
                id=fb_row["feedback_id"],
                instructorId=fb_row.get("instructor_id"),
                text=fb_row.get("feedback_text"),
                grade=fb_row.get("grade"),
                createdAt=fb_row.get("created_at"),
            )

        return SubmissionDetailResponse(submission=submission, feedback=feedback)

    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Constraint error while updating submission")
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update submission status")


@router.delete(
    "/{submission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a submission (admin only).",
)
def delete_submission(
    submission_id: int,
    delete_file: bool = Query(True, description="Also remove file from disk if under UPLOAD_DIR"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Admin-only destructive operation
    if (current_user.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete submissions")

    sub = db.query(models.Submission).filter(models.Submission.submission_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    old_public = sub.file_path
    try:
        db.delete(sub)
        db.commit()

        if delete_file and old_public:
            try:
                disk = _disk_path_from_public(old_public)
                if disk.is_file():
                    # ensure path is inside UPLOAD_DIR
                    if disk.resolve().is_relative_to(UPLOAD_DIR.resolve()):
                        disk.unlink()
            except Exception:
                # Don't fail the request for disk cleanup issues
                pass
        return
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete submission")


@router.get(
    "/stats/summary",
    summary="Submissions summary (admin/instructor).",
)
def submissions_stats(
    mine_only: bool = Query(True, description="For instructors, restrict to my assigned submissions when possible"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_admin_or_instructor(current_user)

    q = db.query(models.Submission)
    if _is_instructor(current_user):
        # Restrict to 'mine' when schema supports it
        # We cannot easily express the dynamic instructor filter with ORM across many column names,
        # so we approximate with the most common names.
        if _has_attr(models.Submission, "instructor_id"):
            q = q.filter(models.Submission.instructor_id == current_user.id)
        elif _has_attr(models.Submission, "assigned_instructor_id"):
            q = q.filter(models.Submission.assigned_instructor_id == current_user.id)
        elif _has_attr(models.Submission, "reviewer_id"):
            q = q.filter(models.Submission.reviewer_id == current_user.id)
        # else: no restriction

    total = q.count()
    by_status = {s: 0 for s in VALID_STATUSES}
    for s in VALID_STATUSES:
        by_status[s] = q.filter(models.Submission.status == s).count()

    return {
        "total": total,
        "by_status": by_status,
        "generated_at": _now().isoformat(),
    }
