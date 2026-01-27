# routers/student_profile.py
from __future__ import annotations

from typing import Optional, List
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db import get_db
from app import models
from app.deps import get_current_active_user
from routers.auth import PasswordChange, change_password
from sqlalchemy import func, and_
from datetime import timedelta

router = APIRouter(prefix="/student-profile", tags=["student-profile"])

# ---- Pydantic models --------------------------------------------------------

class StudentProfileUpdate(BaseModel):
    # Personal info (student editable)
    full_name: Optional[str] = Field(None, description="Student full name")
    email: Optional[str] = Field(None, description="Student email")
    phone: Optional[str] = Field(None, description="Student phone")
    # Extended profile
    gpa: Optional[float] = Field(None, description="Student's GPA", ge=0.0, le=4.0)
    date_of_birth: Optional[datetime] = Field(None, description="Student's date of birth")
    nationality: Optional[str] = Field(None, description="Student's nationality")
    address: Optional[str] = Field(None, description="Student's address")
    emergency_contact_name: Optional[str] = Field(None, description="Emergency contact name")
    emergency_contact_relationship: Optional[str] = Field(None, description="Emergency contact relationship")
    emergency_contact_phone: Optional[str] = Field(None, description="Emergency contact phone")
    # New fields for course enrollment status update
    course_id: Optional[int] = Field(None, description="Course ID to update enrollment status for")
    status: Optional[str] = Field(None, description="New status for the course enrollment (e.g., 'Active', 'Dropped')")

class StudentProfileResponse(BaseModel):
    student_id: int
    student_number: str
    full_name: str
    email: Optional[str]
    phone: Optional[str]
    year_level: str
    status: str
    graduation_year: Optional[int]
    notes: Optional[str]
    created_at: datetime
    user_id: Optional[int]
    
    # Enhanced profile fields
    gpa: Optional[float]
    date_of_birth: Optional[datetime]
    nationality: Optional[str]
    address: Optional[str]
    emergency_contact_name: Optional[str]
    emergency_contact_relationship: Optional[str]
    emergency_contact_phone: Optional[str]

class StudentCourseEnrollment(BaseModel):
    course_id: int
    course_title: str
    course_code: str
    credits: int
    department_name: str
    enrolled_at: datetime

class StudentAcademicInfo(BaseModel):
    overall_gpa: Optional[float]
    credits_completed: int
    credits_required: int
    current_courses: List[StudentCourseEnrollment]

class AttendanceRecord(BaseModel):
    date: date
    course_name: str
    course_code: str
    status: str  # "Present", "Absent", "Late", "Excused"
    notes: Optional[str] = None

class StudentAttendanceResponse(BaseModel):
    student_id: int
    student_name: str
    total_classes: int
    present_classes: int
    absent_classes: int
    late_classes: int
    attendance_rate: float
    attendance_records: List[AttendanceRecord]

class StudentRankResponse(BaseModel):
    student_id: int
    period: str
    rank: int | None = None

class GPAUpdate(BaseModel):
    gpa: float = Field(..., ge=0.0, le=4.0, description="Student's GPA")

# ---- Helpers ----------------------------------------------------------------

def _require_instructor(user: models.User):
    if (user.role or "").lower() not in {"instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor or admin role required")

def _require_student_or_instructor(user: models.User):
    if (user.role or "").lower() not in {"student", "instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student, instructor, or admin role required")

# ---- Routes ----------------------------------------------------------------

@router.get(
    "/{student_id}",
    response_model=StudentProfileResponse,
    summary="Get complete student profile"
)
def get_student_profile(
    student_id: str,  # Changed to str to handle "me"
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student_or_instructor(current_user)
    
    # Handle "me" endpoint for students
    if student_id == "me":
        if current_user.role != "student":
            raise HTTPException(status_code=403, detail="Only students can use 'me' endpoint")
        student = db.query(models.Student).filter(
            models.Student.user_id == current_user.id
        ).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found")
    else:
        # Get student
        if current_user.role == "student":
            student = db.query(models.Student).filter(
                models.Student.user_id == current_user.id
            ).first()
            if not student or student.student_id != int(student_id):
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            student = db.query(models.Student).filter(models.Student.student_id == int(student_id)).first()
            if not student:
                raise HTTPException(status_code=404, detail="Student not found")
    
    print(f"[DEBUG Backend] Fetched student data: student_id={student.student_id}, name={student.full_name}, email={student.email}")

    return StudentProfileResponse(
        student_id=student.student_id,
        student_number=student.student_number,
        full_name=student.full_name,
        email=student.email,
        phone=student.phone,
        year_level=student.year_level,
        status=student.status,
        graduation_year=student.graduation_year,
        notes=student.notes,
        created_at=student.created_at,
        user_id=student.user_id,
        gpa=getattr(student, 'gpa', None),
        date_of_birth=getattr(student, 'date_of_birth', None),
        nationality=getattr(student, 'nationality', None),
        address=getattr(student, 'address', None),
        emergency_contact_name=getattr(student, 'emergency_contact_name', None),
        emergency_contact_relationship=getattr(student, 'emergency_contact_relationship', None),
        emergency_contact_phone=getattr(student, 'emergency_contact_phone', None),
    )


@router.get(
    "/{student_id}/rank",
    response_model=StudentRankResponse,
    summary="Get student's rank if in top performers for the selected period"
)
def get_student_rank(
    student_id: int,
    period: str = "month",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Return the student's rank (1..5) among top performers for the given period,
    based on average SubmissionFeedback.grade. If not in top 5, rank is null.
    Accessible by student themself, instructor, or admin.
    """
    _require_student_or_instructor(current_user)

    # Access control for students: can only access their own rank
    if (current_user.role or "").lower() == "student":
        stu = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
        if not stu or stu.student_id != student_id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Determine date range
    now = datetime.utcnow()
    if period == "week":
        start = now - timedelta(days=7)
    elif period == "quarter":
        start = now - timedelta(days=90)
    elif period == "year":
        start = now - timedelta(days=365)
    else:  # month
        start = now - timedelta(days=30)

    # Query top 5 by average grade
    rows = db.query(
        models.Student.student_id,
        func.avg(models.SubmissionFeedback.grade).label("avg_grade")
    ).join(
        models.Submission, models.Student.student_id == models.Submission.student_id
    ).join(
        models.SubmissionFeedback, models.Submission.submission_id == models.SubmissionFeedback.submission_id
    ).filter(
        and_(
            models.Submission.submitted_at >= start,
            models.Submission.submitted_at <= now,
            models.SubmissionFeedback.grade.isnot(None)
        )
    ).group_by(models.Student.student_id).order_by(func.avg(models.SubmissionFeedback.grade).desc()).limit(5).all()

    rank_map = {sid: idx + 1 for idx, (sid, _) in enumerate(rows)}
    rank_val = rank_map.get(int(student_id))
    return StudentRankResponse(student_id=student_id, period=period, rank=rank_val)



@router.put(
    "/{student_id}",
    response_model=StudentProfileResponse,
    summary="Update student profile (instructor can update GPA, student can update personal info)"
)
def update_student_profile(
    student_id: str,  # Changed to str to handle "me"
    profile_data: StudentProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student_or_instructor(current_user)
    
    # Handle "me" endpoint for students
    if student_id == "me":
        if current_user.role != "student":
            raise HTTPException(status_code=403, detail="Only students can use 'me' endpoint")
        student = db.query(models.Student).filter(
            models.Student.user_id == current_user.id
        ).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found")
    else:
        # Get student
        if current_user.role == "student":
            student = db.query(models.Student).filter(
                models.Student.user_id == current_user.id
            ).first()
            if not student or student.student_id != int(student_id):
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            student = db.query(models.Student).filter(models.Student.student_id == int(student_id)).first()
            if not student:
                raise HTTPException(status_code=404, detail="Student not found")
    
    update_data = profile_data.dict(exclude_unset=True)

    # Students can only update personal info, not GPA
    if current_user.role == "student" and "gpa" in update_data:
        raise HTTPException(status_code=403, detail="Students cannot update their own GPA")

    # Handle course enrollment status update
    course_id_to_update = update_data.pop("course_id", None)
    new_enrollment_status = update_data.pop("status", None)

    if course_id_to_update is not None and new_enrollment_status is not None:
        enrollment = db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.student_id == student.student_id,
            models.CourseEnrollment.course_id == course_id_to_update
        ).first()

        if not enrollment:
            raise HTTPException(status_code=404, detail="Enrollment not found for this student and course")
        
        enrollment.status = new_enrollment_status
        db.add(enrollment)

    # Apply changes to Student model
    for field, value in update_data.items():
        if hasattr(models.Student, field) and hasattr(student, field):
            setattr(student, field, value)
    
    try:
        db.commit()
        db.refresh(student)
        
        # Also update the User table if full_name is being updated
        if "full_name" in update_data and student.user_id:
            user = db.query(models.User).filter(models.User.id == student.user_id).first()
            if user:
                # Update the user's username to match the new full_name for consistency
                # This ensures the /auth/me endpoint returns the updated name
                pass  # We don't update username, just keep the full_name in Student table
        
        return StudentProfileResponse(
            student_id=student.student_id,
            student_number=student.student_number,
            full_name=student.full_name,
            email=student.email,
            phone=student.phone,
            year_level=student.year_level,
            status=student.status,
            graduation_year=student.graduation_year,
            notes=student.notes,
            created_at=student.created_at,
            user_id=student.user_id,
            gpa=getattr(student, 'gpa', None),
            date_of_birth=getattr(student, 'date_of_birth', None),
            nationality=getattr(student, 'nationality', None),
            address=getattr(student, 'address', None),
            emergency_contact_name=getattr(student, 'emergency_contact_name', None),
            emergency_contact_relationship=getattr(student, 'emergency_contact_relationship', None),
            emergency_contact_phone=getattr(student, 'emergency_contact_phone', None),
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to update profile")



@router.get(
    "/{student_id}/academic-info",
    response_model=StudentAcademicInfo,
    summary="Get student academic information including courses and GPA"
)
def get_student_academic_info(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_student_or_instructor(current_user)
    
    # Get student
    if current_user.role == "student":
        student = db.query(models.Student).filter(
            models.Student.user_id == current_user.id
        ).first()
        if not student or student.student_id != student_id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        student = db.query(models.Student).filter(models.Student.student_id == student_id).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
    
    # Get GPA from student record
    overall_gpa = getattr(student, 'gpa', None)

    # Build current courses from real enrollments
    current_courses: List[StudentCourseEnrollment] = []
    enrollments = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.student_id == student.student_id,
        models.CourseEnrollment.status == "Active"
    ).all()

    for enr in enrollments:
        course = db.query(models.Course).filter(models.Course.course_id == enr.course_id).first()
        if not course:
            continue
        current_courses.append(
            StudentCourseEnrollment(
                course_id=course.course_id,
                course_title=course.title,
                course_code=course.code,
                credits=0,  # Not tracked yet
                department_name="",  # Not tracked yet
                enrolled_at=enr.enrolled_at,
            )
        )

    # Credits tracking not implemented yet
    credits_completed = 0
    credits_required = 0

    return StudentAcademicInfo(
        overall_gpa=overall_gpa,
        credits_completed=credits_completed,
        credits_required=credits_required,
        current_courses=current_courses,
    )

@router.post(
    "/{student_id}/update-gpa",
    response_model=StudentProfileResponse,
    summary="Update student GPA (instructor only)"
)
def update_student_gpa(
    student_id: int,
    gpa_data: GPAUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    student = db.query(models.Student).filter(models.Student.student_id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Update GPA
    if hasattr(student, 'gpa'):
        student.gpa = gpa_data.gpa
    else:
        # If the column doesn't exist yet, we'll handle it gracefully
        pass
    
    try:
        db.commit()
        db.refresh(student)
        
        return StudentProfileResponse(
            student_id=student.student_id,
            student_number=student.student_number,
            full_name=student.full_name,
            email=student.email,
            phone=student.phone,
            year_level=student.year_level,
            status=student.status,
            graduation_year=student.graduation_year,
            notes=student.notes,
            created_at=student.created_at,
            user_id=student.user_id,
            gpa=getattr(student, 'gpa', None),
            date_of_birth=getattr(student, 'date_of_birth', None),
            nationality=getattr(student, 'nationality', None),
            address=getattr(student, 'address', None),
            emergency_contact_name=getattr(student, 'emergency_contact_name', None),
            emergency_contact_relationship=getattr(student, 'emergency_contact_relationship', None),
            emergency_contact_phone=getattr(student, 'emergency_contact_phone', None),
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update GPA")

@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_my_password(
    password_data: PasswordChange,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can change their own password via this endpoint")
    
    # Reuse the existing change_password logic from auth router
    return change_password(password_data, current_user, db)

@router.get(
    "/{student_id}/attendance",
    response_model=StudentAttendanceResponse,
    summary="Get student attendance records"
)
def get_student_attendance(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get student attendance records from LectureAttendance"""
    _require_student_or_instructor(current_user)
    
    # Get student
    if current_user.role == "student":
        student = db.query(models.Student).filter(
            models.Student.user_id == current_user.id
        ).first()
        if not student or student.student_id != student_id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        student = db.query(models.Student).filter(models.Student.student_id == student_id).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
    
    # Build from real Lecture and LectureAttendance data
    enrollments = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.student_id == student_id,
        models.CourseEnrollment.status == "Active"
    ).all()

    attendance_records: List[AttendanceRecord] = []
    total_classes = 0
    present_classes = 0
    absent_classes = 0
    late_classes = 0

    for enr in enrollments:
        course = db.query(models.Course).filter(models.Course.course_id == enr.course_id).first()
        if not course:
            continue
        lectures = db.query(models.Lecture).filter(models.Lecture.course_id == enr.course_id).all()
        for lec in lectures:
            total_classes += 1
            rec = db.query(models.LectureAttendance).filter(
                models.LectureAttendance.lecture_id == lec.lecture_id,
                models.LectureAttendance.student_id == student_id,
            ).first()
            status_val = rec.status if rec else "Absent"
            if status_val == "Present" or status_val == "Excused":
                present_classes += 1 if status_val == "Present" else 0
            if status_val == "Absent":
                absent_classes += 1
            if status_val == "Late":
                late_classes += 1
            attendance_records.append(AttendanceRecord(
                date=lec.date.date(),
                course_name=course.title,
                course_code=course.code,
                status=status_val,
                notes=getattr(rec, 'notes', None) if rec else None
            ))

    attendance_rate = (present_classes / total_classes * 100) if total_classes > 0 else 0.0

    return StudentAttendanceResponse(
        student_id=student_id,
        student_name=student.full_name,
        total_classes=total_classes,
        present_classes=present_classes,
        absent_classes=absent_classes,
        late_classes=late_classes,
        attendance_rate=round(attendance_rate, 2),
        attendance_records=attendance_records,
    )
