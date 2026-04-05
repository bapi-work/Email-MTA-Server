"""SMTP settings router — full configuration management"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db, User, Domain, RoutingRule, Webhook
from schemas import SMTPSettingsResponse, AuthenticationSettingsResponse
from config import settings
import ipaddress
import socket
import urllib.request
import urllib.error
import json
import smtplib
import secrets
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# ─────────────────────────────────────────────
#  Dependency: current user
# ─────────────────────────────────────────────
def get_current_user(request: Request, db: Session = Depends(get_db)):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# ─────────────────────────────────────────────
#  Helper: detect public IP
# ─────────────────────────────────────────────
def _detect_public_ipv4() -> str:
    """Attempt to detect the server's public IPv4 address."""
    services = [
        "https://api.ipify.org",
        "https://ipv4.icanhazip.com",
        "https://checkip.amazonaws.com",
    ]
    for url in services:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CloudMTA/1.0"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                ip = resp.read().decode().strip()
                ipaddress.IPv4Address(ip)
                return ip
        except Exception:
            continue
    return ""


def _detect_public_ipv6() -> str:
    """Attempt to detect the server's public IPv6 address."""
    services = [
        "https://api6.ipify.org",
        "https://ipv6.icanhazip.com",
    ]
    for url in services:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CloudMTA/1.0"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                ip = resp.read().decode().strip()
                ipaddress.IPv6Address(ip)
                return ip
        except Exception:
            continue
    return ""


def _get_hostname() -> str:
    try:
        return socket.getfqdn()
    except Exception:
        return settings.SMTP_HOSTNAME


# ─────────────────────────────────────────────
#  Server Info  (public IPs, hostname, version)
# ─────────────────────────────────────────────
@router.get("/server-info")
async def get_server_info(current_user: User = Depends(get_current_user)):
    """Return live server networking info including public IPs."""
    ipv4 = _detect_public_ipv4()
    ipv6 = _detect_public_ipv6()
    hostname = _get_hostname()

    return {
        "hostname": hostname,
        "configured_hostname": settings.SMTP_HOSTNAME,
        "public_ipv4": ipv4,
        "public_ipv6": ipv6,
        "ports": {
            "smtp": settings.SMTP_PORT,
            "submission": settings.SMTP_TLS_PORT,
            "smtps": settings.SMTP_SSL_PORT,
        },
        "version": "CloudMTA 1.0.0",
    }


# ─────────────────────────────────────────────
#  SMTP Config GET / PUT
# ─────────────────────────────────────────────
@router.get("/config")
async def get_smtp_settings(current_user: User = Depends(get_current_user)):
    """Get full SMTP server configuration."""
    return {
        "hostname": settings.SMTP_HOSTNAME,
        "ports": {
            "smtp": settings.SMTP_PORT,
            "submission": settings.SMTP_TLS_PORT,
            "smtps": settings.SMTP_SSL_PORT,
        },
        "max_connections": settings.SMTP_MAX_CONNECTIONS,
        "timeout": settings.SMTP_TIMEOUT,
        "queue_size": settings.SMTP_QUEUE_SIZE,
        "ipv4_enabled": settings.IPV4_ENABLED,
        "ipv6_enabled": settings.IPV6_ENABLED,
        "ip_rotation_enabled": settings.IP_ROTATION_ENABLED,
        "ip_rotation_interval": settings.IP_ROTATION_INTERVAL,
        "rate_limit_enabled": settings.RATE_LIMIT_ENABLED,
        "rate_limit_per_second": settings.RATE_LIMIT_PER_SECOND,
        "bulk_email_enabled": settings.BULK_EMAIL_ENABLED,
    }


@router.put("/config")
async def update_smtp_settings(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
):
    """
    Update SMTP runtime settings.
    Only admins may change these settings.
    Values are applied in-memory; for persistence, update the environment/.env file.
    """
    if current_user.role not in ("admin",):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")

    allowed = {
        "max_connections", "timeout", "queue_size",
        "ipv4_enabled", "ipv6_enabled",
        "ip_rotation_enabled", "ip_rotation_interval",
        "rate_limit_enabled",
    }

    updated = {}
    for key, value in body.items():
        if key in allowed:
            attr = key.upper()
            if hasattr(settings, attr):
                setattr(settings, attr, value)
                updated[key] = value

    return {"message": "Settings updated (runtime only)", "updated": updated}


# ─────────────────────────────────────────────
#  Authentication Settings GET / PUT
# ─────────────────────────────────────────────
@router.get("/authentication")
async def get_authentication_settings(current_user: User = Depends(get_current_user)):
    """Get email authentication settings (SPF / DKIM / DMARC)."""
    return {
        "spf_enabled": settings.SPF_CHECK_ENABLED,
        "dkim_enabled": settings.DKIM_SIGNING_ENABLED,
        "dmarc_enabled": settings.DMARC_CHECKING_ENABLED,
        "spf_check_enabled": settings.SPF_CHECK_ENABLED,
        "dkim_signing_enabled": settings.DKIM_SIGNING_ENABLED,
    }


@router.put("/authentication")
async def update_authentication_settings(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
):
    """Update email authentication settings."""
    if current_user.role not in ("admin",):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")

    mapping = {
        "spf_enabled": "SPF_CHECK_ENABLED",
        "dkim_enabled": "DKIM_SIGNING_ENABLED",
        "dmarc_enabled": "DMARC_CHECKING_ENABLED",
    }

    updated = {}
    for key, attr in mapping.items():
        if key in body:
            setattr(settings, attr, bool(body[key]))
            updated[key] = bool(body[key])

    return {"message": "Authentication settings updated", "updated": updated}


# ─────────────────────────────────────────────
#  IP Pool — global (user-level)
# ─────────────────────────────────────────────
@router.get("/ip-pool")
async def get_global_ip_pool(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the global IP pool for the current user."""
    user = db.query(User).filter(User.id == current_user.id).first()
    public_ipv4 = _detect_public_ipv4()
    public_ipv6 = _detect_public_ipv6()

    # Merge detected public IP with any user-defined IPs
    ipv4_list = list(user.ipv4_addresses or [])
    ipv6_list = list(user.ipv6_addresses or [])

    if public_ipv4 and public_ipv4 not in ipv4_list:
        ipv4_list.insert(0, public_ipv4)  # prepend detected

    return {
        "detected_ipv4": public_ipv4,
        "detected_ipv6": public_ipv6,
        "ipv4": ipv4_list,
        "ipv6": ipv6_list,
        "rotation_enabled": settings.IP_ROTATION_ENABLED,
        "rotation_strategy": "round_robin",
        "rotation_interval_seconds": settings.IP_ROTATION_INTERVAL,
    }


@router.post("/ip-pool/add")
async def add_to_global_ip_pool(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add an IP address to the user's global pool."""
    ip_str = body.get("ip_address", "").strip()
    if not ip_str:
        raise HTTPException(status_code=400, detail="ip_address is required")

    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid IP address: {ip_str}")

    user = db.query(User).filter(User.id == current_user.id).first()
    ipv4_list = list(user.ipv4_addresses or [])
    ipv6_list = list(user.ipv6_addresses or [])

    if isinstance(ip_obj, ipaddress.IPv4Address):
        if ip_str in ipv4_list:
            raise HTTPException(status_code=400, detail="IP already in pool")
        ipv4_list.append(ip_str)
        user.ipv4_addresses = ipv4_list
    else:
        if ip_str in ipv6_list:
            raise HTTPException(status_code=400, detail="IP already in pool")
        ipv6_list.append(ip_str)
        user.ipv6_addresses = ipv6_list

    db.commit()
    return {"message": f"IP {ip_str} added to pool", "ipv4": ipv4_list, "ipv6": ipv6_list}


@router.delete("/ip-pool/{ip_address:path}")
async def remove_from_global_ip_pool(
    ip_address: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove an IP address from the user's global pool."""
    user = db.query(User).filter(User.id == current_user.id).first()
    ipv4_list = list(user.ipv4_addresses or [])
    ipv6_list = list(user.ipv6_addresses or [])

    if ip_address in ipv4_list:
        ipv4_list.remove(ip_address)
        user.ipv4_addresses = ipv4_list
    elif ip_address in ipv6_list:
        ipv6_list.remove(ip_address)
        user.ipv6_addresses = ipv6_list
    else:
        raise HTTPException(status_code=404, detail="IP not found in pool")

    db.commit()
    return {"message": f"IP {ip_address} removed", "ipv4": ipv4_list, "ipv6": ipv6_list}


# ─────────────────────────────────────────────
#  Domain-level IP pool
# ─────────────────────────────────────────────
@router.get("/domains/{domain_id}/ip-pool")
async def get_domain_ip_pool(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if domain.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    detected_ipv4 = _detect_public_ipv4()
    ipv4_pool = list(domain.authorized_ipv4 or [])
    if detected_ipv4 and detected_ipv4 not in ipv4_pool:
        ipv4_pool.insert(0, detected_ipv4)

    return {
        "domain": domain.domain_name,
        "detected_ipv4": detected_ipv4,
        "detected_ipv6": _detect_public_ipv6(),
        "ipv4": ipv4_pool,
        "ipv6": list(domain.authorized_ipv6 or []),
        "rotation_enabled": settings.IP_ROTATION_ENABLED,
    }


@router.post("/domains/{domain_id}/add-ip")
async def add_ip_to_domain(
    domain_id: int,
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ip_address = body.get("ip_address", "").strip()
    try:
        ip_obj = ipaddress.ip_address(ip_address)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP address format")

    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if domain.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    if isinstance(ip_obj, ipaddress.IPv4Address):
        pool = list(domain.authorized_ipv4 or [])
        if ip_address not in pool:
            pool.append(ip_address)
        domain.authorized_ipv4 = pool
    else:
        pool = list(domain.authorized_ipv6 or [])
        if ip_address not in pool:
            pool.append(ip_address)
        domain.authorized_ipv6 = pool

    db.commit()
    return {"message": f"IP {ip_address} added", "ipv4": domain.authorized_ipv4, "ipv6": domain.authorized_ipv6}


@router.delete("/domains/{domain_id}/remove-ip/{ip_address:path}")
async def remove_ip_from_domain(
    domain_id: int,
    ip_address: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if domain.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    ipv4 = list(domain.authorized_ipv4 or [])
    ipv6 = list(domain.authorized_ipv6 or [])

    if ip_address in ipv4:
        ipv4.remove(ip_address)
        domain.authorized_ipv4 = ipv4
    elif ip_address in ipv6:
        ipv6.remove(ip_address)
        domain.authorized_ipv6 = ipv6
    else:
        raise HTTPException(status_code=404, detail="IP not in this domain's pool")

    db.commit()
    return {"message": f"IP {ip_address} removed", "ipv4": domain.authorized_ipv4, "ipv6": domain.authorized_ipv6}


# ─────────────────────────────────────────────
#  Domain SPF generation with real IPs
# ─────────────────────────────────────────────
@router.get("/domains/{domain_id}/generate-spf")
async def generate_spf_for_domain(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a proper SPF record using the server's detected IP addresses."""
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if domain.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    detected_ipv4 = _detect_public_ipv4()
    detected_ipv6 = _detect_public_ipv6()

    # Build IP includes from domain pool + detected
    ip4_parts = []
    ip6_parts = []

    all_ipv4 = list(set(list(domain.authorized_ipv4 or []) + ([detected_ipv4] if detected_ipv4 else [])))
    all_ipv6 = list(set(list(domain.authorized_ipv6 or []) + ([detected_ipv6] if detected_ipv6 else [])))

    for ip in all_ipv4:
        try:
            ipaddress.IPv4Address(ip)
            ip4_parts.append(f"ip4:{ip}")
        except Exception:
            pass

    for ip in all_ipv6:
        try:
            ipaddress.IPv6Address(ip)
            ip6_parts.append(f"ip6:{ip}")
        except Exception:
            pass

    parts = ["v=spf1", "mx", "a"] + ip4_parts + ip6_parts + ["~all"]
    spf_record = " ".join(parts)

    # Persist to domain
    domain.spf_record = spf_record
    db.commit()

    return {
        "domain": domain.domain_name,
        "spf_record": spf_record,
        "detected_ipv4": detected_ipv4,
        "detected_ipv6": detected_ipv6,
        "ipv4_used": all_ipv4,
        "ipv6_used": all_ipv6,
    }


# ─────────────────────────────────────────────
#  Connection & auth tests
# ─────────────────────────────────────────────
@router.post("/test-connection/{domain_id}")
async def test_smtp_connection(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if domain.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        smtp = smtplib.SMTP(settings.SMTP_HOSTNAME, settings.SMTP_PORT, timeout=5)
        smtp.quit()
        return {"status": "connected", "server": settings.SMTP_HOSTNAME, "port": settings.SMTP_PORT, "message": "Successfully connected to SMTP server"}
    except socket.timeout:
        raise HTTPException(status_code=408, detail="Connection to SMTP server timed out")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect: {str(e)}")


@router.post("/test-authentication/{domain_id}")
async def test_authentication(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if domain.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "domain": domain.domain_name,
        "spf": {"enabled": settings.SPF_CHECK_ENABLED, "status": "configured" if domain.spf_verified else "pending", "verified": domain.spf_verified},
        "dkim": {"enabled": domain.dkim_enabled, "signing_enabled": domain.dkim_signing_enabled, "selector": domain.dkim_selector, "key_present": bool(domain.dkim_private_key)},
        "dmarc": {"enabled": domain.dmarc_enabled, "policy": domain.dmarc_policy, "rua_email": domain.dmarc_rua_email},
    }


# ─────────────────────────────────────────────
#  Bounce handling config
# ─────────────────────────────────────────────
@router.get("/bounce-config")
async def get_bounce_config(current_user: User = Depends(get_current_user)):
    """Get bounce handling configuration."""
    return {
        "hard_bounce_action": "unsubscribe",
        "soft_bounce_max_retries": 5,
        "soft_bounce_retry_interval_minutes": 60,
        "bounce_tracking_enabled": True,
        "fbl_processing_enabled": True,
        "complaint_threshold_percent": 0.1,
        "auto_suppress_on_bounce": True,
        "bounce_forwarder_email": "",
    }


# ─────────────────────────────────────────────
#  Sending queue & delivery config
# ─────────────────────────────────────────────
@router.get("/delivery-config")
async def get_delivery_config(current_user: User = Depends(get_current_user)):
    """Get delivery & retry configuration (PowerMTA-style)."""
    return {
        "max_delivery_attempts": 24,
        "retry_schedule_hours": [0.5, 1, 2, 4, 8, 16, 24, 48],
        "connection_timeout_seconds": 30,
        "data_timeout_seconds": 60,
        "max_recipients_per_connection": 100,
        "max_messages_per_connection": 500,
        "concurrent_connections_per_domain": 10,
        "backoff_strategy": "exponential",
        "tls_required": False,
        "tls_preferred": True,
        "verify_tls_cert": False,
        "ehlo_hostname": settings.SMTP_HOSTNAME,
        "queue_priority_levels": [1, 5, 10, 20],
    }


# ─────────────────────────────────────────────
#  Routing Rules  (PowerMTA Virtual MTAs)
# ─────────────────────────────────────────────
@router.get("/routing-rules")
async def list_routing_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all routing rules for the current user."""
    rules = db.query(RoutingRule).filter(
        RoutingRule.owner_id == current_user.id
    ).order_by(RoutingRule.priority_order).all()

    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "sender_domain": r.sender_domain,
            "recipient_domain": r.recipient_domain,
            "message_priority": r.message_priority,
            "virtual_mta_name": r.virtual_mta_name,
            "bind_address": r.bind_address,
            "queue_name": r.queue_name,
            "max_connections": r.max_connections,
            "rate_limit_per_second": r.rate_limit_per_second,
            "retry_strategy": r.retry_strategy,
            "is_active": r.is_active,
            "priority_order": r.priority_order,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rules
    ]


@router.post("/routing-rules")
async def create_routing_rule(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new routing rule."""
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Rule name is required")

    # Validate bind_address if provided
    bind = (body.get("bind_address") or "").strip() or None
    if bind:
        try:
            ipaddress.ip_address(bind)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid bind IP: {bind}")

    rule = RoutingRule(
        owner_id=current_user.id,
        name=name,
        description=(body.get("description") or "").strip() or None,
        sender_domain=(body.get("sender_domain") or "").strip() or None,
        recipient_domain=(body.get("recipient_domain") or "").strip() or None,
        message_priority=body.get("message_priority"),
        virtual_mta_name=(body.get("virtual_mta_name") or "").strip() or None,
        bind_address=bind,
        queue_name=(body.get("queue_name") or "").strip() or None,
        max_connections=int(body.get("max_connections", 10)),
        rate_limit_per_second=int(body.get("rate_limit_per_second", 100)),
        retry_strategy=body.get("retry_strategy", "exponential"),
        is_active=bool(body.get("is_active", True)),
        priority_order=int(body.get("priority_order", 100)),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"message": "Routing rule created", "id": rule.id}


@router.put("/routing-rules/{rule_id}")
async def update_routing_rule(
    rule_id: int,
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing routing rule."""
    rule = db.query(RoutingRule).filter(
        RoutingRule.id == rule_id, RoutingRule.owner_id == current_user.id
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    updatable = [
        "name", "description", "sender_domain", "recipient_domain",
        "message_priority", "virtual_mta_name", "bind_address", "queue_name",
        "max_connections", "rate_limit_per_second", "retry_strategy",
        "is_active", "priority_order",
    ]
    for field in updatable:
        if field in body:
            setattr(rule, field, body[field] or None if isinstance(body[field], str) else body[field])

    db.commit()
    return {"message": "Routing rule updated"}


@router.delete("/routing-rules/{rule_id}")
async def delete_routing_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a routing rule."""
    rule = db.query(RoutingRule).filter(
        RoutingRule.id == rule_id, RoutingRule.owner_id == current_user.id
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")
    db.delete(rule)
    db.commit()
    return {"message": "Routing rule deleted"}


# ─────────────────────────────────────────────
#  Webhooks  (GreenArrow-style event delivery)
# ─────────────────────────────────────────────
VALID_WEBHOOK_EVENTS = {"bounce", "complaint", "delivery", "open", "click", "unsubscribe", "deferred"}


@router.get("/webhooks")
async def list_webhooks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all webhook endpoints."""
    hooks = db.query(Webhook).filter(Webhook.owner_id == current_user.id).all()
    return [
        {
            "id": h.id,
            "name": h.name,
            "url": h.url,
            "events": h.events or [],
            "content_type": h.content_type,
            "secret_key": "•" * 8 if h.secret_key else None,  # mask secret
            "is_active": h.is_active,
            "last_triggered_at": h.last_triggered_at.isoformat() if h.last_triggered_at else None,
            "total_deliveries": h.total_deliveries,
            "total_failures": h.total_failures,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in hooks
    ]


@router.post("/webhooks")
async def create_webhook(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new webhook endpoint."""
    name = (body.get("name") or "").strip()
    url = (body.get("url") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Webhook name is required")
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Valid HTTPS URL is required")

    events = [e for e in (body.get("events") or []) if e in VALID_WEBHOOK_EVENTS]
    if not events:
        raise HTTPException(status_code=400, detail=f"At least one valid event required: {sorted(VALID_WEBHOOK_EVENTS)}")

    # Auto-generate secret if not provided
    secret = (body.get("secret_key") or "").strip() or secrets.token_hex(32)

    hook = Webhook(
        owner_id=current_user.id,
        name=name,
        url=url,
        events=events,
        content_type=body.get("content_type", "application/json"),
        secret_key=secret,
        is_active=bool(body.get("is_active", True)),
    )
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return {"message": "Webhook created", "id": hook.id, "secret_key": secret}


@router.put("/webhooks/{webhook_id}")
async def update_webhook(
    webhook_id: int,
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a webhook endpoint."""
    hook = db.query(Webhook).filter(
        Webhook.id == webhook_id, Webhook.owner_id == current_user.id
    ).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if "name" in body:
        hook.name = body["name"]
    if "url" in body:
        url = (body["url"] or "").strip()
        if not (url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(status_code=400, detail="Valid URL required")
        hook.url = url
    if "events" in body:
        hook.events = [e for e in body["events"] if e in VALID_WEBHOOK_EVENTS]
    if "is_active" in body:
        hook.is_active = bool(body["is_active"])
    if "content_type" in body:
        hook.content_type = body["content_type"]

    db.commit()
    return {"message": "Webhook updated"}


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a webhook endpoint."""
    hook = db.query(Webhook).filter(
        Webhook.id == webhook_id, Webhook.owner_id == current_user.id
    ).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    db.delete(hook)
    db.commit()
    return {"message": "Webhook deleted"}


@router.post("/webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a test ping to a webhook endpoint."""
    import urllib.request as urlreq
    hook = db.query(Webhook).filter(
        Webhook.id == webhook_id, Webhook.owner_id == current_user.id
    ).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    payload = json.dumps({
        "event": "test",
        "webhook_id": hook.id,
        "message": "CloudMTA webhook test ping",
        "timestamp": str(__import__('datetime').datetime.utcnow().isoformat()),
    }).encode()

    try:
        req = urlreq.Request(
            hook.url,
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "CloudMTA-Webhook/1.0"},
            method="POST",
        )
        with urlreq.urlopen(req, timeout=10) as resp:
            return {"status": "success", "http_status": resp.status, "url": hook.url}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Webhook test failed: {str(exc)}")


# ─────────────────────────────────────────────
#  Tracking Settings  (open / click pixel)
# ─────────────────────────────────────────────
@router.get("/tracking")
async def get_tracking_config(current_user: User = Depends(get_current_user)):
    """Get open/click tracking configuration."""
    return {
        "open_tracking_enabled": getattr(settings, "OPEN_TRACKING_ENABLED", False),
        "click_tracking_enabled": getattr(settings, "CLICK_TRACKING_ENABLED", False),
        "tracking_domain": getattr(settings, "TRACKING_DOMAIN", ""),
        "pixel_path": "/track/open",
        "click_redirect_path": "/track/click",
        "unsubscribe_tracking": True,
        "track_plain_text": False,
    }


@router.put("/tracking")
async def update_tracking_config(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
):
    """Update open/click tracking settings."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    updated = {}
    if "open_tracking_enabled" in body:
        settings.OPEN_TRACKING_ENABLED = bool(body["open_tracking_enabled"])
        updated["open_tracking_enabled"] = settings.OPEN_TRACKING_ENABLED
    if "click_tracking_enabled" in body:
        settings.CLICK_TRACKING_ENABLED = bool(body["click_tracking_enabled"])
        updated["click_tracking_enabled"] = settings.CLICK_TRACKING_ENABLED
    if "tracking_domain" in body:
        settings.TRACKING_DOMAIN = str(body["tracking_domain"])
        updated["tracking_domain"] = settings.TRACKING_DOMAIN

    return {"message": "Tracking settings updated", "updated": updated}

