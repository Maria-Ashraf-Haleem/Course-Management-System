# routers/reports.py
from __future__ import annotations

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy import func, and_, or_

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.deps import get_current_active_user

router = APIRouter(prefix="/reports", tags=["reports"])

# ---- Pydantic models --------------------------------------------------------

class ReportRequest(BaseModel):
    report_type: str = Field(..., description="Type of report to generate")
    date_from: Optional[datetime] = Field(None, description="Start date for report")
    date_to: Optional[datetime] = Field(None, description="End date for report")
    department_id: Optional[int] = Field(None, description="Filter by department")
    year_level: Optional[str] = Field(None, description="Filter by year level")

class ReportResponse(BaseModel):
    report_id: str
    report_type: str
    generated_at: datetime
    data: Dict[str, Any]
    status: str

class AnalyticsResponse(BaseModel):
    overview: Dict[str, Any]
    submissions: Dict[str, Any]
    grades: Dict[str, Any]
    performance: Dict[str, Any]
    top_students: List[Dict[str, Any]]

# ---- Helpers ----------------------------------------------------------------

def _require_instructor(user: models.User):
    if (user.role or "").lower() not in {"instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor or admin role required")

def _get_date_range(period: str) -> tuple[datetime, datetime]:
    """Get date range based on period string"""
    now = datetime.utcnow()
    
    if period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now - timedelta(days=30)
    elif period == "quarter":
        start = now - timedelta(days=90)
    elif period == "year":
        start = now - timedelta(days=365)
    else:
        start = now - timedelta(days=30)  # default to month
    
    return start, now

# ---- Routes ----------------------------------------------------------------

@router.post(
    "/generate",
    response_model=ReportResponse,
    summary="Generate a new report (instructor only)"
)
def generate_report(
    report_request: ReportRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    # Validate report type
    valid_types = {"performance", "submissions", "attendance", "deadlines"}
    if report_request.report_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid report type. Must be one of: {', '.join(valid_types)}")
    
    # Generate report based on type
    try:
        if report_request.report_type == "performance":
            data = _generate_performance_report(db, report_request)
        elif report_request.report_type == "submissions":
            data = _generate_submissions_report(db, report_request)
        elif report_request.report_type == "attendance":
            data = _generate_attendance_report(db, report_request)
        elif report_request.report_type == "deadlines":
            data = _generate_deadlines_report(db, report_request)
        else:
            data = {}
        
        report_id = f"report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{report_request.report_type}"
        
        return ReportResponse(
            report_id=report_id,
            report_type=report_request.report_type,
            generated_at=datetime.utcnow(),
            data=data,
            status="completed"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@router.get(
    "/analytics",
    response_model=AnalyticsResponse,
    summary="Get analytics data (instructor only)"
)
def get_analytics(
    period: str = Query("month", description="Time period: week, month, quarter, year"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    _require_instructor(current_user)
    
    try:
        date_from, date_to = _get_date_range(period)
        
        # Resolve instructor id for scoping
        instr = db.query(models.Instructor).filter(models.Instructor.user_id == current_user.id).first()
        instr_id = getattr(instr, "instructor_id", None)

        # Get overview statistics
        overview = _get_overview_stats(db, date_from, date_to, instr_id)
        
        # Get submission trends
        submissions = _get_submission_trends(db, date_from, date_to)
        
        # Get grade distribution
        grades = _get_grade_distribution(db, date_from, date_to)
        
        # Get assignment performance
        performance = _get_assignment_performance(db, date_from, date_to)
        
        # Get top performing students
        top_students = _get_top_students(db, date_from, date_to)
        
        return AnalyticsResponse(
            overview=overview,
            submissions=submissions,
            grades=grades,
            performance=performance,
            top_students=top_students
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get analytics: {str(e)}")

# ---- Report generation functions --------------------------------------------

def _generate_performance_report(db: Session, request: ReportRequest) -> Dict[str, Any]:
    """Generate performance report"""
    query = db.query(models.Submission).join(models.Assignment)
    
    if request.date_from:
        query = query.filter(models.Submission.submitted_at >= request.date_from)
    if request.date_to:
        query = query.filter(models.Submission.submitted_at <= request.date_to)
    
    submissions = query.all()
    
    # Calculate performance metrics
    total_submissions = len(submissions)
    accepted_submissions = len([s for s in submissions if s.status == "Accepted"])
    rejected_submissions = len([s for s in submissions if s.status == "Rejected"])
    needs_revision = len([s for s in submissions if s.status == "NeedsRevision"])
    
    return {
        "total_submissions": total_submissions,
        "accepted": accepted_submissions,
        "rejected": rejected_submissions,
        "needs_revision": needs_revision,
        "acceptance_rate": (accepted_submissions / total_submissions * 100) if total_submissions > 0 else 0
    }

def _generate_submissions_report(db: Session, request: ReportRequest) -> Dict[str, Any]:
    """Generate submissions report"""
    query = db.query(models.Submission).join(models.Assignment)
    
    if request.date_from:
        query = query.filter(models.Submission.submitted_at >= request.date_from)
    if request.date_to:
        query = query.filter(models.Submission.submitted_at <= request.date_to)
    
    submissions = query.all()
    
    # Group by week
    weekly_data = {}
    for submission in submissions:
        week_start = submission.submitted_at - timedelta(days=submission.submitted_at.weekday())
        week_key = week_start.strftime("%Y-%m-%d")
        weekly_data[week_key] = weekly_data.get(week_key, 0) + 1
    
    return {
        "total_submissions": len(submissions),
        "weekly_breakdown": weekly_data
    }

def _generate_attendance_report(db: Session, request: ReportRequest) -> Dict[str, Any]:
    """Generate attendance report (placeholder)"""
    return {
        "message": "Attendance tracking not implemented yet",
        "total_students": 0,
        "attendance_rate": 0
    }

def _generate_deadlines_report(db: Session, request: ReportRequest) -> Dict[str, Any]:
    """Generate deadlines report"""
    query = db.query(models.Assignment)
    
    if request.date_from:
        query = query.filter(models.Assignment.deadline >= request.date_from)
    if request.date_to:
        query = query.filter(models.Assignment.deadline <= request.date_to)
    
    assignments = query.all()
    
    upcoming_deadlines = [a for a in assignments if a.deadline > datetime.utcnow()]
    past_deadlines = [a for a in assignments if a.deadline <= datetime.utcnow()]
    
    return {
        "total_assignments": len(assignments),
        "upcoming_deadlines": len(upcoming_deadlines),
        "past_deadlines": len(past_deadlines)
    }

# ---- Analytics functions ----------------------------------------------------

def _get_overview_stats(db: Session, date_from: datetime, date_to: datetime, instructor_id: int | None) -> Dict[str, Any]:
    """Get overview statistics"""
    # Total students
    total_students = db.query(models.Student).count()
    
    # Active assignments under instructor's active courses. Do NOT filter by deadline.
    if instructor_id is None:
        # No instructor mapping -> do NOT count global assignments; show 0 for safety
        active_assignments = 0
    else:
        q = db.query(models.Assignment)
        # Join Course to ensure the assignment's course belongs to this instructor and is active
        try:
            q = q.join(models.Course, models.Course.course_id == models.Assignment.course_id)
        except Exception:
            pass

        # Only count active assignments (soft deletion)
        if hasattr(models.Assignment, "is_active"):
            q = q.filter(models.Assignment.is_active == True)  # type: ignore

        # Scope to current instructor using Assignment.created_by (as per schema)
        if hasattr(models.Assignment, "created_by"):
            q = q.filter(models.Assignment.created_by == instructor_id)  # type: ignore
            # If Course also tracks creator, require match as well to avoid cross-owned courses
            try:
                if hasattr(models.Course, "created_by"):
                    q = q.filter(models.Course.created_by == instructor_id)  # type: ignore
            except Exception:
                pass
        else:
            active_assignments = 0
            return {
                "totalStudents": total_students,
                "activeAssignments": active_assignments,
                "totalSubmissions": 0,
                "averageGrade": 0.0,
            }

        # If course has an active flag, require it as well
        if hasattr(models.Course, "is_active"):
            q = q.filter(models.Course.is_active == True)  # type: ignore

        try:
            active_assignments = q.count()
            print("[DEBUG] analytics.activeAssignments:", active_assignments, {
                "instructor_id": instructor_id,
            })
        except Exception:
            active_assignments = q.count()
    
    # Total submissions in date range
    total_submissions = db.query(models.Submission).filter(
        and_(
            models.Submission.submitted_at >= date_from,
            models.Submission.submitted_at <= date_to
        )
    ).count()
    
    # Average grade from submissions in date range
    avg_grade_result = db.query(func.avg(models.SubmissionFeedback.grade)).join(
        models.Submission, models.SubmissionFeedback.submission_id == models.Submission.submission_id
    ).filter(
        and_(
            models.Submission.submitted_at >= date_from,
            models.Submission.submitted_at <= date_to,
            models.SubmissionFeedback.grade.isnot(None)
        )
    ).scalar()
    
    average_grade = float(avg_grade_result) if avg_grade_result else 0.0
    
    return {
        "totalStudents": total_students,
        "activeAssignments": active_assignments,
        "totalSubmissions": total_submissions,
        "averageGrade": round(average_grade, 1)
    }

def _get_submission_trends(db: Session, date_from: datetime, date_to: datetime) -> Dict[str, Any]:
    """Get submission trends"""
    # Get all submissions in date range
    submissions = db.query(models.Submission).filter(
        and_(
            models.Submission.submitted_at >= date_from,
            models.Submission.submitted_at <= date_to
        )
    ).all()
    
    # Group by week manually (SQLite compatible)
    weekly_data = {}
    for submission in submissions:
        # Get the start of the week (Monday)
        days_since_monday = submission.submitted_at.weekday()
        week_start = submission.submitted_at - timedelta(days=days_since_monday)
        week_key = week_start.strftime("Week %U")
        weekly_data[week_key] = weekly_data.get(week_key, 0) + 1
    
    # Sort by week and prepare data
    sorted_weeks = sorted(weekly_data.items())
    labels = [week for week, _ in sorted_weeks] if sorted_weeks else []
    data = [count for _, count in sorted_weeks] if sorted_weeks else []
    
    return {
        "labels": labels,
        "data": data
    }

def _get_grade_distribution(db: Session, date_from: datetime, date_to: datetime) -> Dict[str, Any]:
    """Get grade distribution"""
    # Get all feedback records for submissions in date range
    feedback_records = db.query(models.SubmissionFeedback).join(
        models.Submission, models.SubmissionFeedback.submission_id == models.Submission.submission_id
    ).filter(
        and_(
            models.Submission.submitted_at >= date_from,
            models.Submission.submitted_at <= date_to,
            models.SubmissionFeedback.grade.isnot(None)
        )
    ).all()
    
    excellent = 0
    good = 0
    average = 0
    below = 0
    
    for feedback in feedback_records:
        grade = feedback.grade
        if grade >= 9:
            excellent += 1
        elif grade >= 7:
            good += 1
        elif grade >= 6:
            average += 1
        else:
            below += 1
    
    return {
        "excellent": excellent,
        "good": good,
        "average": average,
        "below": below
    }

def _get_assignment_performance(db: Session, date_from: datetime, date_to: datetime) -> Dict[str, Any]:
    """Get assignment performance"""
    # Get assignments with submissions in date range
    assignments = db.query(models.Assignment).join(
        models.Submission, models.Assignment.assignment_id == models.Submission.assignment_id
    ).filter(
        and_(
            models.Submission.submitted_at >= date_from,
            models.Submission.submitted_at <= date_to
        )
    ).distinct().limit(4).all()
    
    labels = []
    data = []
    
    for assignment in assignments:
        # Calculate average grade for this assignment
        avg_grade = db.query(func.avg(models.SubmissionFeedback.grade)).join(
            models.Submission, models.SubmissionFeedback.submission_id == models.Submission.submission_id
        ).filter(
            models.Submission.assignment_id == assignment.assignment_id,
            models.SubmissionFeedback.grade.isnot(None)
        ).scalar()
        
        if avg_grade is not None:
            labels.append(assignment.title)
            data.append(round(float(avg_grade), 1))
    
    return {
        "labels": labels,
        "data": data
    }

def _get_top_students(db: Session, date_from: datetime, date_to: datetime) -> List[Dict[str, Any]]:
    """Get top performing students"""
    # Get students with highest grades in date range
    try:
        top_students = db.query(
            models.Student.student_id,
            models.Student.full_name,
            func.avg(models.SubmissionFeedback.grade).label('avg_grade'),
            func.count(models.Submission.submission_id).label('submissions')
        ).join(
            models.Submission, models.Student.student_id == models.Submission.student_id
        ).join(
            models.SubmissionFeedback, models.Submission.submission_id == models.SubmissionFeedback.submission_id
        ).filter(
            and_(
                models.Submission.submitted_at >= date_from,
                models.Submission.submitted_at <= date_to,
                models.SubmissionFeedback.grade.isnot(None)
            )
        ).group_by(
            models.Student.student_id, models.Student.full_name
        ).order_by(
            func.avg(models.SubmissionFeedback.grade).desc()
        ).limit(5).all()
        # Add rank and include student_id for reliable matching on frontend
        out: List[Dict[str, Any]] = []
        for idx, (student_id, full_name, avg_grade, submissions) in enumerate(top_students, start=1):
            try:
                g = round(float(avg_grade), 1) if avg_grade is not None else 0.0
            except Exception:
                g = 0.0
            out.append({
                "student_id": student_id,
                "name": full_name,
                "grade": g,
                "submissions": submissions,
                "rank": idx,
            })
        return out
    except Exception:
        # Return empty list if query fails
        return []
