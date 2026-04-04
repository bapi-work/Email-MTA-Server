"""
CloudMTA - Professional Email MTA Server
Main FastAPI Application
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from config import settings
from database import engine, Base, get_db
from routers import users, domains, queues, smtp, analytics, auth
from middleware import JWTMiddleware
from services import HealthcheckService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize services
healthcheck_service = HealthcheckService()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("CloudMTA Backend Starting...")
    try:
        # Create database tables
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
    
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
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add custom JWT middleware
app.add_middleware(JWTMiddleware)

# Health check endpoint (no auth required)
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
