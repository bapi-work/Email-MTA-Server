"""
CloudMTA - Professional Email MTA Server
Main FastAPI Application
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import logging
import bcrypt
from contextlib import asynccontextmanager
from datetime import datetime

from sqlalchemy import text

from config import settings
from database import engine, Base, get_db, SessionLocal, User, UserRole
from routers import users, domains, queues, smtp, analytics, auth, suppressions, reputation, send
from middleware import JWTMiddleware, RateLimitMiddleware
from services import HealthcheckService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize services
healthcheck_service = HealthcheckService()

def ensure_schema_migrations():
    """Idempotent, additive column migrations for columns added after the
    original schema.sql — create_all() only creates missing tables, not
    missing columns on tables that already exist from an older deployment."""
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_password VARCHAR(255)"
            ))
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_password_created_at TIMESTAMP"
            ))
        logger.info("Schema migrations checked/applied")
    except Exception as e:
        logger.error(f"Schema migration failed: {e}")

def ensure_default_admin():
    """Seed the default admin account on a brand-new database only.

    Runs on every startup, but is a no-op once any admin user exists —
    it never touches an existing admin's password, so restarting or
    redeploying the stack can never reset credentials someone changed.
    """
    db = SessionLocal()
    try:
        if db.query(User).filter(User.role == UserRole.ADMIN).first():
            return

        hashed = bcrypt.hashpw(settings.ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
        admin = User(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            hashed_password=hashed,
            full_name="System Administrator",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        logger.info(f"Seeded default admin account ({settings.ADMIN_EMAIL})")
    except Exception as e:
        logger.error(f"Failed to seed default admin account: {e}")
        db.rollback()
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("CloudMTA Backend Starting...")
    for attempt in range(1, 11):
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables initialized")
            break
        except Exception as e:
            if attempt == 10:
                logger.error(f"Database unavailable after 10 attempts, giving up: {e}")
            else:
                logger.warning(f"Database not ready (attempt {attempt}/10), retrying in 3s: {e}")
                await asyncio.sleep(3)

    ensure_schema_migrations()
    ensure_default_admin()

    yield
    
    # Shutdown
    logger.info("CloudMTA Backend Shutting Down...")

# Create FastAPI application
app = FastAPI(
    title="CloudMTA API",
    description="Professional Email MTA Server API",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Order matters: Starlette runs the LAST-added middleware first. JWTMiddleware
# must run before RateLimitMiddleware so request.state.user_id is available
# for per-account limiting, so it's added last (outermost).
app.add_middleware(RateLimitMiddleware)
app.add_middleware(JWTMiddleware)

# Liveness probe — always 200 if the process is running (used by Docker HEALTHCHECK)
@app.get("/ping", tags=["Health"], include_in_schema=False)
async def ping():
    return {"status": "ok"}

# Readiness / dependency health check — 503 if DB or Redis are down
@app.get("/health", tags=["Health"])
async def health_check():
    """Check API and service health"""
    health_status = await healthcheck_service.check_health()
    if not health_status["status"] == "healthy":
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=health_status
        )
    return health_status

@app.get("/", tags=["Info"])
async def root():
    """API Root Information"""
    return {
        "name": "CloudMTA API",
        "version": "1.0.0",
        "description": "Professional Email MTA Server",
        "timestamp": datetime.utcnow().isoformat(),
        "docs": "/docs",
        "openapi": "/openapi.json"
    }

# Include routers
app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Authentication"]
)

app.include_router(
    users.router,
    prefix="/api/v1/users",
    tags=["Users"],
)

app.include_router(
    domains.router,
    prefix="/api/v1/domains",
    tags=["Domains"]
)

app.include_router(
    queues.router,
    prefix="/api/v1/queues",
    tags=["Queue Management"]
)

app.include_router(
    smtp.router,
    prefix="/api/v1/smtp",
    tags=["SMTP Settings"]
)

app.include_router(
    analytics.router,
    prefix="/api/v1/analytics",
    tags=["Analytics & Monitoring"]
)

app.include_router(
    suppressions.router,
    prefix="/api/v1/suppressions",
    tags=["Suppression List"]
)

app.include_router(
    reputation.router,
    prefix="/api/v1/reputation",
    tags=["Reputation Dashboard"]
)

app.include_router(
    send.router,
    prefix="/api/v1/send",
    tags=["HTTP Send API"]
)

# Global exception handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "status_code": 500,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
