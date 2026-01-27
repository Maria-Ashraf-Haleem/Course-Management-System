from __future__ import annotations

from typing import List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db import get_db
from app import models
from app.deps import get_current_active_user, get_current_user
from core.security import verify_password, get_password_hash, create_access_token

# ---- use your single-file schema: app/schemas.py ----
from app.schemas import (
    UserCreate,   # username, email, password, role
    UserRead,     # id, username, email, role, created_at, role_id?
    Token,        # access_token, token_type
)

# ---- locally define the missing request models ----
class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None  # admin-only change
    full_name: Optional[str] = None # Add full_name here

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class LoginRequest(BaseModel):
    username: str
    password: str

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_read(row: models.User) -> UserRead:
    """Map DB user -> UserRead (match your schema exactly)."""
    return UserRead(
        id=row.id,
        username=row.username,
        email=row.email,
        role=row.role,                    # your schema has 'role' (string)
        created_at=row.created_at,        # schema expects datetime, not ISO string
        role_id=getattr(row, "role_id", None),  # optional in your schema
        full_name=getattr(row, "full_name", None), # Include full_name
    )


def _validate_user_exists(
    user_id: int,
    db: Session,
    include_inactive: bool = False
) -> models.User:
    if user_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User ID must be positive")

    q = db.query(models.User).filter(models.User.id == user_id)
    if not include_inactive:
        q = q.filter(models.User.is_active == True)

    user = q.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _check_username_email_availability(
    username: str,
    email: str,
    db: Session,
    exclude_user_id: Optional[int] = None
) -> None:
    q = db.query(models.User).filter(
        (models.User.username == username) | (models.User.email == email)
    )
    if exclude_user_id:
        q = q.filter(models.User.id != exclude_user_id)

    existing = q.first()
    if existing:
        if existing.username == username:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")
        if existing.email == email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, request: Request, db: Session = Depends(get_db)):
    try:
        _check_username_email_availability(user_data.username, user_data.email, db)

        # If a doctor pre-created a Student record with this student_number, claim/link it
        precreated_student = db.query(models.Student).filter(
            models.Student.student_number == user_data.username,
            (models.Student.user_id.is_(None))
        ).first()

        # If there is a precreated student, force role to student
        effective_role = "student" if precreated_student else user_data.role

        user = models.User(
            username=user_data.username,
            email=user_data.email,
            password_hash=get_password_hash(user_data.password),
            role=effective_role,
            created_at=datetime.utcnow(),
            full_name=user_data.full_name or user_data.username, # Set full_name on user creation, default to username
        )
        if hasattr(models.User, "is_active"):
            setattr(user, "is_active", True)
        if hasattr(models.User, "updated_at"):
            setattr(user, "updated_at", datetime.utcnow())
        db.add(user)
        db.flush()  # obtain user.id without committing yet

        # Link the student to this user, if matched
        if precreated_student:
            precreated_student.user_id = user.id

        # Removed instructor creation logic from here as it's not directly part of user registration
        # if effective_role == "instructor":
        #     existing_instructor = db.query(models.Instructor).filter(models.Instructor.user_id == user.id).first()
        #     if not existing_instructor:
        #         instructor = models.Instructor(
        #             user_id=user.id,
        #             full_name=user_data.full_name or f"Prof. {user.username}",
        #             email=user.email,
        #             role="Lecturer",
        #         )
        #         db.add(instructor)
        #         db.flush()

        db.commit()
        db.refresh(user)
        return _to_read(user)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create user account")


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    try:
        user = db.query(models.User).filter(
            (models.User.username == form_data.username) | (models.User.email == form_data.username)
        ).first()

        if not user or not verify_password(form_data.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password",
                                headers={"WWW-Authenticate": "Bearer"})

        # Only enforce is_active when the column exists
        if hasattr(models.User, "is_active") and (not getattr(user, "is_active", True)):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is deactivated",
                                headers={"WWW-Authenticate": "Bearer"})

        # If this is a student, require a linked Student profile
        if (user.role or "").lower() == "student":
            has_student = db.query(models.Student).filter(models.Student.user_id == user.id).first()
            if not has_student:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Student profile not found. Please contact your instructor/administrator.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        # Optional timestamp fields
        if hasattr(user, "last_login"):
            user.last_login = datetime.utcnow()
        db.commit()

        access_token = create_access_token(subject=user.id, extra_claims={"role": user.role})
        return Token(access_token=access_token, token_type="bearer")  # match your Token schema exactly

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Authentication failed")


@router.post("/login-json", response_model=Token)
def login_json(login_data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    try:
        user = db.query(models.User).filter(
            (models.User.username == login_data.username) | (models.User.email == login_data.username)
        ).first()

        if not user or not verify_password(login_data.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password",
                                headers={"WWW-Authenticate": "Bearer"})

        if hasattr(models.User, "is_active") and (not getattr(user, "is_active", True)):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is deactivated",
                                headers={"WWW-Authenticate": "Bearer"})

        # If this is a student, require a linked Student profile
        if (user.role or "").lower() == "student":
            has_student = db.query(models.Student).filter(models.Student.user_id == user.id).first()
            if not has_student:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Student profile not found. Please contact your instructor/administrator.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        if hasattr(user, "last_login"):
            user.last_login = datetime.utcnow()
        db.commit()

        access_token = create_access_token(subject=user.id, extra_claims={"role": user.role})
        return Token(access_token=access_token, token_type="bearer")

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Authentication failed")


# filepath: t:\Dentist web\backend\routers\auth.py

@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_active_user)):
    """Returns the current user's basic profile information."""
    return UserRead(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        full_name=current_user.full_name or current_user.username, # Prioritize user's full_name
        created_at=current_user.created_at,
        role_id=getattr(current_user, "role_id", None), # Safely access role_id
    )


@router.put("/me", response_model=UserRead)
def update_current_user_profile(
    user_data: UserUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    try:
        # Check for username/email availability only if they are being updated
        if user_data.username and user_data.username != current_user.username:
            _check_username_email_availability(user_data.username, current_user.email, db, current_user.id)
        if user_data.email and user_data.email != current_user.email:
            _check_username_email_availability(current_user.username, user_data.email, db, current_user.id)

        # Update fields from user_data
        update_data = user_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(current_user, field, value)

        current_user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(current_user)
        return _to_read(current_user)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update profile")


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    password_data: PasswordChange,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    try:
        if not verify_password(password_data.current_password, current_user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

        if verify_password(password_data.new_password, current_user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="New password must be different from current password")

        current_user.password_hash = get_password_hash(password_data.new_password)
        if hasattr(current_user, "updated_at"):
            current_user.updated_at = datetime.utcnow()
        db.commit()

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to change password")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(current_user: models.User = Depends(get_current_user)):
    return


@router.get("/verify-token", response_model=UserRead)
def verify_token(current_user: models.User = Depends(get_current_active_user)):
    return _to_read(current_user)


@router.get("/users", response_model=List[UserRead])
def list_users(
    include_inactive: bool = False,
    role: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can list users")

        q = db.query(models.User)
        if not include_inactive and hasattr(models.User, "is_active"):
            q = q.filter(models.User.is_active == True)
        if role:
            q = q.filter(models.User.role == role.lower())
        if search:
            term = f"%{search.strip()}%"
            q = q.filter((models.User.username.ilike(term)) | (models.User.email.ilike(term)))

        rows = q.order_by(models.User.username.asc()).offset(offset).limit(limit).all()
        return [_to_read(r) for r in rows]

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve users")


@router.get("/users/{user_id}", response_model=UserRead)
def get_user(
    user_id: int,
    include_inactive: bool = False,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    try:
        if current_user.role != "admin" and current_user.id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only access your own profile")

        user = _validate_user_exists(user_id, db, include_inactive)
        return _to_read(user)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve user")


@router.put("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    try:
        if current_user.role != "admin" and current_user.id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only update your own profile")

        if user_data.role and current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can change user roles")

        user = _validate_user_exists(user_id, db, include_inactive=True)

        if user_data.username or user_data.email:
            username = user_data.username or user.username
            email = user_data.email or user.email
            _check_username_email_availability(username, email, db, user_id)

        update_data = user_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)

        if hasattr(user, "updated_at"):
            user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return _to_read(user)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update user")


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    soft_delete: bool = True,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can delete users")

        if current_user.id == user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")

        user = _validate_user_exists(user_id, db, include_inactive=True)

        submissions_count = db.query(models.Submission).filter(models.Submission.student_id == user_id).count()
        if submissions_count > 0 and not soft_delete:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete user: {submissions_count} submissions exist. Use soft delete instead.",
            )

        if soft_delete:
            if not hasattr(models.User, "is_active"):
                raise HTTPException(status_code=400, detail="Soft delete requires 'is_active' column on User")
            user.is_active = False
            if hasattr(user, "updated_at"):
                user.updated_at = datetime.utcnow()
            db.commit()
        else:
            db.delete(user)
            db.commit()

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete user")


@router.patch("/users/{user_id}/activate", response_model=UserRead)
def activate_user(user_id: int, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can activate users")

        user = _validate_user_exists(user_id, db, include_inactive=True)
        if not hasattr(models.User, "is_active"):
            raise HTTPException(status_code=400, detail="'is_active' column not available on User")
        if user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already active")

        user.is_active = True
        if hasattr(user, "updated_at"):
            user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return _to_read(user)

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to activate user")


@router.patch("/users/{user_id}/deactivate", response_model=UserRead)
def deactivate_user(user_id: int, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can deactivate users")

        if current_user.id == user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")

        user = _validate_user_exists(user_id, db, include_inactive=True)
        if hasattr(models.User, "is_active") and not user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already inactive")

        if not hasattr(models.User, "is_active"):
            raise HTTPException(status_code=400, detail="'is_active' column not available on User")
        user.is_active = False
        if hasattr(user, "updated_at"):
            user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return _to_read(user)

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deactivate user")


@router.get("/stats")
def get_auth_stats(current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can view auth statistics")

        total_users = db.query(models.User).count()
        active_users = None
        inactive_users = None
        if hasattr(models.User, "is_active"):
            active_users = db.query(models.User).filter(models.User.is_active == True).count()
            inactive_users = total_users - active_users

        students_count = db.query(models.User).filter(models.User.role == "student", models.User.is_active == True).count()
        teachers_count = db.query(models.User).filter(models.User.role == "teacher", models.User.is_active == True).count()
        admins_count = db.query(models.User).filter(models.User.role == "admin", models.User.is_active == True).count()

        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_registrations = db.query(models.User).filter(models.User.created_at >= thirty_days_ago).count()

        return {
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": inactive_users,
            "users_by_role": {"students": students_count, "teachers": teachers_count, "admins": admins_count},
            "recent_registrations_30_days": recent_registrations,
            "generated_at": datetime.utcnow().isoformat(),
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve auth statistics")


@router.post("/refresh-token", response_model=Token)
def refresh_token(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        if hasattr(models.User, "is_active") and (not getattr(current_user, "is_active", True)):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is deactivated",
                                headers={"WWW-Authenticate": "Bearer"})

        access_token = create_access_token(subject=current_user.id, extra_claims={"role": current_user.role})
        return Token(access_token=access_token, token_type="bearer")

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to refresh token")
