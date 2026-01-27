from __future__ import annotations

import typing
from typing import Optional, Union, Dict, Any, Set
from datetime import datetime

# For Python 3.9+ compatibility
if hasattr(typing, "get_args") and hasattr(typing, "get_origin"):
    from typing import get_args as typing_get_args
    from typing import get_origin as typing_get_origin
else:

    def typing_get_args(tp):
        return getattr(tp, "__args__", ()) if hasattr(tp, "__args__") else ()

    def typing_get_origin(tp):
        return getattr(tp, "__origin__", None)


# Define List type for different Python versions
if hasattr(typing, "List"):
    List = typing.List
else:
    List = list

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, or_
import httpx
import base64
import PyPDF2
import io
import os
import time
import math
import re
import random
from pathlib import Path
from datetime import datetime

from app.db import get_db
from app import models
from app.deps import get_current_active_user
from app.schemas.assignment import (
    AssignmentCreate,
    AssignmentRead,
    AssignmentUpdate,
    AssignmentSummary,
)


router = APIRouter(prefix="/assignments", tags=["assignments"])


# Health check endpoint
@router.get("/_ping")
def _ping():
    return {"ok": True}


async def check_ollama_available() -> bool:
    """
    Check if Ollama service is available and running.
    Returns True if available, False otherwise.
    """
    # Use the tags endpoint which is lightweight and doesn't require a model
    ollama_url = "http://localhost:11434/api/tags"
    
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(3.0, connect=2.0)) as client:
            response = await client.get(ollama_url)
            # If we get any response (even 404), Ollama is running
            return response.status_code < 500
    except httpx.ConnectError:
        return False
    except Exception:
        # Any other exception means Ollama is not accessible
        return False


async def generate_questions_from_pdf(
    pdf: UploadFile,
    num_questions: int,
    question_types: str,
    include_answers: bool,
    current_user: models.User,
) -> Dict[str, Any]:
    """
    Main function to generate questions from a PDF file.
    
    This function:
    1. Extracts text from the PDF
    2. Cleans and chunks the text
    3. Generates questions based on the requested types
    4. Returns the generated questions
    """
    import asyncio
    
    print(f"[AI Generator] Starting question generation from PDF")
    print(f"[AI Generator] Parameters: num_questions={num_questions}, question_types={question_types}, include_answers={include_answers}")
    
    # Check if Ollama is available before processing PDF
    print("[AI Generator] Checking if Ollama service is available...")
    ollama_available = await check_ollama_available()
    if not ollama_available:
        error_message = (
            "Ollama service is not available. Please ensure Ollama is running. "
            "To start Ollama: 1) Install Ollama from https://ollama.ai, "
            "2) Run 'ollama serve' in a terminal, "
            "3) Make sure the model 'gemma3n:e2b' is installed: 'ollama pull gemma3n:e2b'"
        )
        print(f"[AI Generator] Ollama not available. Error: {error_message}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=error_message
        )
    print("[AI Generator] Ollama service is available")
    
    try:
        # 1. Read and extract text from PDF
        print("[AI Generator] Reading PDF file...")
        pdf_content = await pdf.read()
        pdf_file = io.BytesIO(pdf_content)
        
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        text_content = ""
        
        for page_num, page in enumerate(pdf_reader.pages):
            text_content += page.extract_text() + "\n"
            if (page_num + 1) % 10 == 0:
                print(f"[AI Generator] Processed {page_num + 1} pages...")
        
        print(f"[AI Generator] Extracted {len(text_content)} characters from PDF")
        
        if not text_content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract text from PDF. Please ensure the PDF contains readable text."
            )
        
        # 2. Clean the text
        print("[AI Generator] Cleaning text...")
        cleaned_text = clean_text(text_content)
        print(f"[AI Generator] Cleaned text length: {len(cleaned_text)} characters")
        
        # 3. Chunk the text
        print("[AI Generator] Chunking text...")
        chunks = chunk_text(cleaned_text, chunk_size=1500, overlap=150)
        print(f"[AI Generator] Created {len(chunks)} chunks")
        
        # 4. Parse question types
        requested_types = [qtype.strip().lower() for qtype in question_types.split(",")]
        print(f"[AI Generator] Requested question types: {requested_types}")
        
        # Normalize question type names
        type_mapping = {
            "mcq": "mcq",
            "multiplechoice": "mcq",
            "truefalse": "truefalse",
            "trueFalse": "truefalse",  # Handle camelCase from frontend
            "true/false": "truefalse",
            "tf": "truefalse",
            "shortanswer": "shortanswer",
            "shortAnswer": "shortanswer",  # Handle camelCase from frontend
            "short": "shortanswer",
            "sa": "shortanswer"
        }
        
        normalized_types = []
        for qtype in requested_types:
            normalized = type_mapping.get(qtype, qtype)
            if normalized not in normalized_types:
                normalized_types.append(normalized)
        
        if not normalized_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid question types specified. Use: mcq, trueFalse, shortAnswer"
            )
        
        # 5. Calculate questions per type
        questions_per_type = max(1, num_questions // len(normalized_types))
        remaining = num_questions % len(normalized_types)
        
        print(f"[AI Generator] Generating {questions_per_type} questions per type (with {remaining} extra)")
        
        # 6. Retrieve relevant chunks for question generation
        query = "Generate questions about the main topics and key concepts"
        relevant_chunks = await retrieve_relevant_chunks(chunks, query, top_k=min(3, len(chunks)))
        
        if not relevant_chunks:
            relevant_chunks = chunks[:3] if len(chunks) >= 3 else chunks
        
        # Combine relevant chunks for context
        context_text = "\n\n".join(relevant_chunks)
        print(f"[AI Generator] Using {len(relevant_chunks)} relevant chunks ({len(context_text)} characters)")
        
        # 7. Generate questions for each type
        all_questions = []
        previous_questions: Set[str] = set()
        connection_errors = []
        
        for q_type in normalized_types:
            questions_to_generate = questions_per_type
            if remaining > 0:
                questions_to_generate += 1
                remaining -= 1
            
            print(f"[AI Generator] Generating {questions_to_generate} {q_type} questions...")
            
            try:
                batch_questions = await generate_question_batch(
                    chunk=context_text,
                    q_type=q_type,
                    num_questions=questions_to_generate,
                    previous_questions=previous_questions,
                    include_answers=include_answers,
                    timeout=120
                )
                
                # Add to previous questions to avoid duplicates
                for q in batch_questions:
                    previous_questions.add(q[:100])  # Use first 100 chars as identifier
                
                all_questions.extend(batch_questions)
                print(f"[AI Generator] Generated {len(batch_questions)} {q_type} questions")
                
            except httpx.ConnectError as e:
                error_msg = f"Cannot connect to Ollama service: {str(e)}"
                print(f"[AI Generator] {error_msg}")
                connection_errors.append(error_msg)
                # Continue with other question types even if one fails
                continue
            except Exception as e:
                print(f"[AI Generator] Error generating {q_type} questions: {str(e)}")
                # Continue with other question types even if one fails
                continue
        
        # 8. Format and return results
        if not all_questions:
            # Check if we had connection errors
            if connection_errors:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "Failed to generate questions: Cannot connect to Ollama service.\n\n"
                        "Please ensure:\n"
                        "1. Ollama is running (run 'ollama serve' in a terminal)\n"
                        "2. The model 'gemma3n:e2b' is installed (run 'ollama pull gemma3n:e2b')\n"
                        "3. Ollama is accessible at http://localhost:11434"
                    )
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=(
                        "Failed to generate any questions. This could be due to:\n"
                        "1. The model 'gemma3n:e2b' is not installed (run 'ollama pull gemma3n:e2b')\n"
                        "2. The PDF content was not suitable for question generation\n"
                        "3. A timeout occurred during generation"
                    )
                )
        
        # Combine all questions into a formatted string
        questions_text = "\n\n".join([f"{i+1}. {q}" for i, q in enumerate(all_questions)])
        
        print(f"[AI Generator] Successfully generated {len(all_questions)} total questions")
        
        return {
            "questions": questions_text,
            "count": len(all_questions),
            "types": normalized_types,
            "include_answers": include_answers
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AI Generator] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate questions from PDF: {str(e)}"
        )


@router.post("/ai/generate-questions")
async def ai_generate_questions(
    pdf: UploadFile = File(...),
    num_questions: int = Query(10, ge=1, le=50),
    question_types: str = Query("mcq,trueFalse,shortAnswer"),
    include_answers: bool = Query(False, description="Include answers in generated questions"),  # ADD THIS
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Generate questions from a PDF using AI.

    This endpoint processes a PDF file and generates different types of questions
    based on its content.
    """
    # This function is just a wrapper around generate_questions_from_pdf
    return await generate_questions_from_pdf(
        pdf=pdf, num_questions=num_questions, question_types=question_types, include_answers=include_answers, current_user=current_user  # ADD THIS
    )


def _to_read(row: models.Assignment) -> AssignmentRead:
    """Convert database model to response schema."""
    return AssignmentRead(
        assignment_id=row.assignment_id,
        title=row.title,
        description=row.description,
        deadline=row.deadline,
        course_id=row.course_id,  # New field
        max_grade=row.max_grade,
        # Removed type_id, department_id, max_file_size_mb, instructions, is_active, created_at, updated_at
        # Removed type_name, department_name, submissions_count
    )


def _to_summary(row: models.Assignment) -> AssignmentSummary:
    """Convert database model to summary schema."""
    return AssignmentSummary(
        assignment_id=row.assignment_id,
        title=row.title,
        deadline=row.deadline,
        course_id=row.course_id,  # New field
        is_active=row.is_active,
        submissions_count=len(row.submissions) if row.submissions else 0,
    )


def _validate_assignment_exists(assignment_id: int, db: Session, include_inactive: bool = False) -> models.Assignment:
    """Validate that assignment exists and return it."""
    if assignment_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignment ID must be positive")

    query = (
        db.query(models.Assignment)
        .options(
            # Removed joinedload for assignment_type and department
            joinedload(models.Assignment.submissions)
        )
        .filter(models.Assignment.assignment_id == assignment_id)
    )

    if not include_inactive:
        query = query.filter(models.Assignment.is_active == True)

    assignment = query.first()

    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    return assignment


@router.get("", response_model=List[AssignmentSummary])
def list_assignments(
    include_inactive: bool = Query(False, description="Include inactive assignments"),
    course_id: Optional[int] = Query(None, description="Filter by course ID"),  # New filter
    search: Optional[str] = Query(None, description="Search in title and description"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List assignments with optional filtering and pagination."""
    try:
        # Resolve current instructor
        instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        if not instructor:
            return []

        query = (
            db.query(models.Assignment)
            .options(
                # Removed joinedload for assignment_type and department
                joinedload(models.Assignment.submissions)
            )
            .filter(
                # Assignments created by this instructor OR whose course belongs to this instructor
                (models.Assignment.created_by == instructor.instructor_id)
                | (models.Assignment.course_id.in_(db.query(models.Course.course_id).filter(models.Course.created_by == instructor.instructor_id)))
            )
        )

        # Apply filters
        if not include_inactive:
            query = query.filter(models.Assignment.is_active == True)

        if course_id:
            query = query.filter(models.Assignment.course_id == course_id)

        if search:
            search_term = f"%{search.strip()}%"
            query = query.filter(or_(models.Assignment.title.ilike(search_term), models.Assignment.description.ilike(search_term)))

        # Apply pagination and ordering
        rows = query.order_by(models.Assignment.deadline.asc()).offset(offset).limit(limit).all()

        return [_to_summary(r) for r in rows]

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve assignments")


@router.get("/{assignment_id}", response_model=AssignmentRead)
def get_assignment(
    assignment_id: int,
    include_inactive: bool = Query(False, description="Include inactive assignments"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get a specific assignment by ID."""
    assignment = _validate_assignment_exists(assignment_id, db, include_inactive)
    return _to_read(assignment)


@router.post("", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    course_id: int = Form(...),
    deadline: str = Form(...),
    max_grade: float = Form(100.0),
    pdf_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Create a new assignment with optional PDF attachment."""
    try:
        # 1) Resolve instructor -> created_by (required by DB)
        instructor = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        if not instructor:
            raise HTTPException(status_code=400, detail="Instructor profile not found for current user")

        # 2) Prevent duplicate title within the same course
        existing = (
            db.query(models.Assignment)
            .filter(
                models.Assignment.title == title.strip(),
                models.Assignment.course_id == course_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Assignment with this title already exists in this course",
            )

        # 3) Handle PDF file upload if provided
        attachment_file_path = None
        attachment_file_name = None
        if pdf_file:
            # Validate file type
            if pdf_file.content_type != "application/pdf":
                raise HTTPException(status_code=400, detail="Only PDF files are allowed")

            # Create uploads directory for assignments
            upload_dir = Path("uploads/assignments")
            upload_dir.mkdir(parents=True, exist_ok=True)

            # Generate unique filename
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            safe_filename = "".join(c for c in pdf_file.filename if c.isalnum() or c in "._- ") if pdf_file.filename else "assignment.pdf"
            unique_filename = f"{timestamp}_{safe_filename}"
            file_path = upload_dir / unique_filename

            # Save file
            content = await pdf_file.read()
            with open(file_path, "wb") as f:
                f.write(content)

            attachment_file_path = str(file_path)
            attachment_file_name = pdf_file.filename

        # 4) Parse deadline
        deadline_date = datetime.fromisoformat(deadline.replace("Z", "+00:00"))

        # 5) Create row
        assignment = models.Assignment(
            title=title.strip(),
            description=description,
            deadline=deadline_date,
            course_id=course_id,
            max_grade=max_grade or 100.0,
            created_by=instructor.instructor_id,
            attachment_file_path=attachment_file_path,
            attachment_file_name=attachment_file_name,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        db.add(assignment)
        db.commit()
        db.refresh(assignment)

        # 6) Return hydrated object
        assignment = _validate_assignment_exists(assignment.assignment_id, db, include_inactive=True)
        return _to_read(assignment)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Assignment with this title already exists in this department")
    except Exception as e:
        db.rollback()
        print(f"Error creating assignment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create assignment: {str(e)}")


@router.get("/{assignment_id}/pdf")
async def download_assignment_pdf(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Download the PDF attachment for an assignment."""
    from fastapi.responses import FileResponse

    assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)

    file_path = Path(assignment.attachment_file_path) if assignment.attachment_file_path else None

    if file_path and file_path.exists():
        filename = assignment.attachment_file_name or f"assignment_{assignment_id}.pdf"
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type="application/pdf",
        )

    # Fallback: dynamically generate a PDF if no attachment exists
    try:
        from io import BytesIO
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import inch
        from fastapi.responses import Response

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        title = assignment.title or f"Assignment {assignment.assignment_id}"
        description = assignment.description or "No description provided."
        instructions = assignment.instructions or ""
        deadline = assignment.deadline.isoformat() if assignment.deadline else "No deadline specified"
        max_grade = assignment.max_grade or 100

        y = height - inch
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(inch, y, title[:90])
        y -= 0.4 * inch

        pdf.setFont("Helvetica", 11)
        pdf.drawString(inch, y, f"Assignment ID: {assignment.assignment_id}")
        y -= 0.25 * inch
        pdf.drawString(inch, y, f"Course ID: {assignment.course_id}")
        y -= 0.25 * inch
        pdf.drawString(inch, y, f"Deadline: {deadline}")
        y -= 0.25 * inch
        pdf.drawString(inch, y, f"Max Grade: {max_grade}")
        y -= 0.35 * inch

        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(inch, y, "Description:")
        y -= 0.25 * inch

        pdf.setFont("Helvetica", 11)
        for line in description.splitlines():
            pdf.drawString(inch, y, line[:95])
            y -= 0.2 * inch
            if y < inch:
                pdf.showPage()
                y = height - inch

        if instructions.strip():
            y -= 0.3 * inch
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(inch, y, "Instructions:")
            y -= 0.25 * inch
            pdf.setFont("Helvetica", 11)
            for line in instructions.splitlines():
                pdf.drawString(inch, y, line[:95])
                y -= 0.2 * inch
                if y < inch:
                    pdf.showPage()
                    y = height - inch

        pdf.showPage()
        pdf.save()
        buffer.seek(0)

        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{title.replace(" ", "_")}.pdf"'},
        )

    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No PDF available for this assignment and PDF generation tools are missing."
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate fallback PDF: {str(e)}")


@router.put("/{assignment_id}", response_model=AssignmentRead)
def update_assignment(
    assignment_id: int,
    assignment_data: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Update an existing assignment."""
    try:
        assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)

        # Validate foreign keys if they're being updated
        if assignment_data.type_id or assignment_data.department_id:
            type_id = assignment_data.type_id or assignment.type_id
            department_id = assignment_data.department_id or assignment.department_id
            # This function is being removed, so we'll just check if the IDs are valid
            # and raise an error if they are not.
            assignment_type = (
                db.query(models.AssignmentType).filter(models.AssignmentType.type_id == type_id, models.AssignmentType.is_active == True).first()
            )
            if not assignment_type:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or inactive assignment type")

            department = (
                db.query(models.Department).filter(models.Department.department_id == department_id, models.Department.is_active == True).first()
            )
            if not department:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or inactive department")

        # Check if new title conflicts with existing (if title is being updated)
        if assignment_data.title and assignment_data.title != assignment.title:
            department_id = assignment_data.department_id or assignment.department_id
            existing = (
                db.query(models.Assignment)
                .filter(
                    models.Assignment.title == assignment_data.title,
                    models.Assignment.department_id == department_id,
                    models.Assignment.assignment_id != assignment_id,
                )
                .first()
            )

            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignment with this title already exists in this department")

        # Update fields that are provided
        update_data = assignment_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(assignment, field, value)

        assignment.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(assignment)

        # Reload with relationships
        assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)
        return _to_read(assignment)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignment with this title already exists in this department")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update assignment")


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: int,
    soft_delete: bool = Query(True, description="Use soft delete (deactivate) instead of hard delete"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Delete or deactivate an assignment."""
    try:
        assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)

        # Check if assignment has submissions
        submissions_count = len(assignment.submissions)

        if submissions_count > 0 and not soft_delete:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete assignment: {submissions_count} submissions exist. Use soft delete instead.",
            )

        if soft_delete:
            # Soft delete - just deactivate
            assignment.is_active = False
            assignment.updated_at = datetime.utcnow()
            db.commit()
        else:
            # Hard delete - only if no submissions exist
            db.delete(assignment)
            db.commit()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete assignment")


@router.patch("/{assignment_id}/activate", response_model=AssignmentRead)
def activate_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Activate a deactivated assignment."""
    try:
        assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)

        if assignment.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignment is already active")

        # Check if deadline is still in the future
        if assignment.deadline <= datetime.utcnow():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot activate assignment with past deadline")

        assignment.is_active = True
        assignment.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(assignment)

        # Reload with relationships
        assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)
        return _to_read(assignment)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to activate assignment")


@router.patch("/{assignment_id}/deactivate", response_model=AssignmentRead)
def deactivate_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Deactivate an assignment."""
    try:
        assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)

        if not assignment.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignment is already inactive")

        assignment.is_active = False
        assignment.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(assignment)

        # Reload with relationships
        assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)
        return _to_read(assignment)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deactivate assignment")


@router.get("/{assignment_id}/submissions-count")
def get_submissions_count(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get the count of submissions for this assignment."""
    try:
        assignment = _validate_assignment_exists(assignment_id, db, include_inactive=True)

        count = db.query(models.Submission).filter(models.Submission.assignment_id == assignment_id).count()

        return {
            "assignment_id": assignment_id,
            "assignment_title": assignment.title,
            "submissions_count": count,
            "deadline": assignment.deadline.isoformat(),
            "is_active": assignment.is_active,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get submissions count")


@router.get("/department/{department_id}", response_model=List[AssignmentSummary])
def list_assignments_by_department(
    department_id: int,
    include_inactive: bool = Query(False, description="Include inactive assignments"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List assignments for a specific department."""
    try:
        if department_id <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department ID must be positive")

        # Validate department exists
        department = db.query(models.Department).filter(models.Department.department_id == department_id).first()

        if not department:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

        query = (
            db.query(models.Assignment)
            .options(
                joinedload(models.Assignment.assignment_type), joinedload(models.Assignment.department), joinedload(models.Assignment.submissions)
            )
            .filter(models.Assignment.department_id == department_id)
        )

        if not include_inactive:
            query = query.filter(models.Assignment.is_active == True)

        rows = query.order_by(models.Assignment.deadline.asc()).offset(offset).limit(limit).all()

        return [_to_summary(r) for r in rows]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve assignments for department")


@router.get("/upcoming", response_model=List[AssignmentSummary])
def list_upcoming_assignments(
    days_ahead: int = Query(7, ge=1, le=365, description="Number of days to look ahead"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List upcoming assignments within the specified time frame."""
    try:
        from datetime import timedelta

        now = datetime.utcnow()
        future_date = now + timedelta(days=days_ahead)

        rows = (
            db.query(models.Assignment)
            .options(
                joinedload(models.Assignment.assignment_type), joinedload(models.Assignment.department), joinedload(models.Assignment.submissions)
            )
            .filter(and_(models.Assignment.is_active == True, models.Assignment.deadline > now, models.Assignment.deadline <= future_date))
            .order_by(models.Assignment.deadline.asc())
            .limit(limit)
            .all()
        )

        return [_to_summary(r) for r in rows]

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve upcoming assignments")


@router.post("/ai/generate-questions-pdf")
async def generate_questions_pdf(
    questions_text: str = Form(...),
    assignment_title: str = Form("Assignment Questions"),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Generate a PDF file from generated questions text
    """
    import logging

    logger = logging.getLogger(__name__)

    print(f"[PDF Generation] ===== ENDPOINT CALLED =====")
    print(f"[PDF Generation] Starting PDF generation for: {assignment_title}")
    print(f"[PDF Generation] Questions text length: {len(questions_text)}")
    print(f"[PDF Generation] Questions preview: {questions_text[:200]}...")

    try:
        logger.info(f"[PDF Generation] Starting PDF generation for: {assignment_title}")
        logger.info(f"[PDF Generation] Questions text length: {len(questions_text)}")

        from reportlab.lib.pagesizes import letter, A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import inch
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.enums import TA_LEFT
        from io import BytesIO

        logger.info("[PDF Generation] Reportlab imported successfully")

        # Create PDF in memory
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch)

        # Container for the 'Flowable' objects
        elements = []

        # Define styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("CustomTitle", parent=styles["Heading1"], fontSize=16, textColor="#1a1a1a", spaceAfter=30, alignment=TA_LEFT)
        body_style = ParagraphStyle(
            "CustomBody", parent=styles["BodyText"], fontSize=11, textColor="#333333", spaceAfter=12, alignment=TA_LEFT, leading=14
        )

        # Add title
        elements.append(Paragraph(assignment_title, title_style))
        elements.append(Spacer(1, 0.2 * inch))

        # Add questions (split by lines and format)
        lines = questions_text.split("\n")
        line_count = 0
        for line in lines:
            line = line.strip()
            if line:
                # Escape HTML special characters
                line = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                elements.append(Paragraph(line, body_style))
                elements.append(Spacer(1, 0.1 * inch))
                line_count += 1

        logger.info(f"[PDF Generation] Added {line_count} lines to PDF")

        # Build PDF
        logger.info("[PDF Generation] Building PDF...")
        doc.build(elements)
        buffer.seek(0)
        pdf_content = buffer.getvalue()
        pdf_size = len(pdf_content)

        logger.info(f"[PDF Generation] PDF built successfully. Size: {pdf_size} bytes")

        # Return PDF as response
        from fastapi.responses import Response

        response = Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{assignment_title.replace(" ", "_")}_Questions.pdf"',
                "Content-Length": str(pdf_size),
            },
        )
        logger.info("[PDF Generation] Response prepared, returning PDF")
        print(f"[PDF Generation] ===== RETURNING PDF =====")
        print(f"[PDF Generation] PDF size: {pdf_size} bytes")
        print(f"[PDF Generation] Content-Type: application/pdf")
        return response

    except ImportError as e:
        logger.error(f"[PDF Generation] ImportError: {str(e)}")
        # Fallback: return questions as text file if reportlab not available
        from fastapi.responses import Response

        return Response(
            content=questions_text,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{assignment_title.replace(" ", "_")}_Questions.txt"'},
        )
    except Exception as e:
        logger.error(f"[PDF Generation] Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate PDF: {str(e)}")


def clean_text(text: str) -> str:
    """Clean PDF text by removing page numbers, headers, footers, and extra whitespace."""
    import re

    # Remove common page number patterns
    text = re.sub(r"\n\s*\d+\s*\n", "\n", text)  # Standalone page numbers
    text = re.sub(r"^\d+$", "", text, flags=re.MULTILINE)  # Lines with only numbers
    # Remove excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)  # More than 2 newlines
    text = re.sub(r" {2,}", " ", text)  # Multiple spaces
    return text.strip()


def chunk_text(text: str, chunk_size: int = 1500, overlap: int = 150) -> List[str]:
    """
    Split text into chunks with overlap for context preservation.
    chunk_size: 1500 characters (default 1500)
    overlap: 150 characters (default 150)
    """
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end]
        chunks.append(chunk)

        if end >= len(text):
            break

        # Move start position with overlap
        start = end - overlap

    return chunks


# Global flag to track if embeddings API has failed
_embeddings_api_failed = False


async def get_embedding(text: str, model: str = "gemma3n:e2b") -> list[float]:
    """Get embedding for text using Ollama's embedding API.
    If the API fails once, skip all subsequent embedding calls.
    Uses fast 2-second timeout to avoid delays.
    """
    global _embeddings_api_failed

    # If embeddings failed before, skip all embedding calls immediately
    if _embeddings_api_failed:
        return []

    ollama_embed_url = "http://localhost:11434/api/embeddings"

    # Use very short timeout (2 seconds total) to fail fast
    async with httpx.AsyncClient(timeout=httpx.Timeout(2.0, connect=1.0)) as client:
        try:
            response = await client.post(ollama_embed_url, json={"model": model, "prompt": text[:2000]})  # Limit text for embedding
            if response.status_code == 200:
                result = response.json()
                return result.get("embedding", [])
            else:
                # Mark embeddings as failed and skip all future calls
                _embeddings_api_failed = True
                print(f"[AI Generator] Embedding API returned {response.status_code}, skipping all future embedding calls")
                return []
        except Exception as e:
            # Mark embeddings as failed and skip all future calls
            _embeddings_api_failed = True
            print(f"[AI Generator] Embedding error: {str(e)}, skipping all future embedding calls")
            return []


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0

    import math

    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = math.sqrt(sum(a * a for a in vec1))
    magnitude2 = math.sqrt(sum(a * a for a in vec2))

    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0

    return dot_product / (magnitude1 * magnitude2)


async def retrieve_relevant_chunks(chunks: List[str], query: str, top_k: int = 3) -> List[str]:
    """
    Retrieve top-k most relevant chunks using embedding similarity.
    Returns the top 3 chunks most relevant to the query.
    Falls back to evenly distributed chunks if embeddings are not available.
    """
    print(f"[AI Generator] Retrieving top {top_k} relevant chunks from {len(chunks)} total chunks")

    # Get query embedding
    query_embedding = await get_embedding(query)

    if not query_embedding:
        # Fallback: return evenly distributed chunks if embedding fails
        # This ensures we get content from different parts of the document
        print("[AI Generator] Embedding API not available, using evenly distributed chunks as fallback")
        if len(chunks) <= top_k:
            return chunks
        # Select evenly distributed chunks
        step = len(chunks) // top_k
        selected = [chunks[i * step] for i in range(top_k)]
        return selected

    # Get embeddings for all chunks
    chunk_embeddings = []
    for i, chunk in enumerate(chunks):
        embedding = await get_embedding(chunk)
        chunk_embeddings.append((i, chunk, embedding))
        if (i + 1) % 10 == 0:
            print(f"[AI Generator] Processed {i + 1}/{len(chunks)} chunk embeddings")

    # Calculate similarities
    similarities = []
    for idx, chunk, embedding in chunk_embeddings:
        if embedding:
            similarity = cosine_similarity(query_embedding, embedding)
            similarities.append((similarity, idx, chunk))
        else:
            # If embedding failed, give it a low similarity
            similarities.append((0.0, idx, chunk))

    # Sort by similarity and get top-k
    similarities.sort(reverse=True, key=lambda x: x[0])
    top_chunks = [chunk for _, _, chunk in similarities[:top_k]]

    print(f"[AI Generator] Retrieved {len(top_chunks)} most relevant chunks")
    return top_chunks


async def generate_question_batch(
    chunk: str,
    q_type: str,
    num_questions: int,
    previous_questions: Set[str],
    include_answers: bool = False,
    timeout: int = 120,
) -> List[str]:
    """
    Generate a batch of questions with improved error handling.
    """
    import asyncio
    import re
    import httpx
    from typing import List, Set

    print(f"[Question Batch] Generating {num_questions} {q_type} questions (include_answers={include_answers})")

    # Simplified prompts
    if q_type.lower() == "mcq":
        if include_answers:
            prompt = f"""Create {num_questions} multiple choice questions from this text.

For each question, use this EXACT format:
Q: [question text]
A) [option]
B) [option]
C) [option]
D) [option]
ANSWER: [A/B/C/D]

Text: {chunk[:1500]}"""
        else:
            prompt = f"""Create {num_questions} multiple choice questions from this text.

For each question, use this EXACT format:
Q: [question text]
A) [option]
B) [option]
C) [option]
D) [option]

Text: {chunk[:1500]}"""

    elif q_type.lower() == "truefalse":
        if include_answers:
            prompt = f"""Create {num_questions} true/false statements from this text.

For each, use this EXACT format:
Q: [statement]
ANSWER: True
(or)
Q: [statement]
ANSWER: False

Text: {chunk[:1500]}"""
        else:
            prompt = f"""Create {num_questions} true/false statements from this text.

For each, use this EXACT format:
Q: [statement]

Text: {chunk[:1500]}"""

    else:  # shortanswer
        if include_answers:
            prompt = f"""Create {num_questions} short answer questions from this text.

For each, use this EXACT format:
Q: [question]
ANSWER: [brief answer]

Text: {chunk[:1500]}"""
        else:
            prompt = f"""Create {num_questions} short answer questions from this text.

For each, use this EXACT format:
Q: [question]

Text: {chunk[:1500]}"""

    async def _generate() -> List[str]:
        ollama_url = "http://localhost:11434/api/generate"

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
                print(f"[Question Batch] Sending request to Ollama...")

                response = await client.post(
                    ollama_url,
                    json={
                        "model": "gemma3n:e2b",
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.7,
                            "top_p": 0.9,
                            "num_predict": 1500,
                        },
                    },
                )

                if response.status_code == 404:
                    print("[ERROR] Model 'gemma3n:e2b' not found!")
                    print("Install it with: ollama pull gemma3n:e2b")
                    return []

                if response.status_code != 200:
                    print(f"[ERROR] Ollama returned status {response.status_code}")
                    print(f"Response: {response.text[:200]}")
                    return []

                result = response.json()
                response_text = result.get("response", "")

                print(f"[Question Batch] Received {len(response_text)} chars")
                print(f"[Question Batch] Preview: {response_text[:200]}...")

                # Parse questions
                questions = []
                parts = re.split(r"\n?Q:\s*", response_text, flags=re.IGNORECASE)

                for part in parts[1:]:
                    if not part.strip():
                        continue

                    try:
                        if q_type.lower() == "mcq":
                            # Extract question
                            q_match = re.search(r"^(.+?)(?=\n[A-D]\))", part, re.DOTALL | re.IGNORECASE)
                            if not q_match:
                                continue

                            question_text = q_match.group(1).strip()

                            # Extract all 4 options
                            options = {}
                            for letter in ["A", "B", "C", "D"]:
                                pattern = rf"{letter}\)\s*(.+?)(?=\n[A-D]\)|ANSWER:|Q:|$)"
                                opt_match = re.search(pattern, part, re.DOTALL | re.IGNORECASE)
                                if opt_match:
                                    options[letter] = opt_match.group(1).strip()

                            if len(options) == 4:
                                formatted = f"Question: {question_text}\n"
                                for letter in ["A", "B", "C", "D"]:
                                    formatted += f"{letter}) {options[letter]}\n"

                                if include_answers:
                                    ans_match = re.search(r"ANSWER:\s*([A-D])", part, re.IGNORECASE)
                                    if ans_match:
                                        formatted += f"Correct Answer: {ans_match.group(1).upper()}"

                                questions.append(formatted.strip())
                                print(f"[Question Batch] Parsed MCQ #{len(questions)}")

                        elif q_type.lower() == "truefalse":
                            stmt_match = re.search(r"^(.+?)(?=ANSWER:|Q:|$)", part, re.DOTALL | re.IGNORECASE)
                            if stmt_match:
                                statement = stmt_match.group(1).strip()
                                formatted = f"Question: {statement}"

                                if include_answers:
                                    ans_match = re.search(r"ANSWER:\s*(True|False)", part, re.IGNORECASE)
                                    if ans_match:
                                        formatted += f"\nAnswer: {ans_match.group(1).capitalize()}"

                                questions.append(formatted)
                                print(f"[Question Batch] Parsed T/F #{len(questions)}")

                        else:  # shortanswer
                            q_match = re.search(r"^(.+?)(?=ANSWER:|Q:|$)", part, re.DOTALL | re.IGNORECASE)
                            if q_match:
                                question_text = q_match.group(1).strip()
                                formatted = f"Question: {question_text}"

                                if include_answers:
                                    ans_match = re.search(r"ANSWER:\s*(.+?)(?=Q:|$)", part, re.DOTALL | re.IGNORECASE)
                                    if ans_match:
                                        formatted += f"\nAnswer: {ans_match.group(1).strip()}"

                                questions.append(formatted)
                                print(f"[Question Batch] Parsed short answer #{len(questions)}")

                    except Exception as e:
                        print(f"[Question Batch] Error parsing: {e}")
                        continue

                print(f"[Question Batch] Total parsed: {len(questions)}/{num_questions}")
                return questions[:num_questions]

        except httpx.ConnectError as e:
            print(f"[ERROR] Cannot connect to Ollama: {e}")
            print("Make sure Ollama is running with: ollama serve")
            return []
        except httpx.TimeoutError as e:
            print(f"[ERROR] Timeout: {e}")
            return []
        except Exception as e:
            print(f"[ERROR] {e}")
            import traceback

            traceback.print_exc()
            return []

    try:
        return await asyncio.wait_for(_generate(), timeout=timeout)
    except asyncio.TimeoutError:
        print(f"[WARNING] Timed out after {timeout}s")
        return []
    except httpx.ConnectError as e:
        # Re-raise connection errors so they can be handled by the caller
        print(f"[AI Generator] Connection error in generate_question_batch: {str(e)}")
        raise
    except Exception as e:
        print(f"[ERROR] Unexpected error in generate_question_batch: {str(e)}")
        return []
