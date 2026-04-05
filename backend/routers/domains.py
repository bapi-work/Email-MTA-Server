"""Domains management router"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
import dns.resolver
from database import get_db, Domain, User, UserRole, DomainStatus
from schemas import DomainCreate, DomainUpdate, DomainResponse, DomainDetailResponse
from services import SPFService, DKIMService, DMARCService
from config import settings

router = APIRouter()

def get_current_user(request: Request, db: Session = Depends(get_db)):
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

@router.post("/", response_model=DomainResponse, status_code=status.HTTP_201_CREATED)
async def create_domain(
    request: DomainCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new domain"""
    
    # Check if domain already exists
    existing = db.query(Domain).filter(
        Domain.domain_name == request.domain_name
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain already registered"
        )
    
    # Create domain
    domain = Domain(
        domain_name=request.domain_name,
        owner_id=current_user.id,
        status=DomainStatus.VERIFICATION_PENDING
    )
    
    # Generate DKIM keys
    private_key, public_key = DKIMService.generate_dkim_keys()
    domain.dkim_private_key = private_key
    domain.dkim_public_key = public_key
    
    db.add(domain)
    db.commit()
    db.refresh(domain)
    
    return domain

@router.get("/", response_model=list[DomainResponse])
async def list_domains(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List user's domains"""
    
    domains = db.query(Domain).filter(
        Domain.owner_id == current_user.id
    ).offset(skip).limit(limit).all()
    
    return domains

@router.get("/{domain_id}", response_model=DomainDetailResponse)
async def get_domain(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get domain details"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    # Check ownership
    if domain.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    return domain

@router.patch("/{domain_id}", response_model=DomainResponse)
async def update_domain(
    domain_id: int,
    request: DomainUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update domain settings"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    # Check ownership
    if domain.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    # Update allowed fields
    for field, value in request.dict(exclude_unset=True).items():
        if value is not None:
            setattr(domain, field, value)
    
    db.commit()
    db.refresh(domain)
    
    return domain

@router.delete("/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a domain"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    # Check ownership
    if domain.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    db.delete(domain)
    db.commit()

@router.get("/{domain_id}/verify-dns")
async def verify_dns_records(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify DNS records for domain"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    # Check ownership
    if domain.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    verification_status = {
        "spf": {"verified": False, "record": None},
        "dkim": {"verified": False, "public_key": domain.dkim_public_key},
        "dmarc": {"verified": False, "record": None}
    }
    
    try:
        # Check SPF
        if domain.spf_record:
            try:
                answers = dns.resolver.resolve(domain.domain_name, 'TXT')
                for rdata in answers:
                    if rdata.to_text().startswith('"v=spf1'):
                        domain.spf_verified = True
                        verification_status["spf"]["verified"] = True
                        domain.spf_verified_at = func.now()
                        break
            except:
                pass
        
        # Check DKIM
        if domain.dkim_public_key:
            dkim_host = f"{domain.dkim_selector}._domainkey.{domain.domain_name}"
            try:
                answers = dns.resolver.resolve(dkim_host, 'TXT')
                if answers:
                    verification_status["dkim"]["verified"] = True
            except:
                pass
        
        db.commit()
        return verification_status
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"DNS verification failed: {str(e)}"
        )

@router.post("/{domain_id}/generate-spf")
async def generate_spf_record(
    domain_id: int,
    include_domains: list = None,
    ips: list = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate SPF record for domain"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    if domain.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    # Generate SPF record
    spf_record = SPFService.generate_spf_record(
        domain.domain_name,
        include_domains=include_domains or [settings.SMTP_HOSTNAME],
        ips=ips
    )
    
    domain.spf_record = spf_record
    db.commit()
    db.refresh(domain)
    
    return {
        "spf_record": spf_record,
        "instructions": f"Add the following TXT record to your DNS: {spf_record}"
    }

@router.post("/{domain_id}/generate-dmarc")
async def generate_dmarc_record(
    domain_id: int,
    policy: str = "none",
    rua_email: str = None,
    ruf_email: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate DMARC record for domain"""
    
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    if domain.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this domain"
        )
    
    # Generate DMARC record
    dmarc_record = DMARCService.generate_dmarc_record(
        policy=policy,
        rua_email=rua_email,
        ruf_email=ruf_email
    )
    
    domain.dmarc_policy = policy
    if rua_email:
        domain.dmarc_rua_email = rua_email
    if ruf_email:
        domain.dmarc_ruf_email = ruf_email
    domain.dmarc_enabled = True
    
    db.commit()
    db.refresh(domain)
    
    return {
        "dmarc_record": dmarc_record,
        "instructions": f"Add the following TXT record as _dmarc.{domain.domain_name}: {dmarc_record}"
    }
