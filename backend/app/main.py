from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect
from app.database.config import settings, DEV_SECRET_KEY
from app.database.connection import get_db_info, get_mongo_db, logger
from app.database.mongo_schema import ensure_mongo_schema
from app.services.errors import ConflictError
from app.api.auth import router as auth_router
from app.api.courses import router as courses_router
from app.api.syllabus import router as syllabus_router
from app.api.dbms_insights import router as dbms_router
from app.api.exports import router as exports_router
from app.api.teaching_methods import router as teaching_methods_router
from app.api.curriculum import router as curriculum_router
from app.api.members import router as members_router
from app.api.admin import router as admin_router
from app.api.students import router as students_router
from app.api.institutional_operations import router as institutional_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    PostgreSQL schema is owned by Alembic migrations (database/migrations) because it
    carries views, triggers and functions that create_all() cannot express.
    SQLite is the zero-config dev/test fallback and is built directly from the ORM.
    """
    from app.database.connection import db_engine, db_dialect, Base
    from app.models import entities  # noqa: F401 — ensure models are registered
    if settings.SECRET_KEY == DEV_SECRET_KEY:
        logger.warning("SECRET_KEY is the development default; set SECRET_KEY in backend/.env before sharing this server")
    ensure_mongo_schema(get_mongo_db())
    if db_dialect == "sqlite":
        Base.metadata.create_all(bind=db_engine)
    elif not inspect(db_engine).has_table("alembic_version"):
        logger.error(
            "Database schema is not initialised. Run: "
            "alembic -c database/migrations/alembic.ini upgrade head"
        )
    yield

app = FastAPI(
    title="OptiTeach API",
    description="A DBMS-Centric Intelligent Course Teaching & Optimization Platform",
    version=settings.VERSION,
    lifespan=lifespan
)

@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError):
    return JSONResponse(status_code=409, content={"detail": str(exc), **exc.details})

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Services raise ValueError for bad references; surface them as 404/400, not 500."""
    message = str(exc)
    status_code = 404 if "not found" in message.lower() else 400
    return JSONResponse(status_code=status_code, content={"detail": message})

# CORS Configuration
# Explicit origin list: a wildcard origin together with credentials would let any site
# make authenticated calls from a logged-in teacher's browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# Register API Routers
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(courses_router, prefix=settings.API_PREFIX)
app.include_router(syllabus_router, prefix=settings.API_PREFIX)
app.include_router(dbms_router, prefix=settings.API_PREFIX)
app.include_router(exports_router, prefix=settings.API_PREFIX)
app.include_router(teaching_methods_router, prefix=settings.API_PREFIX)
app.include_router(curriculum_router, prefix=settings.API_PREFIX)
app.include_router(members_router, prefix=settings.API_PREFIX)
app.include_router(admin_router, prefix=settings.API_PREFIX)
app.include_router(students_router, prefix=settings.API_PREFIX)
app.include_router(institutional_router, prefix=settings.API_PREFIX)

@app.get("/")
def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "philosophy": "DBMS is the CORE. AI/Optimization is the INTELLIGENCE. Dashboard is the PRODUCT.",
        "docs_url": "/docs"
    }

@app.get("/health")
def healthcheck():
    return {
        "status": "healthy",
        "database": get_db_info()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
