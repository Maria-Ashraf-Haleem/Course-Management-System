# routers/student_management.py
from __future__ import annotations

from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import io
import csv
import pandas as pd
from fastapi import UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse
try:
    import openpyxl  # for Excel fallback parsing
except Exception:
    openpyxl = None

# Import Excel workaround
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from excel_workaround import process_excel_with_workaround

from app.db import get_db
from app import models
from app.deps import get_current_active_user
from core.security import get_password_hash

router = APIRouter(prefix="/student-management", tags=["student-management"])

# ---- Pydantic models --------------------------------------------------------

class StudentCreate(BaseModel):
    student_number: str = Field(..., description="Unique student number")
    full_name: str = Field(..., description="Student's full name")
    email: Optional[str] = Field(None, description="Student's email address")
    phone: Optional[str] = Field(None, description="Student's phone number")
    password: Optional[str] = Field(None, description="Initial password for the student user account")
    year_level: str = Field("Fourth", description="Student's year level")
    status: str = Field("Active", description="Student status")
    graduation_year: Optional[int] = Field(None, description="Expected graduation year")
    notes: Optional[str] = Field(None, description="Additional notes")
    course_ids: List[int] = Field(..., description="List of course IDs to enroll the student in")

class StudentUpdate(BaseModel):
    student_number: Optional[str] = Field(None, description="Unique student number")
    full_name: Optional[str] = Field(None, description="Student's full name")
    email: Optional[str] = Field(None, description="Student's email address")
    phone: Optional[str] = Field(None, description="Student's phone number")
    year_level: Optional[str] = Field(None, description="Student's year level")
    status: Optional[str] = Field(None, description="Student status")
    graduation_year: Optional[int] = Field(None, description="Expected graduation year")
    notes: Optional[str] = Field(None, description="Additional notes")

class StudentResponse(BaseModel):
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
    course_name: Optional[str] = None
    course_id: Optional[int] = None

class BulkImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: List[str]
    total_processed: int

# ---- Helpers ----------------------------------------------------------------

def _require_instructor(user: models.User):
    if (user.role or "").lower() not in {"instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor or admin role required")

def _validate_year_level(year_level: str):
    valid_levels = {"First", "Second", "Third", "Fourth", "Fifth"}
    if year_level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid year level. Must be one of: {', '.join(valid_levels)}")

def _validate_status(status: str):
    valid_statuses = {"Active", "Inactive", "Graduated", "Suspended"}
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

# ---- Routes ----------------------------------------------------------------

@router.post(
    "/students",
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new student (instructor only)"
)
def create_student(
    student_data: StudentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    # Validate input
    _validate_year_level(student_data.year_level)
    _validate_status(student_data.status)
    
    # Check if student number already exists
    existing_student = db.query(models.Student).filter(
        models.Student.student_number == student_data.student_number
    ).first()
    
    if existing_student:
        # Idempotent behavior: if student exists, try to auto-link to a User with same username, then return existing
        try:
            if getattr(existing_student, "user_id", None) in (None, 0):
                user = db.query(models.User).filter(models.User.username == existing_student.student_number).first()
                if user:
                    existing_student.user_id = user.id
                    db.commit()
                    db.refresh(existing_student)
        except Exception:
            db.rollback()
        return StudentResponse(
            student_id=existing_student.student_id,
            student_number=existing_student.student_number,
            full_name=existing_student.full_name,
            email=existing_student.email,
            phone=existing_student.phone,
            year_level=existing_student.year_level,
            status=existing_student.status,
            graduation_year=existing_student.graduation_year,
            notes=existing_student.notes,
            created_at=existing_student.created_at
        )
    
    # Create new student
    try:
        # If a User already exists with username == student_number, link it on create
        linked_user_id = None
        try:
            candidate_user = db.query(models.User).filter(models.User.username == student_data.student_number).first()
            if candidate_user:
                linked_user_id = candidate_user.id
        except Exception:
            linked_user_id = None

        if not linked_user_id:
            # Create a new user if one doesn't exist for this student_number
            # Generate a default password if not provided
            default_password = student_data.password or "password"
            hashed_password = get_password_hash(default_password)

            new_user = models.User(
                username=student_data.student_number,
                email=student_data.email or f"{student_data.student_number}@example.com", # Use a dummy email if none provided
                full_name=student_data.full_name,
                password_hash=hashed_password,
                role="student",
                created_at=datetime.utcnow(),
            )
            db.add(new_user)
            db.flush()  # To get the new_user.id
            linked_user_id = new_user.id

        new_student = models.Student(
            student_number=student_data.student_number,
            full_name=student_data.full_name,
            email=student_data.email,
            phone=student_data.phone,
            year_level=student_data.year_level,
            status=student_data.status,
            graduation_year=student_data.graduation_year,
            notes=student_data.notes,
            created_at=datetime.utcnow(),
            user_id=linked_user_id
        )
        
        db.add(new_student)
        db.commit()
        db.refresh(new_student)
        
        # Enroll student in the specified courses
        enrollments = []
        for course_id in student_data.course_ids:
            # Check if course exists
            course = db.query(models.Course).filter(models.Course.course_id == course_id).first()
            if not course:
                db.rollback()
                raise HTTPException(status_code=400, detail=f"Course with ID {course_id} not found")
            
            # Check if already enrolled
            existing_enrollment = db.query(models.CourseEnrollment).filter(
                models.CourseEnrollment.course_id == course_id,
                models.CourseEnrollment.student_id == new_student.student_id,
                models.CourseEnrollment.status == "Active"
            ).first()
            
            if not existing_enrollment:
                enrollment = models.CourseEnrollment(
                    course_id=course_id,
                    student_id=new_student.student_id,
                    status="Active",  # Default status for new enrollments
                    enrolled_at=datetime.utcnow()
                )
                db.add(enrollment)
                enrollments.append(enrollment)
        
        db.commit()
        for enrollment in enrollments:
            db.refresh(enrollment)

        return StudentResponse(
            student_id=new_student.student_id,
            student_number=new_student.student_number,
            full_name=new_student.full_name,
            email=new_student.email,
            phone=new_student.phone,
            year_level=new_student.year_level,
            status=new_student.status,
            graduation_year=new_student.graduation_year,
            notes=new_student.notes,
            created_at=new_student.created_at
        )
        
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create student. Please check your input.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get(
    "/students",
    response_model=List[StudentResponse],
    summary="List all students (instructor only)"
)
def list_students(
    year_level: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)

    # Resolve current instructor
    instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
    if not instructor:
        return []

    # Students enrolled in instructor-owned courses
    query = (
        db.query(models.Student)
        .join(models.CourseEnrollment, models.CourseEnrollment.student_id == models.Student.student_id)
        .join(models.Course, models.Course.course_id == models.CourseEnrollment.course_id)
        .filter(models.Course.created_by == instructor.instructor_id)
    )

    # Apply filters
    if year_level:
        _validate_year_level(year_level)
        query = query.filter(models.Student.year_level == year_level)
    
    if status:
        _validate_status(status)
        query = query.filter(models.Student.status == status)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            models.Student.full_name.ilike(search_term) |
            models.Student.student_number.ilike(search_term) |
            models.Student.email.ilike(search_term)
        )

    # DISTINCT to avoid duplicates across multiple enrollments
    students = (
        query.distinct(models.Student.student_id)
        .order_by(models.Student.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    # Build response with course information
    result = []
    for student in students:
        # Get the student's primary course enrollment
        enrollment = db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.student_id == student.student_id,
            models.CourseEnrollment.status == "Active"
        ).first()
        
        course_name = None
        course_id = None
        if enrollment:
            course = db.query(models.Course).filter(
                models.Course.course_id == enrollment.course_id
            ).first()
            if course:
                course_name = course.title
                course_id = course.course_id
        
        result.append(StudentResponse(
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
            course_name=course_name,
            course_id=course_id
        ))
    
    return result

@router.get(
    "/students/{student_id}",
    response_model=StudentResponse,
    summary="Get student details by ID (instructor only)"
)
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    student = db.query(models.Student).filter(models.Student.student_id == student_id).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get the student's primary course enrollment
    enrollment = db.query(models.CourseEnrollment).filter(
        models.CourseEnrollment.student_id == student.student_id,
        models.CourseEnrollment.status == "Active"
    ).first()
    
    course_name = None
    course_id = None
    if enrollment:
        course = db.query(models.Course).filter(
            models.Course.course_id == enrollment.course_id
        ).first()
        if course:
            course_name = course.title
            course_id = course.course_id
    
    return StudentResponse(
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
        course_name=course_name,
        course_id=course_id
    )

@router.put(
    "/students/{student_id}",
    response_model=StudentResponse,
    summary="Update student information (instructor only)"
)
def update_student(
    student_id: int,
    student_data: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    student = db.query(models.Student).filter(models.Student.student_id == student_id).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Update only provided fields
    update_data = student_data.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        if field == "year_level" and value:
            _validate_year_level(value)
        elif field == "status" and value:
            _validate_status(value)
        setattr(student, field, value)
    
    try:
        db.commit()
        db.refresh(student)
        
        # Get the student's primary course enrollment
        enrollment = db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.student_id == student.student_id,
            models.CourseEnrollment.status == "Active"
        ).first()
        
        course_name = None
        course_id = None
        if enrollment:
            course = db.query(models.Course).filter(
                models.Course.course_id == enrollment.course_id
            ).first()
            if course:
                course_name = course.title
                course_id = course.course_id
        
        return StudentResponse(
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
            course_name=course_name,
            course_id=course_id
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Student number already exists")

@router.delete(
    "/students/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete student (instructor only)"
)
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    student = db.query(models.Student).filter(models.Student.student_id == student_id).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    try:
        # First delete all course enrollments for this student
        db.query(models.CourseEnrollment).filter(
            models.CourseEnrollment.student_id == student_id
        ).delete()
        
        # Then delete all submissions by this student
        db.query(models.Submission).filter(
            models.Submission.student_id == student_id
        ).delete()
        
        # Finally delete the student record
        db.delete(student)
        db.commit()
        return
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete student")

@router.delete(
    "/students-bulk-delete",
    summary="Delete all students visible to the instructor. Admin may delete all.",
)
def delete_all_students(
    scope: str = "mine",  # "mine" (default, only students under instructor courses) or "all" (admin only)
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Bulk delete students.

    - scope=mine (default): deletes students enrolled in courses created by the current instructor.
    - scope=all (admin only): deletes all students in the system.

    Deletes related course enrollments and submissions first, then students.
    """
    role = (current_user.role or "").lower()
    if scope == "all":
        if role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required for scope=all")
        student_ids_q = db.query(models.Student.student_id)
    else:
        # instructor-only scope: delete students from instructor-owned courses
        if role not in {"instructor", "doctor", "admin"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor or admin role required")
        instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        if not instructor:
            return {"deleted_students": 0, "deleted_enrollments": 0, "deleted_submissions": 0}
        student_ids_q = (
            db.query(models.Student.student_id)
            .join(models.CourseEnrollment, models.CourseEnrollment.student_id == models.Student.student_id)
            .join(models.Course, models.Course.course_id == models.CourseEnrollment.course_id)
            .filter(models.Course.created_by == instructor.instructor_id)
            .distinct()
        )

    try:
        ids = [row[0] for row in student_ids_q.all()]
        if not ids:
            return {"deleted_students": 0, "deleted_enrollments": 0, "deleted_submissions": 0}

        # Cascade delete in dependency order
        deleted_enrollments = (
            db.query(models.CourseEnrollment)
            .filter(models.CourseEnrollment.student_id.in_(ids))
            .delete(synchronize_session=False)
        )
        deleted_submissions = (
            db.query(models.Submission)
            .filter(models.Submission.student_id.in_(ids))
            .delete(synchronize_session=False)
        )
        deleted_students = (
            db.query(models.Student)
            .filter(models.Student.student_id.in_(ids))
            .delete(synchronize_session=False)
        )

        db.commit()
        return {
            "deleted_students": deleted_students,
            "deleted_enrollments": deleted_enrollments,
            "deleted_submissions": deleted_submissions,
        }
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to bulk delete students")

@router.post(
    "/students/bulk-import",
    response_model=BulkImportResponse,
    summary="Bulk import students from file (Excel, CSV, or TXT)"
)
async def bulk_import_students(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Bulk import students from Excel (.xlsx, .xls), CSV (.csv), or text (.txt) file.
    
    - full_name (required)
    - student_number (required)
    - email(Optional)
    - phone(Optional)
    - year_level (Optional)
    - status (Optional)
    - graduation_year (Optional)
    - notes (Optional)
    
    The first row should contain column headers matching the field names above.
    """
    _require_instructor(current_user)
    
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
        
    file_ext = file.filename.split('.')[-1].lower()
    if file_ext not in ['xlsx', 'xls', 'csv', 'txt']:
        raise HTTPException(
            status_code=400, 
            detail="Unsupported file type. Please upload an Excel (.xlsx, .xls), CSV (.csv), or text (.txt) file"
        )
    
    imported = 0
    skipped = 0
    errors = []
    total_processed = 0
    
    # Clear any existing transaction state
    try:
        db.rollback()
    except:
        pass
    
    try:
        # Read file content based on file type
        if file_ext in ['xlsx', 'xls']:
            try:
                # Read uploaded content once and reuse for multiple attempts
                excel_bytes = await file.read()
                if not excel_bytes:
                    raise HTTPException(status_code=400, detail="Empty Excel file")

                # Use workaround function to handle Excel processing
                records = process_excel_with_workaround(excel_bytes, file_ext)
                
                # Validate that we got records
                if not records:
                    raise HTTPException(status_code=400, detail="No data found in Excel file")
                
                print(f"DEBUG Excel: Successfully processed {len(records)} records")
                
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error reading Excel file: {str(e)}")
                
        elif file_ext == 'csv':
            try:
                # Read CSV file with encoding detection
                content = await file.read()
                
                # Try multiple encodings
                encodings_to_try = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'iso-8859-1']
                df = None
                
                for encoding in encodings_to_try:
                    try:
                        # Reset file position for each attempt
                        content_str = content.decode(encoding)
                        df = pd.read_csv(io.StringIO(content_str), dtype=str, keep_default_na=False)
                        break
                    except (UnicodeDecodeError, UnicodeError):
                        continue
                    except Exception as e:
                        # If it's not an encoding error, try next encoding
                        if 'codec' not in str(e).lower() and 'decode' not in str(e).lower():
                            raise e
                        continue
                
                if df is None:
                    raise HTTPException(status_code=400, detail="Could not decode CSV file. Please save your CSV file with UTF-8 encoding or try a different format.")
                
                # Check if first row contains headers or actual data
                column_names = [str(col).lower().strip() for col in df.columns]
                common_headers = ['full_name', 'student_number', 'email', 'phone', 'year_level', 'status', 'graduation_year', 'notes', 'name', 'number', 'student']
                has_valid_headers = any(header in common_headers for header in column_names)
                
                print(f"DEBUG CSV: Column names: {column_names}")
                print(f"DEBUG CSV: Has valid headers: {has_valid_headers}")
                
                if not has_valid_headers:
                    # First row is data, not headers - re-read without header row
                    print("DEBUG CSV: First row appears to be data, not headers. Re-reading without header row.")
                    # Find the encoding that worked
                    working_encoding = 'utf-8'
                    for encoding in encodings_to_try:
                        try:
                            content_str = content.decode(encoding)
                            working_encoding = encoding
                            break
                        except (UnicodeDecodeError, UnicodeError):
                            continue
                    
                    df = pd.read_csv(io.StringIO(content_str), dtype=str, keep_default_na=False, header=None)
                    # Assign proper column names based on position
                    expected_columns = ['full_name', 'student_number', 'email', 'phone', 'year_level', 'status', 'graduation_year', 'notes']
                    df.columns = expected_columns[:len(df.columns)]
                
                # Convert to list of dictionaries
                records = df.to_dict('records')
                print(f"DEBUG CSV: Excel/CSV processing - found {len(records)} records")
                if records:
                    print(f"DEBUG CSV: First record keys: {list(records[0].keys())}")
                    print(f"DEBUG CSV: First record values: {list(records[0].values())}")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error reading CSV file: {str(e)}")
                
        else:  # txt file
            try:
                # Read text file with encoding detection
                raw_content = await file.read()
                
                # Try multiple encodings
                encodings_to_try = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'iso-8859-1']
                content = None
                
                for encoding in encodings_to_try:
                    try:
                        content = raw_content.decode(encoding)
                        break
                    except (UnicodeDecodeError, UnicodeError):
                        continue
                
                if content is None:
                    raise HTTPException(status_code=400, detail="Could not decode text file. Please save your file with UTF-8 encoding.")
                
                lines = [line.strip() for line in content.split('\n') if line.strip() and not line.startswith('#')]
                
                if not lines:
                    raise HTTPException(status_code=400, detail="File is empty")
                    
                # Check if first line is header
                first_line_parts = lines[0].split('\t') if '\t' in lines[0] else lines[0].split(',')
                headers = [h.strip().lower() for h in first_line_parts if h.strip()]
                
                # More flexible header detection - check if any common header names are present
                common_headers = ['full_name', 'student_number', 'email', 'phone', 'year_level', 'status', 'graduation_year', 'notes', 'name', 'number', 'student']
                is_header_line = any(h in common_headers for h in headers)
                
                print(f"DEBUG CSV: First line parts: {first_line_parts}")
                print(f"DEBUG CSV: Detected headers: {headers}")
                print(f"DEBUG CSV: Is header line: {is_header_line}")
                
                if not is_header_line:
                    # If not a header line, assume it's data and use positional mapping
                    headers = ['full_name', 'student_number']  # Default headers for positional mapping
                    print("DEBUG CSV: Using positional mapping - no headers detected")
                else:
                    lines = lines[1:]  # Remove header line
                    print(f"DEBUG CSV: Skipped header line, processing {len(lines)} data rows")
                
                records = []
                for line in lines:
                    parts = line.split('\t') if '\t' in line else line.split(',')
                    record = {}
                    for i, header in enumerate(headers):
                        if i < len(parts):
                            record[header] = parts[i].strip()
                        else:
                            record[header] = ''
                    records.append(record)
                    
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error reading text file: {str(e)}")
        
        # Process each record
        for idx, record in enumerate(records, 1):
            total_processed += 1
            
            try:
                # Get values from record, handling case sensitivity in column names
                record_lower = {k.lower(): v for k, v in record.items()}
                
                full_name = record_lower.get('full_name', '').strip()
                student_number = record_lower.get('student_number', '').strip()
                email = record_lower.get('email', '').strip() or None
                phone = record_lower.get('phone', '').strip() or None
                year_level = record_lower.get('year_level', 'Fourth').strip() or 'Fourth'
                status = record_lower.get('status', 'Active').strip() or 'Active'
                
                # Parse graduation year
                graduation_year = None
                if 'graduation_year' in record_lower and record_lower['graduation_year'].strip():
                    try:
                        graduation_year = int(record_lower['graduation_year'].strip())
                    except ValueError:
                        errors.append(f"Row {idx}: Invalid graduation year '{record_lower['graduation_year']}'")
                        continue
                        
                notes = record_lower.get('notes', '').strip() or None
                
                # Get course_id(s) from CSV: allow comma/semicolon separated list (e.g., "1,2; 3")
                course_ids: List[int] = []
                if 'course_id' in record_lower and record_lower['course_id'].strip():
                    raw_ids = record_lower['course_id']
                    # Split by comma or semicolon
                    parts = [p.strip() for p in raw_ids.replace(';', ',').split(',') if p and p.strip()]
                    invalid_tokens: List[str] = []
                    for p in parts:
                        try:
                            n = int(p)
                            if n not in course_ids:
                                course_ids.append(n)
                        except ValueError:
                            invalid_tokens.append(p)
                    if invalid_tokens:
                        errors.append(f"Row {idx}: Skipped invalid course_id values: {', '.join(invalid_tokens)}")
                
                # Validate required fields
                if not full_name:
                    errors.append(f"Row {idx}: Missing required field 'full_name'")
                    continue
                    
                if not student_number:
                    errors.append(f"Row {idx}: Missing required field 'student_number'")
                    continue
                
                # Validate year level and status
                try:
                    _validate_year_level(year_level)
                    _validate_status(status)
                except HTTPException as e:
                    errors.append(f"Row {idx}: {e.detail}")
                    continue
                
                # Check if student already exists
                existing_student = db.query(models.Student).filter(
                    models.Student.student_number == student_number
                ).first()
                
                if existing_student:
                    skipped += 1
                    continue
                
                # Create or link to user account
                linked_user_id = None
                password_from_csv = record_lower.get('password', '').strip()
                
                # Try to find existing user first
                try:
                    candidate_user = db.query(models.User).filter(
                        models.User.username == student_number
                    ).first()
                    if candidate_user:
                        linked_user_id = candidate_user.id
                except Exception:
                    pass
                
                # If no existing user and password provided, create new user account
                if not linked_user_id and password_from_csv:
                    try:
                        from core.security import get_password_hash
                        
                        # Check if email already exists and generate unique email if needed
                        user_email = email or f"{student_number}@temp.com"
                        existing_email_user = db.query(models.User).filter(
                            models.User.email == user_email
                        ).first()
                        
                        if existing_email_user:
                            # Generate unique email by appending student number
                            user_email = f"{student_number}@temp.com"
                            # If that still exists, add a timestamp
                            if db.query(models.User).filter(models.User.email == user_email).first():
                                import time
                                user_email = f"{student_number}_{int(time.time())}@temp.com"
                        
                        new_user = models.User(
                            username=student_number,
                            email=user_email,
                            full_name=full_name,
                            password_hash=get_password_hash(password_from_csv),
                            role="student"
                        )
                        db.add(new_user)
                        db.flush()  # Get the user ID
                        linked_user_id = new_user.id
                    except Exception as e:
                        db.rollback()  # Rollback on error
                        errors.append(f"Row {idx}: Failed to create user account: {str(e)}")
                        continue
                
                # Create new student
                new_student = models.Student(
                    student_number=student_number,
                    full_name=full_name,
                    email=email,
                    phone=phone,
                    year_level=year_level,
                    status=status,
                    graduation_year=graduation_year,
                    notes=notes,
                    created_at=datetime.utcnow(),
                    user_id=linked_user_id
                )
                
                db.add(new_student)
                db.flush()  # Get the student_id
                
                # Enroll student in provided courses (if any)
                if course_ids:
                    for cid in course_ids:
                        course = db.query(models.Course).filter(
                            models.Course.course_id == cid
                        ).first()
                        if course:
                            enrollment = models.CourseEnrollment(
                                course_id=cid,
                                student_id=new_student.student_id,
                                status="Active",
                                enrolled_at=datetime.utcnow()
                            )
                            db.add(enrollment)
                        else:
                            errors.append(f"Row {idx}: Course with ID {cid} not found")
                
                imported += 1
                
            except Exception as e:
                errors.append(f"Row {idx}: {str(e)}")
                continue
        
        # Commit all changes
        if imported > 0:
            db.commit()
        
        return BulkImportResponse(
            imported=imported,
            skipped=skipped,
            errors=errors[:10],  # Limit errors to first 10
            total_processed=total_processed
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to process file: {str(e)}"
        )
    finally:
        file.file.close()
