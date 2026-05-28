"""Application services — health checks and shared utilities"""

import logging
from datetime import datetime

import redis as redis_lib
from sqlalchemy import text

from config import settings
from database import engine

logger = logging.getLogger(__name__)


class HealthcheckService:
    """Checks liveness of all critical dependencies."""

    async def check_health(self) -> dict:
        db_ok = self._check_database()
        redis_ok = self._check_redis()

        healthy = db_ok and redis_ok
        return {
            "status": "healthy" if healthy else "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {
                "database": "ok" if db_ok else "error",
                "redis": "ok" if redis_ok else "error",
            },
        }

    def _check_database(self) -> bool:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception as exc:
            logger.warning("Database health check failed: %s", exc)
            return False

    def _check_redis(self) -> bool:
        try:
            client = redis_lib.from_url(settings.REDIS_URL, socket_connect_timeout=2)
            client.ping()
            return True
        except Exception as exc:
            logger.warning("Redis health check failed: %s", exc)
            return False
