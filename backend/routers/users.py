"""Users management router"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
import secrets
import bcrypt
from database import get_db, User, UserRole, Domain, DomainStatus
from schemas import (
    UserResponse, APIKeyResponse, APIKeyCreate, RegisterRequest, DomainResponse,
    AddDomainToUserRequest, SMTPCredentialsResponse, SMTPCredentialsStatus
)
from services import DKIMService
from config import settings
from config import settings

router = APIRouter()

def get_current_user(request: Request, db: Session = Depends(get_db)):
    """Dependency to get current user"""
    user_id = getattr(request.state, 'user_id', None)
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user

def is_admin(current_user: User = Depends(get_current_user)):
    """Dependency to check if user is admin"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: RegisterRequest,
    current_user: User = Depends(is_admin),
    db: Session = Depends(get_db)
):
    """Create a new user (admin only)"""
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    if db.query(User).filter(User.username == request.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")

    user = User(
        username=request.username,
        email=request.email,
        hashed_password=_hash_password(request.password),
        full_name=request.full_name,
        role=UserRole.USER,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/", response_model=list[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_user: User = Depends(is_admin),
    db: Session = Depends(get_db)
):
    """List all users (admin only)"""
    
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user details"""
    
    # Users can only view their own profile unless they're admin
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own profile"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user

@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    update_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user details"""
    
    # Users can only update their own profile unless they're admin
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own profile"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Only admin can change role
    if "role" in update_data and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin can change user role"
        )
    
    # Check for email uniqueness if email is being changed
    if "email" in update_data:
        existing_user = db.query(User).filter(
            (User.email == update_data["email"]) & (User.id != user.id)
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
    
    # Check for username uniqueness if username is being changed
    if "username" in update_data:
        existing_user = db.query(User).filter(
            (User.username == update_data["username"]) & (User.id != user.id)
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already in use"
            )
    
    # Update allowed fields
    allowed_fields = ["full_name", "rate_limit_per_second", "username", "email"]
    if current_user.role == UserRole.ADMIN:
        allowed_fields.extend(["is_active", "role"])
    
    for field, value in update_data.items():
        if field in allowed_fields:
            setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: User = Depends(is_admin),
    db: Session = Depends(get_db)
):
    """Delete user (admin only)"""
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own user account"
        )
    
    db.delete(user)
    db.commit()

@router.post("/{user_id}/api-key", response_model=APIKeyResponse)
async def create_api_key(
    user_id: int,
    request_data: APIKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create API key for user"""
    
    # Users can only create keys for themselves unless they're admin
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create API keys for yourself"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Generate API key
    api_key = f"cloudmta_{secrets.token_urlsafe(32)}"
    
    user.api_key = api_key
    user.api_key_created_at = func.now()
    
    db.commit()
    db.refresh(user)
    
    return APIKeyResponse(
        api_key=api_key,
        created_at=user.api_key_created_at,
        description=request_data.description
    )

@router.get("/{user_id}/api-key", response_model=dict)
async def get_api_key(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's API key"""
    
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own API key"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user.api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No API key found"
        )
    
    return {
        "api_key": user.api_key,
        "created_at": user.api_key_created_at
    }

@router.delete("/{user_id}/api-key", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke user's API key"""
    
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only revoke your own API key"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.api_key = None
    user.api_key_created_at = None
    
    db.commit()

def _smtp_ports() -> dict:
    return {
        "smtp": settings.SMTP_PORT,
        "submission_starttls": settings.SMTP_TLS_PORT,
        "smtps": settings.SMTP_SSL_PORT,
    }

@router.post("/{user_id}/smtp-credentials", response_model=SMTPCredentialsResponse)
async def generate_smtp_credentials(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate (or rotate) this user's SMTP send credentials.

    Distinct from the dashboard login password — these are what gets typed
    into an email client / app's SMTP config to authenticate and relay mail
    through the server. Self-service: a user may generate their own, and an
    admin may generate one for any user."""

    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage your own SMTP credentials"
        )

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    smtp_password = secrets.token_urlsafe(24)
    user.smtp_password = _hash_password(smtp_password)
    user.smtp_password_created_at = func.now()

    db.commit()
    db.refresh(user)

    return SMTPCredentialsResponse(
        smtp_username=user.username,
        smtp_password=smtp_password,
        smtp_host=settings.SMTP_HOSTNAME,
        ports=_smtp_ports(),
        created_at=user.smtp_password_created_at
    )

@router.get("/{user_id}/smtp-credentials", response_model=SMTPCredentialsStatus)
async def get_smtp_credentials_status(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check whether SMTP credentials exist for a user (never returns the password)."""

    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own SMTP credentials"
        )

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return SMTPCredentialsStatus(
        configured=bool(user.smtp_password),
        smtp_username=user.username,
        smtp_host=settings.SMTP_HOSTNAME,
        ports=_smtp_ports(),
        created_at=user.smtp_password_created_at
    )

@router.delete("/{user_id}/smtp-credentials", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_smtp_credentials(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke a user's SMTP send credentials."""

    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only revoke your own SMTP credentials"
        )

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.smtp_password = None
    user.smtp_password_created_at = None
    db.commit()

@router.get("/{user_id}/domains", response_model=list[DomainResponse])
async def get_user_domains(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's domains"""
    
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own domains"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user.domains

@router.post("/{user_id}/domains", response_model=DomainResponse, status_code=status.HTTP_201_CREATED)
async def add_domain_to_user(
    user_id: int,
    request: AddDomainToUserRequest,
    current_user: User = Depends(is_admin),
    db: Session = Depends(get_db)
):
    """Attach a domain to a user (admin only) — either creates a new domain
    owned by the user, or reassigns an existing domain (by domain_id) to them."""

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if request.domain_id is not None:
        domain = db.query(Domain).filter(Domain.id == request.domain_id).first()
        if not domain:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Domain not found"
            )
        domain.owner_id = user.id
        db.commit()
        db.refresh(domain)
        return domain

    if request.domain_name:
        existing = db.query(Domain).filter(Domain.domain_name == request.domain_name).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Domain already registered"
            )

        domain = Domain(
            domain_name=request.domain_name,
            owner_id=user.id,
            status=DomainStatus.VERIFICATION_PENDING
        )
        private_key, public_key = DKIMService.generate_dkim_keys()
        domain.dkim_private_key = private_key
        domain.dkim_public_key = public_key

        db.add(domain)
        db.commit()
        db.refresh(domain)
        return domain

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Either domain_id or domain_name must be provided"
    )
