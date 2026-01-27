from __future__ import annotations

from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db import get_db
from app import models
from app.deps import get_current_active_user
from app.schemas.assignment_type import (
    AssignmentTypeCreate,
    AssignmentTypeRead,
    AssignmentTypeUpdate
)

router = APIRouter(prefix="/assignment-types", tags=["assignment-types"])


def _to_read(row: models.AssignmentType) -> AssignmentTypeRead:
    """Convert database model to response schema."""
    return AssignmentTypeRead(
        type_id=row.type_id,
        name=row.name,
        allowed_file_types=row.allowed_file_types,
        is_active=row.is_active,
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


def _validate_assignment_type_exists(
    type_id: int, 
    db: Session, 
    include_inactive: bool = False
) -> models.AssignmentType:
    """Validate that assignment type exists and return it."""
    if type_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment type ID must be positive"
        )
    
    query = db.query(models.AssignmentType).filter(
        models.AssignmentType.type_id == type_id
    )
    
    if not include_inactive:
        query = query.filter(models.AssignmentType.is_active == True)
    
    assignment_type = query.first()
    
    if not assignment_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment type not found"
        )
    
    return assignment_type


@router.get("", response_model=List[AssignmentTypeRead])
def list_assignment_types(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List all assignment types with optional filtering."""
    try:
        query = db.query(models.AssignmentType)
        
        if not include_inactive:
            query = query.filter(models.AssignmentType.is_active == True)
        
        rows = query.order_by(models.AssignmentType.name).all()
        return [_to_read(r) for r in rows]
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve assignment types"
        )


@router.get("/{type_id}", response_model=AssignmentTypeRead)
def get_assignment_type(
    type_id: int,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get a specific assignment type by ID."""
    assignment_type = _validate_assignment_type_exists(type_id, db, include_inactive)
    return _to_read(assignment_type)


@router.post("", response_model=AssignmentTypeRead, status_code=status.HTTP_201_CREATED)
def create_assignment_type(
    assignment_type_data: AssignmentTypeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Create a new assignment type."""
    try:
        # Check if name already exists
        existing = db.query(models.AssignmentType).filter(
            models.AssignmentType.name == assignment_type_data.name
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignment type with this name already exists"
            )
        
        # Create new assignment type
        assignment_type = models.AssignmentType(
            name=assignment_type_data.name,
            allowed_file_types=assignment_type_data.allowed_file_types,
            is_active=assignment_type_data.is_active,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        
        db.add(assignment_type)
        db.commit()
        db.refresh(assignment_type)
        
        return _to_read(assignment_type)
    
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment type with this name already exists"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create assignment type"
        )


@router.put("/{type_id}", response_model=AssignmentTypeRead)
def update_assignment_type(
    type_id: int,
    assignment_type_data: AssignmentTypeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Update an existing assignment type."""
    try:
        assignment_type = _validate_assignment_type_exists(type_id, db, include_inactive=True)
        
        # Check if new name conflicts with existing (if name is being updated)
        if assignment_type_data.name and assignment_type_data.name != assignment_type.name:
            existing = db.query(models.AssignmentType).filter(
                models.AssignmentType.name == assignment_type_data.name,
                models.AssignmentType.type_id != type_id
            ).first()
            
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Assignment type with this name already exists"
                )
        
        # Update fields that are provided
        update_data = assignment_type_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(assignment_type, field, value)
        
        assignment_type.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(assignment_type)
        
        return _to_read(assignment_type)
    
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment type with this name already exists"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update assignment type"
        )


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment_type(
    type_id: int,
    soft_delete: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Delete or deactivate an assignment type."""
    try:
        assignment_type = _validate_assignment_type_exists(type_id, db, include_inactive=True)
        
        # Check if assignment type is being used
        assignments_count = db.query(models.Assignment).filter(
            models.Assignment.type_id == type_id
        ).count()
        
        if assignments_count > 0 and not soft_delete:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete assignment type: {assignments_count} assignments are using this type. Use soft delete instead."
            )
        
        if soft_delete:
            # Soft delete - just deactivate
            assignment_type.is_active = False
            assignment_type.updated_at = datetime.utcnow()
            db.commit()
        else:
            # Hard delete - only if no assignments use this type
            db.delete(assignment_type)
            db.commit()
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete assignment type"
        )


@router.patch("/{type_id}/activate", response_model=AssignmentTypeRead)
def activate_assignment_type(
    type_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Activate a deactivated assignment type."""
    try:
        assignment_type = _validate_assignment_type_exists(type_id, db, include_inactive=True)
        
        if assignment_type.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignment type is already active"
            )
        
        assignment_type.is_active = True
        assignment_type.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(assignment_type)
        
        return _to_read(assignment_type)
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to activate assignment type"
        )


@router.patch("/{type_id}/deactivate", response_model=AssignmentTypeRead)
def deactivate_assignment_type(
    type_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Deactivate an assignment type."""
    try:
        assignment_type = _validate_assignment_type_exists(type_id, db, include_inactive=True)
        
        if not assignment_type.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignment type is already inactive"
            )
        
        assignment_type.is_active = False
        assignment_type.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(assignment_type)
        
        return _to_read(assignment_type)
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to deactivate assignment type"
        )


@router.get("/{type_id}/assignments-count")
def get_assignments_count(
    type_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get the count of assignments using this assignment type."""
    try:
        assignment_type = _validate_assignment_type_exists(type_id, db, include_inactive=True)
        
        count = db.query(models.Assignment).filter(
            models.Assignment.type_id == type_id
        ).count()
        
        return {
            "type_id": type_id,
            "type_name": assignment_type.name,
            "assignments_count": count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get assignments count"
        )