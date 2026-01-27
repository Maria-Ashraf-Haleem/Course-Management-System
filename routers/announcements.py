# routers/announcements.py
from __future__ import annotations

from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_

from app.db import get_db
from app import models
from app.deps import get_current_active_user

router = APIRouter(prefix="/announcements", tags=["announcements"])

# ---- Pydantic models --------------------------------------------------------

class AnnouncementCreate(BaseModel):
    title: str = Field(..., description="Announcement title")
    message: str = Field(..., description="Announcement message")
    # Accept values like 'all_students', 'first', 'second', 'third', 'fourth', 'fifth', or 'course:<course_id>'
    target_audience: str = Field("all_students", description="Target audience: 'all_students', year level, or 'course:<id>'")
    priority: str = Field("normal", description="Priority level")
    scheduled_for: Optional[datetime] = Field(None, description="When to send the announcement")

class AnnouncementResponse(BaseModel):
    id: int
    title: str
    message: str
    target_audience: str
    priority: str
    scheduled_for: Optional[datetime]
    sent_at: datetime
    status: str

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    target_audience: Optional[str] = None
    priority: Optional[str] = None
    scheduled_for: Optional[datetime] = None


# ---- Helpers ----------------------------------------------------------------

def _require_instructor(user: models.User):
    if (user.role or "").lower() not in {"instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor or admin role required")

def _validate_target_audience(audience: str):
    # Backward compatible valid sets
    valid_audiences = {"all", "all_students", "first", "second", "third", "fourth", "fifth"}
    if audience in valid_audiences:
        return
    # Allow pattern course:<id>
    if audience.startswith("course:"):
        parts = audience.split(":", 1)
        if len(parts) == 2 and parts[1].isdigit():
            return
    # Allow pattern student:<id>
    if audience.startswith("student:"):
        parts = audience.split(":", 1)
        if len(parts) == 2 and parts[1].isdigit():
            return
    raise HTTPException(status_code=400, detail="Invalid target audience. Use 'all_students', a year level, or 'course:<course_id>'")

def _validate_priority(priority: str):
    valid_priorities = {"low", "normal", "high", "urgent"}
    if priority not in valid_priorities:
        raise HTTPException(status_code=400, detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}")

# ---- Routes ----------------------------------------------------------------

@router.post(
    "/",
    response_model=AnnouncementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new announcement (instructor only)"
)
def create_announcement(
    announcement_data: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    # Validate input
    _validate_target_audience(announcement_data.target_audience)
    _validate_priority(announcement_data.priority)
    
    # Get instructor ID from current user
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor profile not found")
    
    # Normalize and validate course ownership if needed
    target_value = announcement_data.target_audience
    # normalize legacy 'all' to 'all_students'
    if target_value == "all":
        target_value = "all_students"

    # If targeting a specific course, ensure course exists and is owned by current instructor
    if target_value.startswith("course:"):
        course_id_str = target_value.split(":", 1)[1]
        try:
            course_id = int(course_id_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course id in target audience")
        course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if course.created_by != instructor.instructor_id and (current_user.role or "").lower() != "admin":
            raise HTTPException(status_code=403, detail="You can only target your own courses")

    # If targeting a specific student, ensure student exists and (optional) is related to instructor
    if target_value.startswith("student:"):
        sid_str = target_value.split(":", 1)[1]
        try:
            sid = int(sid_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid student id in target audience")
        student = db.query(models.Student).filter(models.Student.student_id == sid).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        # Optional: only allow messaging a student if enrolled in one of instructor's courses
        enrolled = (
            db.query(models.CourseEnrollment)
            .join(models.Course, models.Course.course_id == models.CourseEnrollment.course_id)
            .filter(
                models.CourseEnrollment.student_id == sid,
                models.CourseEnrollment.status == "Active",
                models.Course.created_by == instructor.instructor_id,
            )
            .first()
        )
        if not enrolled and (current_user.role or "").lower() != "admin":
            raise HTTPException(status_code=403, detail="You can only message your own students")

    # Create new announcement
    try:
        new_announcement = models.Announcement(
            title=announcement_data.title,
            message=announcement_data.message,
            target_audience=target_value,
            priority=announcement_data.priority,
            scheduled_for=announcement_data.scheduled_for,
            sent_at=datetime.utcnow(),
            status="sent",
            created_by=instructor.instructor_id
        )
        
        db.add(new_announcement)
        db.commit()
        db.refresh(new_announcement)
        
        return AnnouncementResponse(
            id=new_announcement.id,
            title=new_announcement.title,
            message=new_announcement.message,
            target_audience=new_announcement.target_audience,
            priority=new_announcement.priority,
            scheduled_for=new_announcement.scheduled_for,
            sent_at=new_announcement.sent_at,
            status=new_announcement.status
        )
        
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create announcement. Please check your input.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get(
    "/",
    response_model=List[AnnouncementResponse],
    summary="List all announcements (instructor only)"
)
def list_announcements(
    target_audience: Optional[str] = None,
    priority: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    query = db.query(models.Announcement)
    
    # Apply filters
    if target_audience:
        _validate_target_audience(target_audience)
        # Normalize legacy 'all' to 'all_students' when filtering
        if target_audience == "all":
            target_audience = "all_students"
        query = query.filter(models.Announcement.target_audience == target_audience)
    
    if priority:
        _validate_priority(priority)
        query = query.filter(models.Announcement.priority == priority)
    
    if status:
        query = query.filter(models.Announcement.status == status)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            models.Announcement.title.ilike(search_term) |
            models.Announcement.message.ilike(search_term)
        )
    
    # Apply pagination and ordering
    announcements = query.order_by(models.Announcement.sent_at.desc()).offset(offset).limit(limit).all()
    
    return [
        AnnouncementResponse(
            id=announcement.id,
            title=announcement.title,
            message=announcement.message,
            target_audience=announcement.target_audience,
            priority=announcement.priority,
            scheduled_for=announcement.scheduled_for,
            sent_at=announcement.sent_at,
            status=announcement.status
        )
        for announcement in announcements
    ]

@router.get(
    "/my",
    response_model=List[AnnouncementResponse],
    summary="List announcements relevant to the current student"
)
def list_my_announcements(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Only students can call this endpoint
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")

    # Find student profile
    student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Build matching audiences
    audiences = {"all", "all_students"}
    # normalize year level to lower-case expected by audiences validator
    if student.year_level:
        audiences.add(student.year_level.lower())

    # Add course-specific audiences
    enrollments = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.student_id == student.student_id,
        models.CourseEnrollment.status == "Active"
    ).all()
    for enr in enrollments:
        audiences.add(f"course:{enr.course_id}")
    # Add direct student audience
    audiences.add(f"student:{student.student_id}")

    query = db.query(models.Announcement).filter(models.Announcement.target_audience.in_(list(audiences)))
    announcements = query.order_by(models.Announcement.sent_at.desc()).offset(offset).limit(limit).all()

    # Get read status for each announcement
    announcement_ids = [a.id for a in announcements]
    read_receipts = db.query(models.AnnouncementReadReceipt).filter(
        and_(
            models.AnnouncementReadReceipt.announcement_id.in_(announcement_ids),
            models.AnnouncementReadReceipt.student_id == student.student_id
        )
    ).all()
    read_announcement_ids = {receipt.announcement_id for receipt in read_receipts}

    # Return only unread announcements to prevent already read items from reappearing
    unread = [a for a in announcements if a.id not in read_announcement_ids]
    return [
        {
            "id": a.id,
            "title": a.title,
            "message": a.message,
            "target_audience": a.target_audience,
            "priority": a.priority,
            "scheduled_for": a.scheduled_for,
            "sent_at": a.sent_at,
            "status": a.status,
            "read": False
        }
        for a in unread
    ]

@router.get(
    "/{announcement_id}",
    response_model=AnnouncementResponse,
    summary="Get announcement details by ID (instructor only)"
)
def get_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    announcement = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    return AnnouncementResponse(
        id=announcement.id,
        title=announcement.title,
        message=announcement.message,
        target_audience=announcement.target_audience,
        priority=announcement.priority,
        scheduled_for=announcement.scheduled_for,
        sent_at=announcement.sent_at,
        status=announcement.status
    )

@router.put(
    "/{announcement_id}",
    response_model=AnnouncementResponse,
    summary="Update announcement (instructor only)"
)
def update_announcement(
    announcement_id: int,
    announcement_data: AnnouncementUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    announcement = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    # Validate input if provided
    if announcement_data.target_audience:
        _validate_target_audience(announcement_data.target_audience)
    
    if announcement_data.priority:
        _validate_priority(announcement_data.priority)
    
    # Update fields
    try:
        if announcement_data.title is not None:
            announcement.title = announcement_data.title
        if announcement_data.message is not None:
            announcement.message = announcement_data.message
        if announcement_data.target_audience is not None:
            # Normalize and validate ownership if switching to a course audience
            new_target = announcement_data.target_audience
            if new_target == "all":
                new_target = "all_students"
            if new_target.startswith("course:"):
                course_id = int(new_target.split(":", 1)[1]) if new_target.split(":", 1)[1].isdigit() else None
                if not course_id:
                    raise HTTPException(status_code=400, detail="Invalid course id in target audience")
                course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
                if not course:
                    raise HTTPException(status_code=404, detail="Course not found")
                if course.created_by != announcement.created_by and (current_user.role or "").lower() != "admin":
                    raise HTTPException(status_code=403, detail="You can only target your own courses")
            announcement.target_audience = new_target
        if announcement_data.priority is not None:
            announcement.priority = announcement_data.priority
        if announcement_data.scheduled_for is not None:
            announcement.scheduled_for = announcement_data.scheduled_for
        
        db.commit()
        db.refresh(announcement)
        
        return AnnouncementResponse(
            id=announcement.id,
            title=announcement.title,
            message=announcement.message,
            target_audience=announcement.target_audience,
            priority=announcement.priority,
            scheduled_for=announcement.scheduled_for,
            sent_at=announcement.sent_at,
            status=announcement.status
        )
        
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to update announcement. Please check your input.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete(
    "/{announcement_id}",
    summary="Delete announcement (instructor only)"
)
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    announcement = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    try:
        db.delete(announcement)
        db.commit()
        return {"message": "Announcement deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post(
    "/{announcement_id}/mark-read",
    summary="Mark announcement as read (student only)"
)
def mark_announcement_as_read(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Only students can call this endpoint
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")

    # Find student profile
    student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Check if announcement exists
    announcement = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # Check if already marked as read
    existing_receipt = db.query(models.AnnouncementReadReceipt).filter(
        and_(
            models.AnnouncementReadReceipt.announcement_id == announcement_id,
            models.AnnouncementReadReceipt.student_id == student.student_id
        )
    ).first()

    if existing_receipt:
        return {"message": "Announcement already marked as read"}

    # Create read receipt
    try:
        read_receipt = models.AnnouncementReadReceipt(
            announcement_id=announcement_id,
            student_id=student.student_id
        )
        db.add(read_receipt)
        db.commit()
        return {"message": "Announcement marked as read"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post(
    "/mark-all-read",
    summary="Mark all announcements as read (student only)"
)
def mark_all_announcements_as_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Only students can call this endpoint
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")

    # Find student profile
    student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Get all announcements visible to this student
    audiences = {"all", "all_students"}
    if student.year_level:
        audiences.add(student.year_level.lower())

    # Add course-specific audiences
    enrollments = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.student_id == student.student_id,
        models.CourseEnrollment.status == "Active"
    ).all()
    for enr in enrollments:
        audiences.add(f"course:{enr.course_id}")
    audiences.add(f"student:{student.student_id}")

    # Get all announcements for this student
    announcements = db.query(models.Announcement).filter(
        models.Announcement.target_audience.in_(list(audiences))
    ).all()

    # Get already read announcements
    read_announcement_ids = db.query(models.AnnouncementReadReceipt.announcement_id).filter(
        models.AnnouncementReadReceipt.student_id == student.student_id
    ).all()
    read_ids = {row[0] for row in read_announcement_ids}

    # Create read receipts for unread announcements
    try:
        new_receipts = []
        for announcement in announcements:
            if announcement.id not in read_ids:
                receipt = models.AnnouncementReadReceipt(
                    announcement_id=announcement.id,
                    student_id=student.student_id
                )
                new_receipts.append(receipt)
        
        if new_receipts:
            db.add_all(new_receipts)
            db.commit()
            return {"message": f"Marked {len(new_receipts)} announcements as read"}
        else:
            return {"message": "All announcements already marked as read"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

