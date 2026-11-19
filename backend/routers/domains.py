"""Domains management router"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
import re
import dns.resolver
from database import get_db, Domain, User, UserRole, DomainStatus
from schemas import DomainCreate, DomainUpdate, DomainResponse, DomainDetailResponse, DomainOwnerAssign
from services import SPFService, DKIMService, DMARCService
from config import settings

router = APIRouter()

_DOMAIN_RE = re.compile(r"^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$")


def _normalize_domain_name(name: str) -> str:
    name = (name or "").strip().lower().rstrip(".")
    if not _DOMAIN_RE.match(name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid domain name")
    return name


def _dkim_key_body(pem: str) -> str:
    """Base64 body of a PEM public key — the value that goes after p= in DNS."""
    if not pem:
        return ""
    lines = [l.strip() for l in pem.strip().splitlines() if l.strip() and not l.startswith("-----")]
    return "".join(lines)


def _dkim_txt_key(txt: str) -> str:
    for part in txt.split(";"):
        key, _, value = part.strip().partition("=")
        if key.strip() == "p":
            return re.sub(r"\s+", "", value)
    return ""


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

    # Normalise so "Example.COM" and "example.com" can't be registered twice
    # by different tenants (SMTP lookups compare lowercase names).
    request.domain_name = _normalize_domain_name(request.domain_name)

    # Check if domain already exists
    existing = db.query(Domain).filter(
        func.lower(Domain.domain_name) == request.domain_name
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain already registered"
        )

    # Admins may create a domain directly under another user via owner_id
    owner_id = current_user.id
    if request.owner_id is not None:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin can assign a domain to another user"
            )
        target_owner = db.query(User).filter(User.id == request.owner_id).first()
        if not target_owner:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target user not found"
            )
        owner_id = target_owner.id

    # Create domain
    domain = Domain(
        domain_name=request.domain_name,
        owner_id=owner_id,
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
    """List domains — admins see all domains, other users see only their own"""

    query = db.query(Domain)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Domain.owner_id == current_user.id)

    domains = query.offset(skip).limit(limit).all()

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
    
    # status and sending limits are admin-controlled: letting an owner set
    # status="active" would skip DNS verification entirely (the SMTP relay
    # trusts status='active'), and raising limits would skip throttling.
    ADMIN_ONLY_FIELDS = {"status", "rate_limit_per_second", "daily_limit"}
    updates = request.dict(exclude_unset=True)
    if current_user.role != UserRole.ADMIN:
        forbidden = ADMIN_ONLY_FIELDS.intersection(k for k, v in updates.items() if v is not None)
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only admin can change: {', '.join(sorted(forbidden))}"
            )

    if updates.get("status") is not None:
        if updates["status"] not in {s.value for s in DomainStatus}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid domain status")
        domain.is_verified = updates["status"] == DomainStatus.ACTIVE.value

    for field, value in updates.items():
        if value is not None:
            setattr(domain, field, value)
    
    db.commit()
    db.refresh(domain)
    
    return domain

@router.post("/{domain_id}/assign", response_model=DomainResponse)
async def assign_domain_owner(
    domain_id: int,
    request: DomainOwnerAssign,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Assign (reassign) a domain to a different user (admin only)"""

    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin can assign domains to users"
        )

    domain = db.query(Domain).filter(Domain.id == domain_id).first()

    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )

    new_owner = db.query(User).filter(User.id == request.owner_id).first()

    if not new_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user not found"
        )

    domain.owner_id = new_owner.id
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
        # Check SPF (required — marks domain verified/active when present)
        try:
            answers = dns.resolver.resolve(domain.domain_name, 'TXT')
            for rdata in answers:
                txt = rdata.to_text().strip('"')
                if txt.startswith('v=spf1'):
                    domain.spf_verified = True
                    domain.spf_record = txt
                    domain.spf_verified_at = func.now()
                    verification_status["spf"]["verified"] = True
                    verification_status["spf"]["record"] = txt
                    break
        except Exception:
            pass

        # Check DKIM — the TXT record must contain the exact public key we
        # generated for THIS domain. That key is unique, so publishing it is
        # proof the requester controls the domain's DNS. (An SPF record alone
        # proves nothing: gmail.com has one, so anyone could "verify" it.)
        expected_key = _dkim_key_body(domain.dkim_public_key)
        if expected_key:
            dkim_host = f"{domain.dkim_selector or 'default'}._domainkey.{domain.domain_name}"
            try:
                answers = dns.resolver.resolve(dkim_host, 'TXT')
                for rdata in answers:
                    txt = b"".join(rdata.strings).decode(errors="ignore")
                    if _dkim_txt_key(txt) == expected_key:
                        verification_status["dkim"]["verified"] = True
                        break
            except Exception:
                pass

        # Domain becomes active only when SPF exists AND the DKIM key matches.
        if verification_status["spf"]["verified"] and verification_status["dkim"]["verified"]:
            domain.status = DomainStatus.ACTIVE
            domain.is_verified = True
        verification_status["ownership_verified"] = bool(domain.is_verified)

        # Check DMARC (optional)
        try:
            dmarc_host = f"_dmarc.{domain.domain_name}"
            answers = dns.resolver.resolve(dmarc_host, 'TXT')
            for rdata in answers:
                txt = rdata.to_text().strip('"')
                if txt.startswith('v=DMARC1'):
                    verification_status["dmarc"]["verified"] = True
                    verification_status["dmarc"]["record"] = txt
                    break
        except Exception:
            pass

        db.commit()
        return verification_status

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="DNS verification failed"
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
