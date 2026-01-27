from __future__ import annotations

from typing import Optional, List, Dict
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db import get_db
from app import models
from app.deps import get_current_active_user

router = APIRouter(prefix="/course-management", tags=["course-management"])

# ---- Pydantic models --------------------------------------------------------

class AssignmentBase(BaseModel):
    title: str = Field(..., description="Assignment title")
    description: Optional[str] = Field(None, description="Assignment description")
    type_id: int = Field(..., description="Assignment type ID")
    department_id: Optional[int] = Field(None, description="Department ID (optional)")
    course_id: int = Field(..., description="Course ID for the assignment")
    target_year: Optional[str] = Field(None, description="Target year for the assignment (e.g., 'Fourth', 'All')")
    deadline: datetime = Field(..., description="Assignment deadline (UTC)")
    max_grade: float = Field(..., description="Maximum grade for the assignment")

class AssignmentCreateRequest(AssignmentBase):
    pass

class AssignmentResponse(BaseModel):
    assignment_id: int
    title: str
    description: Optional[str]
    type_id: Optional[int] # Changed to Optional to allow None values
    department_id: Optional[int]
    course_id: int
    target_year: Optional[str]
    deadline: datetime
    max_grade: float
    created_by: int
    created_at: datetime

# New models for actual Course creation
class CourseCreateRequest(BaseModel):
    title: str = Field(..., description="Course title")
    description: Optional[str] = Field(None, description="Course description")
    code: str = Field(..., description="Course code (e.g., DENT401)")

class CourseCreateResponse(BaseModel):
    course_id: int
    title: str
    description: Optional[str]
    code: str
    created_by: int
    is_active: int
    created_at: datetime

class CourseUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, description="Course title")
    description: Optional[str] = Field(None, description="Course description")
    code: Optional[str] = Field(None, description="Course code (e.g., DENT401)")

# Lecture/Attendance models
class LectureCreate(BaseModel):
    date: datetime = Field(..., description="Lecture date and time (UTC)")
    topic: Optional[str] = Field(None, description="Lecture topic")
    duration_minutes: Optional[int] = Field(None, ge=0)

class LectureRead(BaseModel):
    lecture_id: int
    course_id: int
    date: datetime
    topic: Optional[str]
    duration_minutes: Optional[int]
    created_by: int
    created_at: datetime

class AttendanceMark(BaseModel):
    student_id: int
    status: str = Field(..., description="Present | Absent | Late | Excused")
    notes: Optional[str] = None

class AttendanceBulkRequest(BaseModel):
    marks: List[AttendanceMark]

class StudentAttendanceSummary(BaseModel):
    student_id: int
    course_id: int
    total_lectures: int
    present: int
    absent: int
    late: int
    excused: int
    percentage: float

class SingleAttendanceUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

# ---------- Student Course Details ----------
class StudentSubmissionItem(BaseModel):
    submission_id: int
    assignment_id: int
    assignment_title: str
    submitted_at: datetime
    status: str
    grade: Optional[float] = None

class StudentCourseDetails(BaseModel):
    course_id: int
    title: str
    description: Optional[str]
    code: str
    is_active: int
    created_at: datetime
    enrollment_count: int
    enrollment_status: str
    enrolled_at: Optional[datetime]
    attendance_total_lectures: int
    attendance_present: int
    attendance_absent: int
    attendance_late: int
    attendance_excused: int
    attendance_percentage: float
    submissions: List[StudentSubmissionItem]

# Course Enrollment Models
class CourseEnrollmentCreate(BaseModel):
    course_id: int = Field(..., description="Course ID to enroll in")
    student_id: int = Field(..., description="Student ID to enroll")

class CourseEnrollmentResponse(BaseModel):
    enrollment_id: int
    course_id: int
    student_id: int
    enrolled_at: datetime
    status: str
    grade: Optional[float]
    notes: Optional[str]
    # Include course details
    course_title: str
    course_code: str
    student_name: str # Added to include student's full name

class CourseWithEnrollments(BaseModel):
    course_id: int
    title: str
    description: Optional[str]
    code: str
    instructor_name: str
    is_active: int
    created_at: datetime
    # Include enrollment count
    enrollment_count: int

# Enrollment request (for instructor review)
class EnrollmentRequest(BaseModel):
    enrollment_id: int
    course_id: int
    course_title: str
    course_code: str
    student_id: int
    student_name: str
    requested_at: datetime
    status: str

# ---- Helpers ----------------------------------------------------------------

def _require_instructor(user: models.User):
    if (user.role or "").lower() not in {"instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor or admin role required")

# ---- Routes ----------------------------------------------------------------

@router.post(
    "/courses",
    response_model=CourseCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new course (instructor only)"
)
def create_course(
    course_data: CourseCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    # Check if course code already exists
    existing_course = db.query(models.Course).filter(
        models.Course.code == course_data.code
    ).first()
    
    if existing_course:
        raise HTTPException(status_code=400, detail="Course code already exists")
    
    # Get instructor ID from current user, create if doesn't exist
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instructor:
        instructor = models.Instructor(
            full_name=current_user.username,
            email=current_user.email,
            role="Lecturer",
            user_id=current_user.id,
            created_at=datetime.utcnow()
        )
        db.add(instructor)
        db.commit()
        db.refresh(instructor)
    
    # Create new course
    try:
        new_course = models.Course(
            title=course_data.title,
            description=course_data.description,
            code=course_data.code,
            created_by=instructor.instructor_id,
            is_active=1,
            created_at=datetime.utcnow(),
        )
        
        db.add(new_course)
        db.commit()
        db.refresh(new_course)
        
        return CourseCreateResponse(
            course_id=new_course.course_id,
            title=new_course.title,
            description=new_course.description,
            code=new_course.code,
            created_by=new_course.created_by,
            is_active=new_course.is_active,
            created_at=new_course.created_at
        )
        
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create course. Please check your input.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post(
    "/assignments",
    response_model=AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new assignment (instructor only)"
)
def create_assignment(
    assignment_data: AssignmentCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    # Get instructor ID from current user
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor profile not found")
    
    # Validate course exists and belongs to this instructor (and is active)
    course = db.query(models.Course).filter(models.Course.course_id == assignment_data.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if getattr(course, "is_active", 1) in (0, False):
        raise HTTPException(status_code=400, detail="Course is inactive")
    if course.created_by != instructor.instructor_id:
        raise HTTPException(status_code=403, detail="You do not own this course")
    
    # Create new assignment
    try:
        new_assignment = models.Assignment(
            title=assignment_data.title,
            description=assignment_data.description,
            type_id=assignment_data.type_id,
            department_id=assignment_data.department_id,
            course_id=assignment_data.course_id,
            target_year=assignment_data.target_year,
            deadline=assignment_data.deadline,
            max_grade=assignment_data.max_grade,
            created_by=instructor.instructor_id,
            created_at=datetime.utcnow(),
        )
        
        db.add(new_assignment)
        db.commit()
        db.refresh(new_assignment)
        
        return AssignmentResponse(
            assignment_id=new_assignment.assignment_id,
            title=new_assignment.title,
            description=new_assignment.description,
            type_id=new_assignment.type_id,
            department_id=new_assignment.department_id,
            course_id=new_assignment.course_id,
            target_year=new_assignment.target_year,
            deadline=new_assignment.deadline,
            max_grade=new_assignment.max_grade,
            created_by=new_assignment.created_by,
            created_at=new_assignment.created_at
        )
        
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create assignment. Please check your input.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get(
    "/assignments",
    response_model=List[AssignmentResponse],
    summary="List all assignments (instructor only)"
)
def list_assignments(
    # Removed filters as per generalization
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    # Scope to current instructor
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instructor:
        return []
    # assignments created by instructor or in instructor-owned courses
    query = db.query(models.Assignment).filter(
        (models.Assignment.created_by == instructor.instructor_id) |
        (models.Assignment.course_id.in_(
            db.query(models.Course.course_id).filter(models.Course.created_by == instructor.instructor_id)
        ))
    )
    
    # Apply pagination and ordering
    assignments = query.order_by(models.Assignment.created_at.desc()).offset(offset).limit(limit).all()
    
    return [
        AssignmentResponse(
            assignment_id=assignment.assignment_id,
            title=assignment.title,
            description=assignment.description,
            type_id=assignment.type_id,
            department_id=assignment.department_id,
            course_id=assignment.course_id,
            target_year=assignment.target_year,
            deadline=assignment.deadline,
            max_grade=assignment.max_grade,
            created_by=assignment.created_by,
            created_at=assignment.created_at
        )
        for assignment in assignments
    ]

# Simple course response for dropdowns
class CourseSimpleResponse(BaseModel):
    id: int
    name: str
    code: str

@router.get(
    "/courses",
    response_model=List[CourseSimpleResponse],
    summary="List all courses (simple format for dropdowns)"
)
def list_courses(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List all courses in simple format for dropdowns"""
    
    _require_instructor(current_user) # Ensure only instructors or admins can access this

    # Scope to instructor-owned active courses
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instructor:
        return []
    query = db.query(models.Course).filter(
        models.Course.is_active == 1,
        models.Course.created_by == instructor.instructor_id,
    )
    
    # Apply pagination and ordering
    courses = query.order_by(models.Course.title.asc()).offset(offset).limit(limit).all()
    
    return [
        CourseSimpleResponse(
            id=course.course_id,
            name=course.title,
            code=course.code
        )
        for course in courses
    ]

@router.get(
    "/courses/detailed",
    response_model=List[CourseWithEnrollments],
    summary="List all courses with enrollment info"
)
def list_courses_with_enrollments(
    # Removed filters as per generalization
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List courses with enrollment info.

    Behavior by role:
    - instructor: ONLY courses created by the current instructor
    - admin: all courses
    - student: all active courses (not scoped to any instructor)
    - others: forbidden
    """

    role = (current_user.role or "").lower()

    if role not in {"admin", "instructor", "student"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    base_query = (
        db.query(models.Course, models.Instructor.full_name.label('instructor_name'))
        .outerjoin(models.Instructor, models.Course.created_by == models.Instructor.instructor_id)
    )

    # Scope to current instructor
    if role == "instructor":
        instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        if not instructor:
            return []
        base_query = base_query.filter(models.Course.created_by == instructor.instructor_id)
    elif role == "student":
        # Students can browse all active courses
        base_query = base_query.filter(models.Course.is_active == 1)

    # Apply pagination and ordering
    rows = base_query.order_by(models.Course.created_at.desc()).offset(offset).limit(limit).all()

    result: List[CourseWithEnrollments] = []
    for course, instructor_name in rows:
        # Count active enrollments per course
        enrollment_count = db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.course_id == course.course_id,
            models.CourseEnrollment.status == "Active",
        ).count()

        result.append(CourseWithEnrollments(
            course_id=course.course_id,
            title=course.title,
            description=course.description,
            code=course.code,
            instructor_name=instructor_name or "Unknown",
            is_active=course.is_active,
            created_at=course.created_at,
            enrollment_count=enrollment_count,
        ))

    return result

@router.get(
    "/courses/{course_id}",
    response_model=CourseCreateResponse,
    summary="Get course details by ID"
)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    # Access rules:
    # - Admin/instructor (including 'doctor') who owns the course can view
    # - Any student can view ACTIVE courses; inactive courses require enrollment
    role = (current_user.role or "").lower()
    if role in {"admin", "instructor", "doctor"}:
        if role != "admin":
            instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
            if not instructor or course.created_by != instructor.instructor_id:
                raise HTTPException(status_code=403, detail="Access denied")
    elif role == "student":
        is_active = getattr(course, "is_active", 1) in (1, True)
        if not is_active:
            # Require active enrollment for inactive courses
            student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
            if not student:
                raise HTTPException(status_code=403, detail="Access denied")
            enrolled = db.query(models.CourseEnrollment).filter(
                models.CourseEnrollment.course_id == course_id,
                models.CourseEnrollment.student_id == student.student_id,
                models.CourseEnrollment.status == "Active",
            ).first()
            if not enrolled:
                raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return CourseCreateResponse(
        course_id=course.course_id,
        title=course.title,
        description=course.description,
        code=course.code,
        created_by=course.created_by,
        is_active=course.is_active,
        created_at=course.created_at
    )

@router.put(
    "/courses/{course_id}",
    response_model=CourseCreateResponse,
    summary="Update course details (instructor only)"
)
def update_course(
    course_id: int,
    course_data: CourseUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    # Get existing course
    course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check if course code already exists (excluding current course) if changing
    if course_data.code:
        existing_course = db.query(models.Course).filter(
            models.Course.code == course_data.code,
            models.Course.course_id != course_id
        ).first()
        
        if existing_course:
            raise HTTPException(status_code=400, detail="Course code already exists")
    
    # Update course
    try:
        if course_data.title is not None:
            course.title = course_data.title
        if course_data.description is not None:
            course.description = course_data.description
        if course_data.code is not None:
            course.code = course_data.code
        
        db.commit()
        db.refresh(course)
        
        return CourseCreateResponse(
            course_id=course.course_id,
            title=course.title,
            description=course.description,
            code=course.code,
            created_by=course.created_by,
            is_active=course.is_active,
            created_at=course.created_at
        )
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to update course. Please check your input.")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get(
    "/courses/{course_id}/assignments",
    response_model=List[AssignmentResponse],
    summary="Get assignments for a specific course"
)
def get_course_assignments(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get all assignments for a specific course"""
    
    # Check if course exists and belongs to current instructor
    course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    role = (current_user.role or "").lower()
    if role == "instructor":
        instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        if not instructor or course.created_by != instructor.instructor_id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == "student":
        student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
        if not student:
            raise HTTPException(status_code=403, detail="Student profile not found")
        enrollment = db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.course_id == course_id,
            models.CourseEnrollment.student_id == student.student_id,
            models.CourseEnrollment.status.in_(["Active", "Pending"])
        ).first()
        if not enrollment:
            raise HTTPException(status_code=403, detail="You are not enrolled in this course")
    elif role not in {"admin"}:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get assignments for this course only, exclude soft-deleted (inactive)
    assignments = (
        db.query(models.Assignment)
        .filter(
            models.Assignment.course_id == course_id,
            getattr(models.Assignment, "is_active", True) == True,
        )
        .order_by(models.Assignment.created_at.desc())
        .all()
    )
    
    return [
        AssignmentResponse(
            assignment_id=assignment.assignment_id,
            title=assignment.title,
            description=assignment.description,
            type_id=assignment.type_id,
            department_id=assignment.department_id,
            course_id=assignment.course_id,
            target_year=assignment.target_year,
            deadline=assignment.deadline,
            max_grade=assignment.max_grade,
            created_by=assignment.created_by,
            created_at=assignment.created_at
        )
        for assignment in assignments
    ]

@router.delete(
    "/courses/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a course and unenroll all students (instructor/admin only)"
)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    try:
        # Unenroll all students from the course
        db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.course_id == course_id
        ).delete(synchronize_session=False)
        
        # Delete the course
        db.delete(course)
        db.commit()
        
        return {"detail": "Course and all enrollments deleted successfully"}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Cannot delete course due to related records.")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete course")


# ---------------- Lectures ----------------
@router.post(
    "/courses/{course_id}/lectures",
    response_model=LectureRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a lecture for a course (instructor only)"
)
def create_lecture(
    course_id: int,
    data: LectureCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    # Ensure course exists and belongs to instructor
    course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not course or not instructor or course.created_by != instructor.instructor_id:
        raise HTTPException(status_code=403, detail="Access denied")

    lecture = models.Lecture(
        course_id=course_id,
        date=data.date,
        topic=data.topic,
        duration_minutes=data.duration_minutes,
        created_by=instructor.instructor_id,
        created_at=datetime.utcnow(),
    )
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    return LectureRead(
        lecture_id=lecture.lecture_id,
        course_id=lecture.course_id,
        date=lecture.date,
        topic=lecture.topic,
        duration_minutes=lecture.duration_minutes,
        created_by=lecture.created_by,
        created_at=lecture.created_at,
    )


@router.get(
    "/courses/{course_id}/lectures",
    response_model=List[LectureRead],
    summary="List lectures for a course"
)
def list_lectures(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Instructors who own the course, or enrolled students can view
    course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    is_allowed = False
    if (current_user.role or "").lower() in {"instructor", "admin"}:
        instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        is_allowed = bool(instructor and course.created_by == instructor.instructor_id)
    if not is_allowed and (current_user.role or "").lower() == "student":
        student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
        if student:
            is_allowed = db.query(models.CourseEnrollment).filter(
                models.CourseEnrollment.course_id == course_id,
                models.CourseEnrollment.student_id == student.student_id,
                models.CourseEnrollment.status == "Active",
            ).first() is not None
    if not is_allowed:
        raise HTTPException(status_code=403, detail="Access denied")

    lectures = db.query(models.Lecture).filter(models.Lecture.course_id == course_id).order_by(models.Lecture.date.desc()).all()
    return [
        LectureRead(
            lecture_id=l.lecture_id,
            course_id=l.course_id,
            date=l.date,
            topic=l.topic,
            duration_minutes=l.duration_minutes,
            created_by=l.created_by,
            created_at=l.created_at,
        )
        for l in lectures
    ]


# --------------- Attendance ---------------
@router.post(
    "/lectures/{lecture_id}/attendance",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Mark attendance for a lecture (bulk)"
)
def mark_attendance_bulk(
    lecture_id: int,
    req: AttendanceBulkRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    lecture = db.query(models.Lecture).filter(models.Lecture.lecture_id == lecture_id).first()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    # Ensure ownership
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    course = db.query(models.Course).filter(models.Course.course_id == lecture.course_id).first()
    if not instructor or not course or course.created_by != instructor.instructor_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # For each mark, upsert attendance
    for mark in req.marks:
        # Ensure the student is enrolled Active in the course
        enrolled = db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.course_id == lecture.course_id,
            models.CourseEnrollment.student_id == mark.student_id,
            models.CourseEnrollment.status == "Active",
        ).first()
        if not enrolled:
            continue

        existing = db.query(models.LectureAttendance).filter(
            models.LectureAttendance.lecture_id == lecture_id,
            models.LectureAttendance.student_id == mark.student_id,
        ).first()

        if existing:
            existing.status = mark.status
            existing.notes = mark.notes
        else:
            db.add(models.LectureAttendance(
                lecture_id=lecture_id,
                student_id=mark.student_id,
                status=mark.status,
                notes=mark.notes,
            ))

    db.commit()
    return {"ok": True}


@router.get(
    "/lectures/{lecture_id}/attendance",
    response_model=List[AttendanceMark],
    summary="Get existing attendance for a lecture"
)
def get_lecture_attendance(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Instructor who owns the course or students enrolled can view
    lecture = db.query(models.Lecture).filter(models.Lecture.lecture_id == lecture_id).first()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    course = db.query(models.Course).filter(models.Course.course_id == lecture.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if (current_user.role or "").lower() in {"instructor", "admin"}:
        instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        if not instructor or course.created_by != instructor.instructor_id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif (current_user.role or "").lower() == "student":
        student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
        if not student:
            raise HTTPException(status_code=403, detail="Access denied")
        enrolled = db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.course_id == course.course_id,
            models.CourseEnrollment.student_id == student.student_id,
            models.CourseEnrollment.status == "Active",
        ).first()
        if not enrolled:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    recs = db.query(models.LectureAttendance).filter(models.LectureAttendance.lecture_id == lecture_id).all()
    return [AttendanceMark(student_id=r.student_id, status=r.status, notes=r.notes) for r in recs]


@router.put(
    "/lectures/{lecture_id}/attendance/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set attendance for a single student"
)
def set_single_attendance(
    lecture_id: int,
    student_id: int,
    mark: SingleAttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    lecture = db.query(models.Lecture).filter(models.Lecture.lecture_id == lecture_id).first()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    course = db.query(models.Course).filter(models.Course.course_id == lecture.course_id).first()
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not course or not instructor or course.created_by != instructor.instructor_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # upsert
    existing = db.query(models.LectureAttendance).filter(
        models.LectureAttendance.lecture_id == lecture_id,
        models.LectureAttendance.student_id == student_id,
    ).first()
    if existing:
        existing.status = mark.status
        existing.notes = mark.notes
    else:
        db.add(models.LectureAttendance(
            lecture_id=lecture_id,
            student_id=student_id,
            status=mark.status,
            notes=mark.notes,
        ))
    db.commit()
    return {"ok": True}


@router.get(
    "/courses/{course_id}/attendance/summary",
    response_model=List[StudentAttendanceSummary],
    summary="Attendance summary per student for a course"
)
def attendance_summary_for_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
    if not course or not instructor or course.created_by != instructor.instructor_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Fetch active enrollments
    enrollments = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.course_id == course_id,
        models.CourseEnrollment.status == "Active",
    ).all()

    # Count attendance per student
    result: List[StudentAttendanceSummary] = []
    total_lectures = db.query(models.Lecture).filter(models.Lecture.course_id == course_id).count()

    for enr in enrollments:
        counts: Dict[str, int] = {"Present": 0, "Absent": 0, "Late": 0, "Excused": 0}
        recs = db.query(models.LectureAttendance).filter(
            models.LectureAttendance.student_id == enr.student_id,
            models.LectureAttendance.lecture_id.in_(
                db.query(models.Lecture.lecture_id).filter(models.Lecture.course_id == course_id)
            ),
        ).all()
        for r in recs:
            counts[r.status] = counts.get(r.status, 0) + 1

        present = counts.get("Present", 0) + counts.get("Excused", 0)  # treat excused as not hurting %
        percentage = (present / total_lectures * 100.0) if total_lectures > 0 else 0.0
        result.append(StudentAttendanceSummary(
            student_id=enr.student_id,
            course_id=course_id,
            total_lectures=total_lectures,
            present=counts.get("Present", 0),
            absent=counts.get("Absent", 0),
            late=counts.get("Late", 0),
            excused=counts.get("Excused", 0),
            percentage=round(percentage, 2),
        ))

    return result


@router.get(
    "/courses/{course_id}/student-view",
    response_model=StudentCourseDetails,
    summary="Get course details tailored for current student (attendance + submissions)"
)
def get_course_details_for_student(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Only students can use this endpoint
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=403, detail="Students only")

    student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
    if not course or not course.is_active:
        raise HTTPException(status_code=404, detail="Course not found")

    # Enrollment status
    enrollment = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.course_id == course_id,
        models.CourseEnrollment.student_id == student.student_id,
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    # Attendance
    total_lectures = db.query(models.Lecture).filter(models.Lecture.course_id == course_id).count()
    counts: Dict[str, int] = {"Present": 0, "Absent": 0, "Late": 0, "Excused": 0}
    recs = db.query(models.LectureAttendance).filter(
        models.LectureAttendance.student_id == student.student_id,
        models.LectureAttendance.lecture_id.in_(
            db.query(models.Lecture.lecture_id).filter(models.Lecture.course_id == course_id)
        ),
    ).all()
    for r in recs:
        counts[r.status] = counts.get(r.status, 0) + 1
    present_eff = counts.get("Present", 0) + counts.get("Excused", 0)
    percentage = (present_eff / total_lectures * 100.0) if total_lectures > 0 else 0.0

    # Submissions for assignments in this course
    assignment_ids = [a.assignment_id for a in db.query(models.Assignment).filter(models.Assignment.course_id == course_id).all()]
    subs = db.query(models.Submission).filter(
        models.Submission.assignment_id.in_(assignment_ids) if assignment_ids else False,
        models.Submission.student_id == student.student_id,
    ).all()
    subs_out: List[StudentSubmissionItem] = []
    assign_map: Dict[int, str] = {a.assignment_id: a.title for a in db.query(models.Assignment).filter(models.Assignment.assignment_id.in_(assignment_ids)).all()} if assignment_ids else {}
    for s in subs:
        subs_out.append(StudentSubmissionItem(
            submission_id=s.submission_id,
            assignment_id=s.assignment_id,
            assignment_title=assign_map.get(s.assignment_id, "Assignment"),
            submitted_at=s.submitted_at,
            status=s.status,
            grade=None,
        ))

    # enrollment count (active enrollments)
    enrollment_count = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.course_id == course_id,
        models.CourseEnrollment.status == "Active",
    ).count()

    return StudentCourseDetails(
        course_id=course.course_id,
        title=course.title,
        description=course.description,
        code=course.code,
        is_active=course.is_active,
        created_at=course.created_at,
        enrollment_count=enrollment_count,
        enrollment_status=enrollment.status,
        enrolled_at=enrollment.enrolled_at,
        attendance_total_lectures=total_lectures,
        attendance_present=counts.get("Present", 0),
        attendance_absent=counts.get("Absent", 0),
        attendance_late=counts.get("Late", 0),
        attendance_excused=counts.get("Excused", 0),
        attendance_percentage=round(percentage, 2),
        submissions=subs_out,
    )
# Course Enrollment Models for self-enrollment
class SelfEnrollmentCreate(BaseModel):
    course_id: int = Field(..., description="Course ID to enroll in")

# Course Enrollment Endpoints
@router.post(
    "/enrollments/self",
    response_model=CourseEnrollmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Self-enroll in course (student only)"
)
def self_enroll_in_course(
    enrollment_data: SelfEnrollmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Allow students to enroll themselves in a course"""
    
    # Only students can self-enroll
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can self-enroll in courses")
    
    # Get student record for current user
    print(f"[DEBUG] Self-enrollment: Looking for student with user_id: {current_user.id}")
    student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
    if not student:
        print(f"[DEBUG] Self-enrollment: No student record found for user_id: {current_user.id}, creating one...")
        # Create a Student record for this user
        student = models.Student(
            student_number=current_user.username,
            full_name=current_user.full_name or current_user.username,
            email=current_user.email,
            user_id=current_user.id,
            year_level="Fourth",  # Default year level
            status="Active",
            created_at=datetime.utcnow()
        )
        db.add(student)
        db.commit()
        db.refresh(student)
        print(f"[DEBUG] Self-enrollment: Created student record with student_id: {student.student_id}")
    
    print(f"[DEBUG] Self-enrollment: Found student_id: {student.student_id} for user_id: {current_user.id}")
    
    # Check if course exists
    course = db.query(models.Course).filter(models.Course.course_id == enrollment_data.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check if course is active
    if not course.is_active:
        raise HTTPException(status_code=400, detail="Course is not currently active for enrollment")
    
    # Check if already enrolled/requested
    existing_enrollment = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.course_id == enrollment_data.course_id,
        models.CourseEnrollment.student_id == student.student_id,
        models.CourseEnrollment.status.in_(["Active", "Pending"])  # block duplicates
    ).first()
    
    if existing_enrollment:
        raise HTTPException(status_code=400, detail="You already have an active or pending enrollment for this course")
    
    # Create enrollment
    try:
        print(f"[DEBUG] Self-enrollment: Creating enrollment for student_id: {student.student_id}, course_id: {enrollment_data.course_id}")
        enrollment = models.CourseEnrollment(
            course_id=enrollment_data.course_id,
            student_id=student.student_id,
            status="Pending",  # require instructor approval
            enrolled_at=datetime.utcnow()
        )
        
        db.add(enrollment)
        db.commit()
        db.refresh(enrollment)
        
        print(f"[DEBUG] Self-enrollment: Successfully created enrollment_id: {enrollment.enrollment_id}")
        print(f"[DEBUG] Self-enrollment: Course created_by: {course.created_by}")
        print(f"[DEBUG] Self-enrollment: Student user_id: {student.user_id}")
        
        return CourseEnrollmentResponse(
            enrollment_id=enrollment.enrollment_id,
            course_id=enrollment.course_id,
            student_id=enrollment.student_id,
            enrolled_at=enrollment.enrolled_at,
            status=enrollment.status,
            grade=enrollment.grade,
            notes=enrollment.notes,
            course_title=course.title,
            course_code=course.code,
            student_name=student.full_name,
        )
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to enroll in course")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post(
    "/enrollments",
    response_model=CourseEnrollmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enroll student in course (admin/doctor only)"
)
def enroll_student(
    enrollment_data: CourseEnrollmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Enroll a student in a course (admin/doctor functionality)"""
    
    # Only doctors and admins can enroll other students
    _require_instructor(current_user)
    
    # Check if course exists
    course = db.query(models.Course).filter(models.Course.course_id == enrollment_data.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check if student exists
    student = db.query(models.Student).filter(models.Student.student_id == enrollment_data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Check if already enrolled
    existing_enrollment = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.course_id == enrollment_data.course_id,
        models.CourseEnrollment.student_id == enrollment_data.student_id,
        models.CourseEnrollment.status == "Active"
    ).first()
    
    if existing_enrollment:
        raise HTTPException(status_code=400, detail="Student is already enrolled in this course")
    
    # Create enrollment
    try:
        enrollment = models.CourseEnrollment(
            course_id=enrollment_data.course_id,
            student_id=enrollment_data.student_id,
            status="Active",
            enrolled_at=datetime.utcnow()
        )
        
        db.add(enrollment)
        db.commit()
        db.refresh(enrollment)
        
        return CourseEnrollmentResponse(
            enrollment_id=enrollment.enrollment_id,
            course_id=enrollment.course_id,
            student_id=enrollment.student_id,
            enrolled_at=enrollment.enrolled_at,
            status=enrollment.status,
            grade=enrollment.grade,
            notes=enrollment.notes,
            course_title=course.title,
            course_code=course.code,
        )
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to enroll student")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get(
    "/enrollments/student/{student_id}",
    response_model=List[CourseEnrollmentResponse],
    summary="Get student's course enrollments"
)
def get_student_enrollments(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get all course enrollments for a student"""
    
    # Allow doctors/admins to view any student's enrollments
    # Allow students to view only their own enrollments
    if (current_user.role or "").lower() == "student":
        # Students can only view their own enrollments
        student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
        if not student or student.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif (current_user.role or "").lower() not in {"instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    
    print(f"[DEBUG] Looking for enrollments for student_id: {student_id}")
    enrollments = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.student_id == student_id
    ).all()
    
    print(f"[DEBUG] Found {len(enrollments)} enrollments for student_id {student_id}")
    for enrollment in enrollments:
        print(f"[DEBUG] Enrollment: {enrollment.enrollment_id}, course_id: {enrollment.course_id}, status: {enrollment.status}")
    
    result = []
    for enrollment in enrollments:
        # Get course details
        course = db.query(models.Course).filter(models.Course.course_id == enrollment.course_id).first()
        if not course:
            continue
            
        # Get student details
        student = db.query(models.Student).filter(models.Student.student_id == enrollment.student_id).first()
        if not student:
            continue
            
        result.append(CourseEnrollmentResponse(
            enrollment_id=enrollment.enrollment_id,
            course_id=enrollment.course_id,
            student_id=enrollment.student_id,
            enrolled_at=enrollment.enrolled_at,
            status=enrollment.status,
            grade=enrollment.grade,
            notes=enrollment.notes,
            course_title=course.title,
            course_code=course.code,
            student_name=student.full_name,
        ))
    
    return result


@router.get(
    "/enrollments/me",
    response_model=List[CourseEnrollmentResponse],
    summary="Get current student's course enrollments"
)
def get_my_enrollments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Allow a logged-in student to retrieve their own enrollments."""

    if (current_user.role or "").lower() != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can view their own enrollments via this endpoint"
        )

    student = db.query(models.Student).filter(models.Student.user_id == current_user.id).first()
    if not student:
        # Student profile not yet created – return empty list instead of error
        return []

    enrollments = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.student_id == student.student_id
    ).all()

    result = []
    for enrollment in enrollments:
        course = db.query(models.Course).filter(models.Course.course_id == enrollment.course_id).first()
        if not course:
            continue

        result.append(CourseEnrollmentResponse(
            enrollment_id=enrollment.enrollment_id,
            course_id=enrollment.course_id,
            student_id=enrollment.student_id,
            enrolled_at=enrollment.enrolled_at,
            status=enrollment.status,
            grade=enrollment.grade,
            notes=enrollment.notes,
            course_title=course.title,
            course_code=course.code,
            student_name=student.full_name,
        ))

    return result


@router.get(
    "/enrollments/course/{course_id}",
    response_model=List[CourseEnrollmentResponse],
    summary="Get course enrollments"
)
def get_course_enrollments(
    course_id: int,
    status: str = Query("Active", description="Filter by status: Active | Pending | Rejected | all"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get enrollments for a course.

    Defaults to returning only Active enrollments so that pending requests do not
    affect visible student counts. Pass status=all to return all statuses, or a
    specific status value to filter accordingly.
    """
    
    query = (
        db.query(models.CourseEnrollment, models.Student)
        .join(models.Student, models.CourseEnrollment.student_id == models.Student.student_id)
        .filter(models.CourseEnrollment.course_id == course_id)
    )

    # Apply status filter (default Active)
    if status.lower() != "all":
        query = query.filter(models.CourseEnrollment.status == status)

    enrollments = query.all()
    
    result = []
    for enrollment, student in enrollments:
        # Get course details
        course = db.query(models.Course).filter(models.Course.course_id == enrollment.course_id).first()
        if not course:
            continue
            
        result.append(CourseEnrollmentResponse(
            enrollment_id=enrollment.enrollment_id,
            course_id=enrollment.course_id,
            student_id=enrollment.student_id,
            enrolled_at=enrollment.enrolled_at,
            status=enrollment.status,
            grade=enrollment.grade,
            notes=enrollment.notes,
            course_title=course.title,
            course_code=course.code,
            student_name=student.full_name, # Added student name
        ))
    
    return result

@router.get(
    "/enrollments/pending",
    response_model=List[EnrollmentRequest],
    summary="List pending enrollment requests for my courses (instructor only)"
)
def list_pending_enrollment_requests(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    # Resolve instructor - create if doesn't exist
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instructor:
        print(f"[DEBUG] No instructor profile found for user_id: {current_user.id}, creating one...")
        instructor = models.Instructor(
            user_id=current_user.id,
            full_name=f"Prof. {current_user.username}",
            email=current_user.email,
            role="Instructor",
            department_id=1,
            created_at=datetime.utcnow()
        )
        db.add(instructor)
        db.commit()
        db.refresh(instructor)
        print(f"[DEBUG] Created instructor profile with ID: {instructor.instructor_id}")

    print(f"[DEBUG] Found instructor_id: {instructor.instructor_id} for user_id: {current_user.id}")

    # Debug: Check courses created by this instructor
    instructor_courses = db.query(models.Course).filter(models.Course.created_by == instructor.instructor_id).all()
    print(f"[DEBUG] Instructor {instructor.instructor_id} has {len(instructor_courses)} courses:")
    for course in instructor_courses:
        print(f"[DEBUG] Course: {course.course_id} - {course.title} (created_by: {course.created_by})")

    # Find pending enrollments on courses created by this instructor
    pending = (
        db.query(models.CourseEnrollment, models.Course, models.Student)
        .join(models.Course, models.Course.course_id == models.CourseEnrollment.course_id)
        .join(models.Student, models.Student.student_id == models.CourseEnrollment.student_id)
        .filter(models.Course.created_by == instructor.instructor_id)
        .filter(models.CourseEnrollment.status == "Pending")
        .order_by(models.CourseEnrollment.enrolled_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    print(f"[DEBUG] Found {len(pending)} pending enrollments for instructor {instructor.instructor_id}")
    
    # Debug: Check all pending enrollments regardless of instructor
    all_pending = db.query(models.CourseEnrollment).filter(models.CourseEnrollment.status == "Pending").all()
    print(f"[DEBUG] Total pending enrollments in database: {len(all_pending)}")
    for enr in all_pending:
        print(f"[DEBUG] Pending enrollment: course_id={enr.course_id}, student_id={enr.student_id}, status={enr.status}")

    result: List[EnrollmentRequest] = []
    for enr, course, student in pending:
        result.append(EnrollmentRequest(
            enrollment_id=enr.enrollment_id,
            course_id=course.course_id,
            course_title=course.title,
            course_code=course.code,
            student_id=student.student_id,
            student_name=student.full_name,
            requested_at=enr.enrolled_at,
            status=enr.status,
        ))

    return result


@router.post(
    "/enrollments/{enrollment_id}/approve",
    summary="Approve a pending enrollment (instructor only)"
)
def approve_enrollment_request(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    enrollment = db.query(models.CourseEnrollment).filter(models.CourseEnrollment.enrollment_id == enrollment_id).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Ensure the course belongs to the current instructor
    course = db.query(models.Course).filter(models.Course.course_id == enrollment.course_id).first()
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not course or not instructor or course.created_by != instructor.instructor_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    if enrollment.status != "Pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")

    enrollment.status = "Active"
    enrollment.enrolled_at = datetime.utcnow()
    try:
        db.commit()
        db.refresh(enrollment)
        return {"ok": True, "enrollment_id": enrollment.enrollment_id, "status": enrollment.status}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to approve enrollment")


@router.post(
    "/enrollments/{enrollment_id}/reject",
    summary="Reject a pending enrollment (instructor only)"
)
def reject_enrollment_request(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    enrollment = db.query(models.CourseEnrollment).filter(models.CourseEnrollment.enrollment_id == enrollment_id).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Ensure the course belongs to the current instructor
    course = db.query(models.Course).filter(models.Course.course_id == enrollment.course_id).first()
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not course or not instructor or course.created_by != instructor.instructor_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    if enrollment.status != "Pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")

    enrollment.status = "Rejected"
    try:
        db.commit()
        db.refresh(enrollment)
        return {"ok": True, "enrollment_id": enrollment.enrollment_id, "status": enrollment.status}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to reject enrollment")
