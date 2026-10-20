import logging
import os
from contextlib import asynccontextmanager
from datetime import timezone

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .database import Base, SavedProblem, engine, get_session
from .schemas import Problem
from .simplex import NumericalError, solve
from .auth import current_user, router as auth_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    try:
        Base.metadata.create_all(engine)
    except SQLAlchemyError:
        logger.warning("MySQL no está disponible. El inicio de sesión requiere acceso a la base de datos.")
    yield
    engine.dispose()


app = FastAPI(title="SimplexLab API", version="1.0.0", lifespan=lifespan)
ALLOWED_ORIGINS = [s.strip() for s in os.getenv(
    "CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080"
).split(",") if s.strip()]


@app.middleware("http")
async def protect_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse({"detail": "Origen no autorizado."}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(auth_router)


def timestamp(value):
    return value.replace(tzinfo=timezone.utc).isoformat()


@app.get("/api/health")
def health(session: Session = Depends(get_session)):
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "API disponible; MySQL no está disponible.") from None
    return {"status": "ok", "database": "mysql"}


@app.post("/api/solve", dependencies=[Depends(current_user)])
def solve_problem(problem: Problem, session: Session = Depends(get_session)):
    try:
        result = solve(problem)
    except NumericalError as exc:
        raise HTTPException(422, str(exc)) from None
    record = SavedProblem(
        mode="max" if problem.maximize else "min", status=result["status"],
        problem=problem.model_dump(by_alias=True), result=result,
    )
    try:
        session.add(record)
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        return {**result, "saved": False, "warning":
                "Resultado calculado, pero no se pudo guardar en MySQL. Revisa la conexión y el esquema."}
    return {**result, "saved": True, "id": record.id, "created_at": timestamp(record.created_at)}


@app.get("/api/problems", dependencies=[Depends(current_user)])
def list_problems(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                  session: Session = Depends(get_session)):
    try:
        rows = session.scalars(select(SavedProblem).order_by(
            SavedProblem.id.desc()).offset(offset).limit(limit)).all()
        return [{"id": r.id, "mode": r.mode, "status": r.status,
                 "variables": len(r.problem["obj"]), "z": r.result.get("z"),
                 "created_at": timestamp(r.created_at)} for r in rows]
    except SQLAlchemyError:
        raise HTTPException(503, "No se pudo consultar el historial en MySQL.") from None


@app.get("/api/problems/{problem_id}", dependencies=[Depends(current_user)])
def get_problem(problem_id: int, session: Session = Depends(get_session)):
    try:
        record = session.get(SavedProblem, problem_id)
    except SQLAlchemyError:
        raise HTTPException(503, "No se pudo consultar el historial en MySQL.") from None
    if record is None:
        raise HTTPException(404, "Problema no encontrado.")
    return {"id": record.id, "problem": record.problem, "result": record.result,
            "created_at": timestamp(record.created_at)}
