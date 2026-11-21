import hashlib
import hmac
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import event, text
from sqlalchemy.orm import Session

from app.database.config import settings
from app.database.connection import get_db
from app.models.entities import Course, CourseMember, User, Teacher

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/login")

# -------------------------------------------------------------------
# Password hashing
# -------------------------------------------------------------------
_LEGACY_SALT = "optiteach_salt_2026"  # pre-bcrypt scheme: one static salt for every user


def hash_password(password: str) -> str:
    """bcrypt with a per-password random salt and work factor 12."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _is_legacy_hash(hashed_password: str) -> bool:
    return not hashed_password.startswith("$2")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if _is_legacy_hash(hashed_password):
        legacy = hashlib.sha256((_LEGACY_SALT + plain_password).encode("utf-8")).hexdigest()
        return hmac.compare_digest(legacy, hashed_password)
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def needs_rehash(hashed_password: str) -> bool:
    """Legacy SHA-256 hashes are upgraded to bcrypt on the next successful login."""
    return _is_legacy_hash(hashed_password)


# -------------------------------------------------------------------
# Rate limiting (sliding window, in memory: one API process)
# -------------------------------------------------------------------
class SlidingWindowLimiter:
    def __init__(self, max_attempts: int, window_seconds: int, message: str):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.message = message
        self._failures: Dict[str, Deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> Deque[float]:
        attempts = self._failures[key]
        while attempts and now - attempts[0] > self.window_seconds:
            attempts.popleft()
        return attempts

    def check(self, key: str) -> None:
        attempts = self._prune(key, time.monotonic())
        if len(attempts) >= self.max_attempts:
            retry_after = int(self.window_seconds - (time.monotonic() - attempts[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=self.message,
                headers={"Retry-After": str(retry_after)},
            )

    def record_failure(self, key: str) -> None:
        self._prune(key, time.monotonic()).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


# Failed logins per client IP + email (successful logins reset it)
login_rate_limiter = SlidingWindowLimiter(5, 60, "Too many failed login attempts. Try again shortly.")
# Syllabus uploads per user: PDF parsing is the most expensive request the API serves
upload_rate_limiter = SlidingWindowLimiter(30, 60, "Too many syllabus uploads in a minute. Wait a moment and try again.")



# -------------------------------------------------------------------
# Tokens
# -------------------------------------------------------------------
def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# -------------------------------------------------------------------
# Acting user -> PostgreSQL session setting (read by the audit trigger)
# -------------------------------------------------------------------
_ACTOR_KEY = "actor_user_id"


def _apply_actor(connection, user_id: str) -> None:
    if connection.dialect.name == "postgresql":
        connection.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": user_id})


@event.listens_for(Session, "after_begin")
def _set_actor_on_begin(session, transaction, connection):
    """
    Every transaction a request opens gets app.user_id set transaction-locally, so audit
    rows name the real user. Transaction-local (is_local = true) matters: a pooled
    connection must never carry one request's identity into the next.
    """
    user_id = session.info.get(_ACTOR_KEY)
    if user_id:
        _apply_actor(connection, user_id)


def bind_actor(db: Session, user_id: str) -> None:
    db.info[_ACTOR_KEY] = user_id
    if db.in_transaction():  # the auth lookup already opened one
        _apply_actor(db.connection(), user_id)


# -------------------------------------------------------------------
# Dependencies
# -------------------------------------------------------------------
def _user_from_token(token: str, db: Session) -> Optional[User]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = _user_from_token(token, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    bind_actor(db, user.id)
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator role required")
    return current_user


def get_current_teacher(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Optional[Teacher]:
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have an active teacher profile"
        )
    return teacher


def course_role(db: Session, course: Course, user: User) -> Optional[str]:
    """owner / admin / co_teacher / viewer, or None when the user has no access."""
    if user.role == "admin":
        return "admin"
    if course.teacher and course.teacher.user_id == user.id:
        return "owner"
    membership = (
        db.query(CourseMember).join(Teacher, CourseMember.teacher_id == Teacher.id)
        .filter(CourseMember.course_id == course.id, Teacher.user_id == user.id)
        .first()
    )
    return membership.role if membership else None


def get_accessible_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Course:
    """
    Course-level access control. Admins reach every course; owners and co-teachers can
    read and change it; viewers can only read (any non-GET request is refused with 403).
    A course the caller may not see is reported as 404, not 403, so course IDs of
    other teachers cannot be probed.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    role = course_role(db, course, current_user) if course else None
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    if role == "viewer" and request is not None and request.method != "GET":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="You can view this course but not change it. Ask the course owner for co-teacher access.")
    return course


def get_owned_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Course:
    """Owner (or admin) only: used for managing who else has access."""
    course = get_accessible_course(course_id, current_user, db)
    if course_role(db, course, current_user) not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the course owner can change who has access")
    return course


def client_key(request: Request, email: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}:{email.lower()}"


def limit_uploads(current_user: User = Depends(get_current_user)) -> None:
    upload_rate_limiter.check(current_user.id)
    upload_rate_limiter.record_failure(current_user.id)  # every attempt counts, not only failures
