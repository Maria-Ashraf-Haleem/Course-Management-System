# backend/app/schemas/assignment.py
from __future__ import annotations
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

# READ (detailed)
class AssignmentRead(BaseModel):
    assignment_id: int
    title: str
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    course_id: int # New field
    max_grade: Optional[float] = None
    attachment_file_path: Optional[str] = None
    attachment_file_name: Optional[str] = None
    # Removed type_id, department_id, max_file_size_mb, instructions, is_active, created_at, updated_at
    # Removed convenient display fields: type_name, department_name

    class Config:
        from_attributes = True

# LIST / SUMMARY
class AssignmentSummary(BaseModel):
    assignment_id: int
    title: str
    deadline: Optional[datetime] = None
    course_id: int # New field
    is_active: bool = True # Keep is_active for summary
    submissions_count: int = 0

    class Config:
        from_attributes = True

# CREATE
class AssignmentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    deadline: datetime
    course_id: int # New field for course association
    # Removed type_id, department_id, target_year, max_file_size_mb, instructions, is_active
    max_grade: Optional[float] = 100.0

# UPDATE (partial)
class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    type_id: Optional[int] = None
    department_id: Optional[int] = None
    target_year: Optional[str] = None
    max_grade: Optional[float] = None
    max_file_size_mb: Optional[int] = None
    instructions: Optional[str] = None
    is_active: Optional[bool] = None
