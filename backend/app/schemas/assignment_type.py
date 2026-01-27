# backend/app/schemas/assignment_type.py
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

# Use field names that match your DB model (AssignmentType.type_id, name, description, is_active)

class AssignmentTypeRead(BaseModel):
    type_id: int
    name: str
    description: Optional[str] = None
    is_active: bool = True

    # allow ORM objects (SQLAlchemy) to be returned directly
    class Config:
        from_attributes = True


class AssignmentTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True


class AssignmentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
