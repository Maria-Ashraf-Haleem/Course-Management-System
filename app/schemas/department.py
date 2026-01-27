# backend/app/schemas/department.py
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

# Matches SQLAlchemy model: Department.department_id, name, description, is_active
class DepartmentRead(BaseModel):
    department_id: int
    name: str
    description: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True

class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
