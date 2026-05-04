"""Configuration settings for CloudMTA Backend"""

from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    # API Settings
    API_TITLE: str = "CloudMTA API"
    API_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://cloudmta:CloudMTA2026!@localhost:5432/cloudmta_db"
    )
    
    # Redis
    REDIS_URL: str = os.getenv(
        "REDIS_URL",
        "redis://:Redis2026!@localhost:6379/0"
    )
    
    # SMTP Settings
    SMTP_HOSTNAME: str = os.getenv("SMTP_HOSTNAME", "mail.cloudmta.local")
    SMTP_PORT: int = 25
    SMTP_TLS_PORT: int = 587
    SMTP_SSL_PORT: int = 465
    SMTP_TIMEOUT: int = 30
    SMTP_MAX_CONNECTIONS: int = 1000
    SMTP_QUEUE_SIZE: int = 10000
    
    # IP Settings
    IPV4_ENABLED: bool = True
    IPV6_ENABLED: bool = True
    IP_ROTATION_ENABLED: bool = True
    IP_ROTATION_INTERVAL: int = 300  # seconds
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_SECOND: dict = {
        "default": 100,
        "auth": 5,
        "api": 1000
    }
    
    # CORS — reads comma-separated CORS_ORIGINS from .env (pydantic-settings v2
    # requires JSON arrays for list fields, so we parse it manually via os.getenv)
    CORS_ORIGINS: List[str] = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://localhost:8000,http://localhost,http://127.0.0.1:3000"
        ).split(",")
        if o.strip()
    ]
    
    # Email Validation
    EMAIL_VALIDATION_ENABLED: bool = True
    SPF_CHECK_ENABLED: bool = True
    DKIM_SIGNING_ENABLED: bool = True
    DMARC_CHECKING_ENABLED: bool = True
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Email Tracking (GreenArrow / SES-style)
    OPEN_TRACKING_ENABLED: bool = bool(int(os.getenv("OPEN_TRACKING_ENABLED", "0")))
    CLICK_TRACKING_ENABLED: bool = bool(int(os.getenv("CLICK_TRACKING_ENABLED", "0")))
    TRACKING_DOMAIN: str = os.getenv("TRACKING_DOMAIN", "")

    # IP Warmup (SES / GreenArrow)
    IP_WARMUP_ENABLED: bool = bool(int(os.getenv("IP_WARMUP_ENABLED", "1")))

    # Features
    BULK_EMAIL_ENABLED: bool = True
    DOMAIN_MANAGEMENT_ENABLED: bool = True
    API_ACCESS_CONTROL_ENABLED: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
