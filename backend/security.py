"""Passwords, sessions and the request guard that protects the whole API."""
import base64
import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse

import models
from database import SessionLocal
from record_tracking import current_username

SESSION_COOKIE = "lab_session"
SESSION_HOURS = int(os.getenv("SESSION_HOURS", "12"))
# Set COOKIE_SECURE=true when the app is served over HTTPS (production)
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
MIN_PASSWORD_LENGTH = 10

# Paths reachable without a session
PUBLIC_PATHS = {"/auth/login", "/auth/logout"}
# Write requests a read-only user may still make (their own account)
VIEWER_WRITE_PATHS = {"/auth/logout", "/auth/change-password"}


# ── Passwords (scrypt from the standard library) ───────────────────────────

_SCRYPT = dict(n=2 ** 14, r=8, p=1)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return "scrypt${n}${r}${p}${salt}${hash}".format(
        **_SCRYPT, salt=base64.b64encode(salt).decode(), hash=base64.b64encode(digest).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        check = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), dklen=32, n=int(n), r=int(r), p=int(p))
        return hmac.compare_digest(check, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


def password_problem(password: str) -> Optional[str]:
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must have at least {MIN_PASSWORD_LENGTH} characters"
    return None


# ── Sessions ───────────────────────────────────────────────────────────────

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db, user: models.User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(models.UserSession(token_hash=_token_hash(token), user_id=user.id,
                              expires_at=datetime.utcnow() + timedelta(hours=SESSION_HOURS)))
    # Housekeeping: drop expired sessions
    db.query(models.UserSession).filter(models.UserSession.expires_at < datetime.utcnow()).delete()
    return token


def delete_session(db, token: str):
    db.query(models.UserSession).filter(models.UserSession.token_hash == _token_hash(token)).delete()


def user_for_token(db, token: Optional[str]) -> Optional[models.User]:
    if not token:
        return None
    s = db.query(models.UserSession).filter(models.UserSession.token_hash == _token_hash(token)).first()
    if not s or s.expires_at < datetime.utcnow() or not s.user.active:
        return None
    return s.user


def set_session_cookie(response, token: str):
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_HOURS * 3600, httponly=True,
                        secure=COOKIE_SECURE, samesite="lax", path="/")


# ── Login throttling ───────────────────────────────────────────────────────
# 5 failures for the same username from the same address lock that pair; an
# address is only locked as a whole after many failures, because behind a proxy
# or tunnel many users can share one address.

LOCK_SECONDS = 300
LIMITS = {"pair": 5, "ip": 30}
_failures: dict = {}


def login_locked(key: str) -> int:
    """Seconds left on a lock, or 0."""
    count, first, locked_until = _failures.get(key, (0, 0, 0))
    return max(0, int(locked_until - time.time()))


def record_failure(key: str):
    count, first, locked_until = _failures.get(key, (0, time.time(), 0))
    if time.time() - first > LOCK_SECONDS:
        count, first = 0, time.time()
    count += 1
    limit = LIMITS[key.split(":", 1)[0]]
    _failures[key] = (count, first, time.time() + LOCK_SECONDS if count >= limit else 0)


def clear_failures(key: str):
    _failures.pop(key, None)


# Only behind Cloudflare Tunnel is CF-Connecting-IP set by a trusted party; elsewhere a
# client could send it to dodge the login throttle.
TRUST_CF_HEADER = os.getenv("TRUST_CF_HEADER", "false").lower() == "true"


def client_address(request) -> str:
    if TRUST_CF_HEADER and request.headers.get("cf-connecting-ip"):
        return request.headers["cf-connecting-ip"]
    # Behind the Caddy proxy uvicorn (--proxy-headers) puts the X-Forwarded-For client here
    return request.client.host if request.client else "?"


# ── Request guard ──────────────────────────────────────────────────────────

async def auth_guard(request: Request, call_next):
    """Require a session for every request, enforce roles, and log changes."""
    # In production the API is mounted under /api (uvicorn --root-path); compare app paths
    path = request.url.path
    root = request.scope.get("root_path", "")
    if root and path.startswith(root):
        path = path[len(root):]
    path = path.rstrip("/") or "/"
    if request.method == "OPTIONS" or path in PUBLIC_PATHS:
        return await call_next(request)

    db = SessionLocal()
    try:
        user = user_for_token(db, request.cookies.get(SESSION_COOKIE))
        if not user:
            return JSONResponse({"detail": "Not signed in"}, status_code=401)
        is_write = request.method not in ("GET", "HEAD")
        if user.role == models.UserRole.VIEWER and is_write and path not in VIEWER_WRITE_PATHS:
            return JSONResponse({"detail": "Your account is read-only"}, status_code=403)
        if path.startswith("/auth/users") or path.startswith("/auth/audit"):
            if user.role != models.UserRole.ADMIN:
                return JSONResponse({"detail": "Only administrators can manage users"}, status_code=403)
        request.state.user_id = user.id
        request.state.username = user.username
        user_id, username = user.id, user.username
    finally:
        db.close()

    # Records created or edited during this request are stamped with this user
    token = current_username.set(username)
    try:
        response = await call_next(request)
    finally:
        current_username.reset(token)

    if request.method not in ("GET", "HEAD") and path != "/auth/change-password":
        db = SessionLocal()
        try:
            db.add(models.AuditLog(user_id=user_id, username=username, method=request.method,
                                   path=path, status_code=response.status_code))
            db.commit()
        finally:
            db.close()
    return response
