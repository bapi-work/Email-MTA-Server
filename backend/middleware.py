"""JWT and authentication middleware"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import jwt
import logging
import time
import redis
from datetime import datetime
from config import settings

logger = logging.getLogger(__name__)

class JWTMiddleware(BaseHTTPMiddleware):
    """Middleware to validate JWT tokens on protected routes"""
    
    # Public routes that don't require authentication
    PUBLIC_ROUTES = {
        "/ping",
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/refresh",
    }
    
    async def dispatch(self, request: Request, call_next):
        # Allow CORS preflight requests through without auth
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check if route requires authentication
        if any(request.url.path.startswith(route) for route in self.PUBLIC_ROUTES):
            return await call_next(request)
        
        # Get token from header
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"error": "Missing authorization header"}
            )
        
        try:
            scheme, token = auth_header.split()
            if scheme.lower() != "bearer":
                return JSONResponse(
                    status_code=401,
                    content={"error": "Invalid authorization scheme"}
                )
            
            # Validate token
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM]
            )
            
            # Store user info in request state
            request.state.user_id = int(payload.get("sub"))
            request.state.user_email = payload.get("email")
            request.state.user_role = payload.get("role")
            
        except jwt.ExpiredSignatureError:
            return JSONResponse(
                status_code=401,
                content={"error": "Token has expired"}
            )
        except jwt.InvalidTokenError:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid token"}
            )
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid authorization header"}
            )
        
        return await call_next(request)

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed-window per-second rate limiting, backed by Redis so it's shared
    across all backend replicas/workers. This is a second line of defense —
    nginx already throttles the public-facing auth endpoints — for anyone
    hitting the backend directly (e.g. the dev-compose port 8000 mapping)."""

    _redis_client = None

    def _get_redis(self):
        if RateLimitMiddleware._redis_client is None:
            RateLimitMiddleware._redis_client = redis.from_url(
                settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2
            )
        return RateLimitMiddleware._redis_client

    def _bucket_for(self, path: str) -> str:
        if path.startswith("/api/v1/auth/"):
            return "auth"
        if path.startswith("/api/"):
            return "api"
        return "default"

    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED or request.method == "OPTIONS":
            return await call_next(request)

        bucket = self._bucket_for(request.url.path)
        limit = settings.RATE_LIMIT_PER_SECOND.get(bucket, settings.RATE_LIMIT_PER_SECOND.get("default", 100))

        # Prefer the authenticated user (set by JWTMiddleware, which must run
        # before this middleware) so limits are per-account; fall back to the
        # client IP for unauthenticated requests like /auth/login.
        identity = getattr(request.state, "user_id", None) or (request.client.host if request.client else "unknown")
        window = int(time.time())
        key = f"ratelimit:{bucket}:{identity}:{window}"

        try:
            r = self._get_redis()
            count = r.incr(key)
            if count == 1:
                r.expire(key, 2)
        except Exception as e:
            # Redis unavailable — fail open rather than blocking all traffic.
            logger.warning(f"Rate limiter unavailable, allowing request: {e}")
            return await call_next(request)

        if count > limit:
            return JSONResponse(
                status_code=429,
                content={"error": "Too many requests, please slow down"},
                headers={"Retry-After": "1"}
            )

        return await call_next(request)
