# routers/departments.py
from __future__ import annotations

from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db import get_db
from app import models
from app.deps import get_current_active_user
from app.schemas.department import (
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentRead,
)

router = APIRouter(prefix="/departments", tags=["departments"])

# ---- Internal helpers --------------------------------------------------------

def _dept_id_col():
    """Return the SQLAlchemy column for Department primary key (id vs department_id)."""
    col = getattr(models.Department, "id", None)
    if col is None:
        col = getattr(models.Department, "department_id", None)
    if col is None:
        raise RuntimeError("Department model must have either 'id' or 'department_id' field.")
    return col

def _dept_id_value(row: models.Department) -> int:
    """Read the PK value (id vs department_id)."""
    return getattr(row, "id", getattr(row, "department_id"))

def _has_attr(model, name: str) -> bool:
    return hasattr(model, name)

def _now_iso() -> Optional[str]:
    try:
        return datetime.utcnow().isoformat()
    except Exception:
        return None

def _to_read(row: models.Department) -> DepartmentRead:
    """Convert ORM row to response schema."""
    # Use hasattr checks so this works whether fields exist or not
    payload = {
        "department_id": _dept_id_value(row),
        "name": getattr(row, "name", None),
        "description": getattr(row, "description", None),
    }
    if _has_attr(row, "is_active"):
        payload["is_active"] = getattr(row, "is_active")
    if _has_attr(row, "created_at"):
        payload["created_at"] = getattr(row, "created_at").isoformat() if getattr(row, "created_at") else None
    if _has_attr(row, "updated_at"):
        payload["updated_at"] = getattr(row, "updated_at").isoformat() if getattr(row, "updated_at") else None
    return DepartmentRead(**payload)

def _validate_department_exists(
    department_id: int,
    db: Session,
    include_inactive: bool = True,
) -> models.Department:
    """Fetch a department by id or raise 404. Optionally exclude inactive."""
    if department_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department ID must be positive",
        )

    id_col = _dept_id_col()
    query = db.query(models.Department).filter(id_col == department_id)

    if _has_attr(models.Department, "is_active") and not include_inactive:
        query = query.filter(models.Department.is_active == True)  # noqa: E712

    dept = query.first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )
    return dept

def _check_name_available(
    name: str,
    db: Session,
    exclude_department_id: Optional[int] = None,
) -> None:
    """Ensure department name is unique (case-insensitive)."""
    q = db.query(models.Department).filter(models.Department.name.ilike(name.strip()))
    if exclude_department_id:
        id_col = _dept_id_col()
        q = q.filter(id_col != exclude_department_id)
    exists = db.query(q.exists()).scalar()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department name already exists",
        )

def _touch_created_updated(entity) -> None:
    """Set created_at/updated_at if fields exist."""
    now = datetime.utcnow()
    if _has_attr(entity, "created_at") and getattr(entity, "created_at") is None:
        setattr(entity, "created_at", now)
    if _has_attr(entity, "updated_at"):
        setattr(entity, "updated_at", now)

def _touch_updated(entity) -> None:
    """Set updated_at if field exists."""
    if _has_attr(entity, "updated_at"):
        setattr(entity, "updated_at", datetime.utcnow())

def _require_is_active_field():
    if not _has_attr(models.Department, "is_active"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This operation requires an 'is_active' field on Department.",
        )

# ---- Routes ------------------------------------------------------------------

@router.get("", response_model=List[DepartmentRead])
def list_departments(
    include_inactive: bool = Query(False, description="Include inactive departments if the model supports 'is_active'"),
    search: Optional[str] = Query(None, description="Search in name/description"),
    order_by: str = Query("name", regex="^(name|created_at|updated_at)$"),
    order_dir: str = Query("asc", regex="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """List departments with optional search/pagination/sorting."""
    try:
        q = db.query(models.Department)

        # active filter if supported
        if _has_attr(models.Department, "is_active") and not include_inactive:
            q = q.filter(models.Department.is_active == True)  # noqa: E712

        # search
        if search and search.strip():
            term = f"%{search.strip()}%"
            clauses = [models.Department.name.ilike(term)]
            if _has_attr(models.Department, "description"):
                clauses.append(models.Department.description.ilike(term))
            from sqlalchemy import or_
            q = q.filter(or_(*clauses))

        # ordering
        col_map = {
            "name": getattr(models.Department, "name"),
            "created_at": getattr(models.Department, "created_at", None),
            "updated_at": getattr(models.Department, "updated_at", None),
        }
        col = col_map.get(order_by)
        if col is None:
            # fallback to name if timestamp columns absent
            col = getattr(models.Department, "name")
        q = q.order_by(col.asc() if order_dir == "asc" else col.desc())

        rows = q.offset(offset).limit(limit).all()
        return [_to_read(r) for r in rows]

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve departments",
        )

@router.get("/{department_id}", response_model=DepartmentRead)
def get_department(
    department_id: int,
    include_inactive: bool = False,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a single department by ID."""
    try:
        dept = _validate_department_exists(department_id, db, include_inactive=include_inactive)
        return _to_read(dept)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve department",
        )

@router.post("", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
def create_department(
    data: DepartmentCreate,
    request: Request,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new department (admin recommended; enforce via role if desired)."""
    try:
        # If you want admin-only creation, uncomment:
        # if current_user.role != "admin":
        #     raise HTTPException(status_code=403, detail="Only admins can create departments")

        _check_name_available(data.name, db)

        dept = models.Department(
            name=data.name.strip(),
            description=(data.description or "").strip() if hasattr(models.Department, "description") else None,
        )

        # default is_active True if exists
        if _has_attr(models.Department, "is_active") and getattr(dept, "is_active", None) is None:
            dept.is_active = True

        _touch_created_updated(dept)

        db.add(dept)
        db.commit()
        db.refresh(dept)

        return _to_read(dept)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department with this name already exists",
        )
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create department",
        )

@router.put("/{department_id}", response_model=DepartmentRead)
def update_department(
    department_id: int,
    data: DepartmentUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update existing department."""
    try:
        dept = _validate_department_exists(department_id, db, include_inactive=True)

        # uniqueness check if name being changed
        if data.name and data.name.strip().lower() != (getattr(dept, "name", "") or "").strip().lower():
            _check_name_available(data.name, db, exclude_department_id=department_id)

        # apply updates only for provided fields
        update_data = data.dict(exclude_unset=True)

        if "name" in update_data and hasattr(dept, "name"):
            dept.name = update_data["name"].strip()

        if "description" in update_data and hasattr(dept, "description"):
            dept.description = (update_data["description"] or "").strip()

        # If client is trying to toggle is_active via update, allow only if field exists
        if "is_active" in update_data:
            if _has_attr(models.Department, "is_active"):
                dept.is_active = bool(update_data["is_active"])
            else:
                raise HTTPException(status_code=400, detail="'is_active' field not supported by Department model.")

        _touch_updated(dept)

        db.commit()
        db.refresh(dept)
        return _to_read(dept)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department with this name already exists",
        )
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update department",
        )

@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: int,
    soft_delete: bool = Query(True, description="If true and model supports 'is_active', deactivate instead of hard delete"),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete (hard) or deactivate (soft) a department. Suggest admin-only."""
    try:
        # Enforce admin if you like:
        # if current_user.role != "admin":
        #     raise HTTPException(status_code=403, detail="Only admins can delete departments")

        dept = _validate_department_exists(department_id, db, include_inactive=True)

        if soft_delete and _has_attr(models.Department, "is_active"):
            dept.is_active = False
            _touch_updated(dept)
            db.commit()
            return

        # Hard delete
        db.delete(dept)
        db.commit()
        return

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete department",
        )

@router.patch("/{department_id}/activate", response_model=DepartmentRead)
def activate_department(
    department_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Activate a soft-deleted/inactive department."""
    try:
        _require_is_active_field()
        dept = _validate_department_exists(department_id, db, include_inactive=True)
        if getattr(dept, "is_active", None) is True:
            raise HTTPException(status_code=400, detail="Department is already active")

        dept.is_active = True
        _touch_updated(dept)
        db.commit()
        db.refresh(dept)
        return _to_read(dept)

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to activate department",
        )

@router.patch("/{department_id}/deactivate", response_model=DepartmentRead)
def deactivate_department(
    department_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Deactivate a department (soft delete)."""
    try:
        _require_is_active_field()
        dept = _validate_department_exists(department_id, db, include_inactive=True)
        if getattr(dept, "is_active", None) is False:
            raise HTTPException(status_code=400, detail="Department is already inactive")

        dept.is_active = False
        _touch_updated(dept)
        db.commit()
        db.refresh(dept)
        return _to_read(dept)

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to deactivate department",
        )

@router.get("/stats/summary")
def departments_stats(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Basic stats: totals and active/inactive breakdown (if supported)."""
    try:
        total = db.query(models.Department).count()

        active = None
        inactive = None
        if _has_attr(models.Department, "is_active"):
            active = db.query(models.Department).filter(models.Department.is_active == True).count()  # noqa: E712
            inactive = total - active

        return {
            "total_departments": total,
            "active_departments": active,
            "inactive_departments": inactive,
            "generated_at": _now_iso(),
        }
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute department stats",
        )
