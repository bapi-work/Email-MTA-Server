"""Authentication router"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import jwt
import bcrypt
from database import get_db, User, UserRole
from schemas import LoginRequest, LoginResponse, RegisterRequest, UserResponse
from config import settings
from services import AuthenticationService

router = APIRouter()

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash"""
    return bcrypt.checkpw(password.encode(), hashed.encode())

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user"""
    
    # Check if user already exists
    existing_user = db.query(User).filter(
        (User.email == request.email) | (User.username == request.username)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username already registered"
        )
    
    # Create new user
    user = User(
        username=request.username,
        email=request.email,
        hashed_password=hash_password(request.password),
        full_name=request.full_name,
        role=UserRole.USER,
        is_active=True
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login user and return access token"""
    
    # Find user by email
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )
    
    # Generate access token
    access_token = await AuthenticationService.create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    
    # Generate refresh token (longer expiry)
    refresh_expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_payload = {
        "sub": str(user.id),
        "email": user.email,
        "type": "refresh",
        "exp": refresh_expire
    }
    refresh_token = jwt.encode(
        refresh_payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

@router.post("/refresh", response_model=LoginResponse)
async def refresh_token(request: dict, db: Session = Depends(get_db)):
    """Refresh access token using refresh token"""
    
    refresh_token = request.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh token required"
        )
    
    try:
        payload = jwt.decode(
            refresh_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("sub")
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Generate new access token
        access_token = await AuthenticationService.create_access_token(
            user_id=user.id,
            email=user.email,
            role=user.role
        )
        
        # Generate new refresh token
        refresh_expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        refresh_payload = {
            "sub": str(user.id),
            "email": user.email,
            "type": "refresh",
            "exp": refresh_expire
        }
        new_refresh_token = jwt.encode(
            refresh_payload,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        
        return LoginResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user(request: Request, db: Session = Depends(get_db)):
    """Get current authenticated user"""
    
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

@router.post("/change-password")
async def change_password(
    request: Request,
    db: Session = Depends(get_db)
):
    """Change user password"""
    request_data = await request.json()
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
    
    # Verify current password
    current_password = request_data.get("current_password")
    new_password = request_data.get("new_password")
    
    if not current_password or not new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password and new password are required"
        )
    
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters"
        )
    
    # Update password
    user.hashed_password = hash_password(new_password)
    db.commit()
    db.refresh(user)
    
    return {"message": "Password changed successfully", "user": UserResponse.from_orm(user)}

@router.post("/change-email")
async def change_email(
    request: Request,
    db: Session = Depends(get_db)
):
    """Change user email"""
    request_data = await request.json()
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
    
    new_email = request_data.get("new_email")
    
    if not new_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New email is required"
        )
    
    # Check if email already exists
    existing_user = db.query(User).filter(
        (User.email == new_email) & (User.id != user.id)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already in use"
        )
    
    # Update email
    user.email = new_email
    db.commit()
    db.refresh(user)
    
    return {"message": "Email changed successfully", "user": UserResponse.from_orm(user)}

@router.put("/me/profile")
async def update_profile(
    request: Request,
    db: Session = Depends(get_db)
):
    """Update the current user's profile (email, username, full_name)"""
    request_data = await request.json()
    user_id = getattr(request.state, 'user_id', None)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    new_email = request_data.get("email")
    new_username = request_data.get("username")
    full_name = request_data.get("full_name")

    if new_email and new_email != user.email:
        existing = db.query(User).filter(
            (User.email == new_email) & (User.id != user.id)
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
        user.email = new_email

    if new_username and new_username != user.username:
        existing = db.query(User).filter(
            (User.username == new_username) & (User.id != user.id)
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        user.username = new_username

    if full_name is not None:
        user.full_name = full_name

    db.commit()
    db.refresh(user)

    return {"message": "Profile updated successfully", "user": UserResponse.from_orm(user)}
