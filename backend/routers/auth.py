from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

import models, schemas
from database import get_db
from security import (
    SESSION_COOKIE, clear_failures, client_address, create_session, delete_session, hash_password, login_locked,
    password_problem, record_failure, set_session_cookie, user_for_token, verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    user = user_for_token(db, request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


@router.post("/login", response_model=schemas.UserOut)
def login(data: schemas.LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    username = data.username.strip().lower()
    ip = client_address(request)
    keys = [f"pair:{username}|{ip}", f"ip:{ip}"]
    wait = max(login_locked(k) for k in keys)
    if wait:
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {wait // 60 + 1} min")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not user.active or not verify_password(data.password, user.password_hash):
        for k in keys:
            record_failure(k)
        raise HTTPException(status_code=401, detail="Wrong username or password")
    clear_failures(keys[0])
    token = create_session(db, user)
    user.last_login = datetime.utcnow()
    db.commit()
    set_session_cookie(response, token)
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        delete_session(db, token)
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(data: schemas.PasswordChange, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    problem = password_problem(data.new_password)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    user.password_hash = hash_password(data.new_password)
    db.commit()


# ── User management (admins only; enforced by the request guard) ───────────

@router.get("/users", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.username).all()


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(data: schemas.UserCreate, db: Session = Depends(get_db)):
    username = data.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=400, detail="That username already exists")
    problem = password_problem(data.password)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    user = models.User(username=username, full_name=data.full_name or None,
                       initials=(data.initials or "").strip().upper() or None,
                       password_hash=hash_password(data.password), role=data.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, data: schemas.UserUpdate, request: Request, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    changes = data.model_dump(exclude_unset=True)
    demoting = changes.get("role", user.role) != models.UserRole.ADMIN or changes.get("active", user.active) is False
    if user.role == models.UserRole.ADMIN and demoting:
        others = db.query(models.User).filter(models.User.role == models.UserRole.ADMIN, models.User.active == True,
                                              models.User.id != user.id).count()
        if others == 0:
            raise HTTPException(status_code=400, detail="There must be at least one active administrator")
    if "password" in changes:
        problem = password_problem(changes["password"] or "")
        if problem:
            raise HTTPException(status_code=400, detail=problem)
        user.password_hash = hash_password(changes.pop("password"))
        # A reset signs the user out everywhere
        db.query(models.UserSession).filter(models.UserSession.user_id == user.id).delete()
    if "initials" in changes:
        changes["initials"] = (changes["initials"] or "").strip().upper() or None
    for k, v in changes.items():
        setattr(user, k, v)
    if changes.get("active") is False:
        db.query(models.UserSession).filter(models.UserSession.user_id == user.id).delete()
    db.commit()
    db.refresh(user)
    return user


@router.get("/audit", response_model=List[schemas.AuditEntry])
def audit_log(limit: int = 200, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 1000))
    return db.query(models.AuditLog).order_by(models.AuditLog.id.desc()).limit(limit).all()
