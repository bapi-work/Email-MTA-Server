"""SMTP settings router"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db, User, Domain
from schemas import SMTPSettingsResponse, AuthenticationSettingsResponse
from config import settings

router = APIRouter()

def get_current_user(request, db: Session = Depends(get_db)):
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

@router.get("/config", response_model=SMTPSettingsResponse)
async def get_smtp_settings(
    current_user: User = Depends(get_current_user)
):
    """Get SMTP server configuration"""
    
    return SMTPSettingsResponse(
        hostname=settings.SMTP_HOSTNAME,
        ports={
            "smtp": settings.SMTP_PORT,
            "submission": settings.SMTP_TLS_PORT,
            "smtps": settings.SMTP_SSL_PORT
        },
        max_connections=settings.SMTP_MAX_CONNECTIONS,
        timeout=settings.SMTP_TIMEOUT,
        queue_size=settings.SMTP_QUEUE_SIZE,
        ipv4_enabled=settings.IPV4_ENABLED,
        ipv6_enabled=settings.IPV6_ENABLED,
        ip_rotation_enabled=settings.IP_ROTATION_ENABLED
    )

@router.get("/authentication", response_model=AuthenticationSettingsResponse)
async def get_authentication_settings(
    current_user: User = Depends(get_current_user)
):
    """Get email authentication configuration"""
    
    return AuthenticationSettingsResponse(
        spf_enabled=settings.SPF_CHECK_ENABLED,
        dkim_enabled=settings.DKIM_SIGNING_ENABLED,
        dmarc_enabled=settings.DMARC_CHECKING_ENABLED,
        spf_check_enabled=settings.SPF_CHECK_ENABLED,
        dkim_signing_enabled=settings.DKIM_SIGNING_ENABLED
    )

@router.post("/test-connection/{domain_id}")
async def test_smtp_connection(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Test SMTP connection for a domain"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    if domain.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    # Test connection logic
    try:
        import smtplib
        import socket
        
        smtp = smtplib.SMTP(settings.SMTP_HOSTNAME, settings.SMTP_PORT, timeout=5)
        smtp.quit()
        
        return {
            "status": "connected",
            "server": settings.SMTP_HOSTNAME,
            "port": settings.SMTP_PORT,
            "message": "Successfully connected to SMTP server"
        }
    except socket.timeout:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="Connection to SMTP server timed out"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to SMTP server: {str(e)}"
        )

@router.post("/test-authentication/{domain_id}")
async def test_authentication(
    domain_id: int,
    test_email: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Test email authentication settings"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    if domain.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    results = {
        "domain": domain.domain_name,
        "spf": {
            "enabled": settings.SPF_CHECK_ENABLED,
            "status": "configured" if domain.spf_verified else "pending",
            "verified": domain.spf_verified
        },
        "dkim": {
            "enabled": domain.dkim_enabled,
            "signing_enabled": domain.dkim_signing_enabled,
            "selector": domain.dkim_selector,
            "key_present": bool(domain.dkim_private_key)
        },
        "dmarc": {
            "enabled": domain.dmarc_enabled,
            "policy": domain.dmarc_policy,
            "rua_email": domain.dmarc_rua_email
        }
    }
    
    return results

@router.get("/domains/{domain_id}/ip-pool")
async def get_domain_ip_pool(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get IP pool for a domain"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    if domain.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    return {
        "domain": domain.domain_name,
        "ipv4": {
            "enabled": settings.IPV4_ENABLED,
            "addresses": domain.authorized_ipv4 or current_user.ipv4_addresses or [],
            "rotation_enabled": settings.IP_ROTATION_ENABLED
        },
        "ipv6": {
            "enabled": settings.IPV6_ENABLED,
            "addresses": domain.authorized_ipv6 or current_user.ipv6_addresses or [],
            "rotation_enabled": settings.IP_ROTATION_ENABLED
        }
    }

@router.post("/domains/{domain_id}/add-ip")
async def add_ip_to_domain(
    domain_id: int,
    ip_address: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add IP address to domain's authorized pool"""
    
    import ipaddress
    
    # Validate IP address
    try:
        ip_obj = ipaddress.ip_address(ip_address)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid IP address format"
        )
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    if domain.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    # Add to appropriate list
    if isinstance(ip_obj, ipaddress.IPv4Address):
        if ip_address not in domain.authorized_ipv4:
            domain.authorized_ipv4.append(ip_address)
    else:
        if ip_address not in domain.authorized_ipv6:
            domain.authorized_ipv6.append(ip_address)
    
    db.commit()
    db.refresh(domain)
    
    return {
        "message": f"IP {ip_address} added successfully",
        "ipv4": domain.authorized_ipv4,
        "ipv6": domain.authorized_ipv6
    }
