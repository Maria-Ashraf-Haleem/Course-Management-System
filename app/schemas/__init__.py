# app/schemas/__init__.py

# Auth
from .auth import Token, UserBase, UserCreate, UserRead, SubmissionRead

# Assignment
from .assignment import (
    AssignmentRead,
    AssignmentSummary,
    AssignmentCreate,
    AssignmentUpdate,
)

# Assignment Type
from .assignment_type import (
    AssignmentTypeRead,
    AssignmentTypeCreate,
    AssignmentTypeUpdate,
)

# Department
from .department import (
    DepartmentRead,
    DepartmentCreate,
    DepartmentUpdate,
)
