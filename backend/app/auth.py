"""Registro y sesiones opacas: contraseñas scrypt y cookies HttpOnly."""
import hashlib
import hmac
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .database import RevokedSession, User, UserSession, get_session

router = APIRouter(prefix="/api/auth", tags=["Acceso"])
COOKIE = "simplexlab_session"
SESSION_SECONDS = 12 * 60 * 60
AUTH_ATTEMPTS = defaultdict(deque)
ATTEMPTS_LOCK = threading.Lock()


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class RegisterInput(LoginInput):
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return value.strip() if isinstance(value, str) else value


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt),
                            n=16384, r=8, p=1, dklen=64).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password, encoded):
    try:
        algorithm, salt, digest = encoded.split("$")
        return algorithm == "scrypt" and hmac.compare_digest(password_hash(password, salt), encoded)
    except (ValueError, TypeError):
        return False


DUMMY_HASH = password_hash("constant-time-dummy-password")


def throttle(request):
    address = request.client.host if request.client else "unknown"
    instant = time.monotonic()
    with ATTEMPTS_LOCK:
        # El límite es por IP y proceso; no conserva direcciones indefinidamente.
        for key in list(AUTH_ATTEMPTS):
            if not AUTH_ATTEMPTS[key] or AUTH_ATTEMPTS[key][-1] < instant - 600:
                del AUTH_ATTEMPTS[key]
        attempts = AUTH_ATTEMPTS[address]
        while attempts and attempts[0] < instant - 600:
            attempts.popleft()
        if len(attempts) >= 10:
            raise HTTPException(429, "Demasiados intentos. Espera diez minutos e inténtalo de nuevo.")
        attempts.append(instant)


def public_user(user):
    return {"id": user.id, "name": user.name, "email": user.email}


def begin_session(user, session, response):
    token = secrets.token_urlsafe(32)
    session.add(UserSession(token_hash=hashlib.sha256(token.encode()).hexdigest(),
                            user_id=user.id, expires_at=now() + timedelta(seconds=SESSION_SECONDS)))
    session.commit()
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True,
                        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
                        samesite="lax", path="/api")
    response.headers["Cache-Control"] = "no-store"


def current_user(request: Request, session: Session = Depends(get_session)):
    token = request.cookies.get(COOKIE)
    if not token or len(token) > 200:
        raise HTTPException(401, "Inicia sesión para continuar.")
    digest = hashlib.sha256(token.encode()).hexdigest()
    try:
        saved = session.get(UserSession, digest)
        if not saved or saved.expires_at <= now() or session.get(RevokedSession, digest):
            raise HTTPException(401, "Tu sesión expiró. Inicia sesión nuevamente.")
        user = session.get(User, saved.user_id)
        if not user:
            raise HTTPException(401, "Inicia sesión para continuar.")
        return user
    except SQLAlchemyError:
        raise HTTPException(503, "No se pudo verificar tu sesión en MySQL.") from None


@router.post("/register", status_code=201)
def register(data: RegisterInput, request: Request, response: Response,
             session: Session = Depends(get_session)):
    throttle(request)
    user = User(name=data.name, email=data.email, password_hash=password_hash(data.password))
    try:
        session.add(user)
        session.flush()
        begin_session(user, session, response)
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese correo.") from None
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(503, "No se pudo crear la cuenta. Revisa la conexión con MySQL.") from None
    return public_user(user)


@router.post("/login")
def login(data: LoginInput, request: Request, response: Response,
          session: Session = Depends(get_session)):
    throttle(request)
    try:
        user = session.scalar(select(User).where(User.email == data.email))
        valid = verify_password(data.password, user.password_hash if user else DUMMY_HASH)
        if not user or not valid:
            raise HTTPException(401, "Correo o contraseña incorrectos.")
        begin_session(user, session, response)
        return public_user(user)
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(503, "No se pudo iniciar sesión. Revisa la conexión con MySQL.") from None


@router.get("/me")
def me(response: Response, user: User = Depends(current_user)):
    response.headers["Cache-Control"] = "no-store"
    return public_user(user)


@router.post("/logout")
def logout(request: Request, response: Response, session: Session = Depends(get_session)):
    token = request.cookies.get(COOKIE)
    try:
        if token and len(token) <= 200:
            digest = hashlib.sha256(token.encode()).hexdigest()
            if session.get(UserSession, digest) and not session.get(RevokedSession, digest):
                session.add(RevokedSession(token_hash=digest))
                session.commit()
    except IntegrityError:
        session.rollback()  # Una petición concurrente ya revocó la misma sesión.
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(503, "No se pudo cerrar la sesión. Inténtalo de nuevo.") from None
    response.delete_cookie(COOKIE, path="/api")
    response.headers["Cache-Control"] = "no-store"
    return {"message": "Sesión cerrada."}
