import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import JSON, DateTime, Integer, String, create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

database_url = URL.create(
    "mysql+pymysql",
    username=os.getenv("DB_USER", "simplex"),
    password=os.getenv("DB_PASSWORD", "change_this_local_password"),
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=int(os.getenv("DB_PORT", "3306")),
    database=os.getenv("DB_NAME", "simplexlab"),
    query={"charset": "utf8mb4"},
)
engine = create_engine(database_url, pool_pre_ping=True, connect_args={"connect_timeout": 3})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class SavedProblem(Base):
    __tablename__ = "problemas"
    # Los atributos internos mantienen el contrato HTTP existente; los nombres
    # físicos de MySQL usan id y nombres en español para los demás campos.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mode: Mapped[str] = mapped_column("modo", String(3))
    status: Mapped[str] = mapped_column("estado", String(16))
    problem: Mapped[dict] = mapped_column("problema", JSON)
    result: Mapped[dict] = mapped_column("resultado", JSON)
    created_at: Mapped[datetime] = mapped_column(
        "fecha_creacion", DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class User(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column("nombre", String(100))
    email: Mapped[str] = mapped_column("correo", String(254), unique=True)
    password_hash: Mapped[str] = mapped_column("contrasena_hash", String(255))
    created_at: Mapped[datetime] = mapped_column("fecha_creacion", DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class UserSession(Base):
    __tablename__ = "sesiones"
    token_hash: Mapped[str] = mapped_column("token_hash", String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column("usuario_id", Integer, index=True)
    expires_at: Mapped[datetime] = mapped_column("fecha_expiracion", DateTime)
    created_at: Mapped[datetime] = mapped_column("fecha_creacion", DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class RevokedSession(Base):
    __tablename__ = "sesiones_revocadas"
    token_hash: Mapped[str] = mapped_column("token_hash", String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column("fecha_creacion", DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


def get_session():
    with SessionLocal() as session:
        yield session
