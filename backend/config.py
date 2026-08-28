"""Configuration settings for CloudMTA Backend"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import os

class Settings(BaseSettings):
    # API Settings
    API_TITLE: str = "CloudMTA API"
    API_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
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
    
    # CORS origins are stored as a comma-separated string so .env can stay simple.
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:8000,http://localhost,http://127.0.0.1:3000"
    )
    
    # Email Validation
    EMAIL_VALIDATION_ENABLED: bool = True
    SPF_CHECK_ENABLED: bool = True
    DKIM_SIGNING_ENABLED: bool = True
    DMARC_CHECKING_ENABLED: bool = True
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Email Tracking (GreenArrow / SES-style)
    OPEN_TRACKING_ENABLED: bool = False
    CLICK_TRACKING_ENABLED: bool = False
    TRACKING_DOMAIN: str = os.getenv("TRACKING_DOMAIN", "")

    # IP Warmup (SES / GreenArrow)
    IP_WARMUP_ENABLED: bool = True

    # Default admin account — only used to seed the very first admin user
    # when no admin exists yet (e.g. a brand-new database). Never used to
    # overwrite an existing admin's password.
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@yourdomain.com")
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "CloudMTA2026!")

    # Features
    BULK_EMAIL_ENABLED: bool = True
    DOMAIN_MANAGEMENT_ENABLED: bool = True
    API_ACCESS_CONTROL_ENABLED: bool = True

    @field_validator(
        "DEBUG",
        "IPV4_ENABLED",
        "IPV6_ENABLED",
        "IP_ROTATION_ENABLED",
        "RATE_LIMIT_ENABLED",
        "EMAIL_VALIDATION_ENABLED",
        "SPF_CHECK_ENABLED",
        "DKIM_SIGNING_ENABLED",
        "DMARC_CHECKING_ENABLED",
        "OPEN_TRACKING_ENABLED",
        "CLICK_TRACKING_ENABLED",
        "IP_WARMUP_ENABLED",
        "BULK_EMAIL_ENABLED",
        "DOMAIN_MANAGEMENT_ENABLED",
        "API_ACCESS_CONTROL_ENABLED",
        mode="before",
    )
    @classmethod
    def parse_bool(cls, value):
        """Accept common env bool formats and treat release/prod labels as false."""
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "y", "on"}:
                return True
            if normalized in {"0", "false", "no", "n", "off", "", "release", "prod", "production"}:
                return False
        return value

    @property
    def cors_origins(self) -> List[str]:
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
