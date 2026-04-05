"""JWT and authentication middleware"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import jwt
import logging
from datetime import datetime
from config import settings

logger = logging.getLogger(__name__)

class JWTMiddleware(BaseHTTPMiddleware):
    """Middleware to validate JWT tokens on protected routes"""
    
    # Public routes that don't require authentication
    PUBLIC_ROUTES = {
        "/health",
        "/docs",
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
    """Rate limiting middleware"""
    
    async def dispatch(self, request: Request, call_next):
        # Rate limiting logic would go here
        return await call_next(request)
