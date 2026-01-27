# app/schemas/auth.py
from __future__ import annotations
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict

# ---- Auth token ----
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

# ---- Users ----
class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: str  # "student" | "doctor" | "admin" (if you have it)
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int
    created_at: datetime
    role_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    full_name: Optional[str] = None

# (Optional) minimal submission DTO if some router imported it from here
class SubmissionRead(BaseModel):
    id: int
    assignmentId: int
    title: Optional[str] = None
    course: Optional[str] = None
    submittedAt: datetime
    status: str
    fileName: str
    fileUrl: str
    fileType: str
    notes: Optional[str] = None
    grade: Optional[float] = None
    maxGrade: Optional[float] = None
    feedback: Optional[str] = None
    gradedAt: Optional[datetime] = None
