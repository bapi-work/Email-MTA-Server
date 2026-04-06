"""SMTP settings router — full configuration management"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db, User, Domain, RoutingRule, Webhook, IPWarmupSchedule, ConfigurationSet
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
from datetime import datetime, timedelta

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


# ─────────────────────────────────────────────
#  IP Warmup Schedule  (SES / GreenArrow style)
# ─────────────────────────────────────────────

# Default warmup stages: {day_number: daily_limit}  0 = unlimited
DEFAULT_WARMUP_SCHEDULE = {"1": 200, "3": 500, "7": 1000, "14": 5000, "30": 20000, "60": 0}

ISP_THROTTLE_PROFILES = {
    "gmail": {
        "name": "Gmail / Google Workspace",
        "description": "Conservative limits recommended by Google's Postmaster guidelines",
        "max_connections": 20,
        "rate_limit_per_second": 5,
        "max_recipients_per_connection": 100,
        "retry_strategy": "exponential",
        "notes": "Respect DMARC p=reject. Monitor Google Postmaster Tools for reputation.",
    },
    "yahoo": {
        "name": "Yahoo / AOL",
        "description": "Yahoo mail throttling recommendations",
        "max_connections": 10,
        "rate_limit_per_second": 3,
        "max_recipients_per_connection": 100,
        "retry_strategy": "exponential",
        "notes": "Honor FBL complaints promptly. Use a consistent sending IP.",
    },
    "outlook": {
        "name": "Outlook / Hotmail / Microsoft 365",
        "description": "Microsoft Smart Network Data Services (SNDS) guidelines",
        "max_connections": 25,
        "rate_limit_per_second": 8,
        "max_recipients_per_connection": 100,
        "retry_strategy": "linear",
        "notes": "Register with JMRP. Keep complaint rate below 0.3%.",
    },
    "apple": {
        "name": "Apple iCloud Mail",
        "description": "Apple iCloud Mail sending guidelines",
        "max_connections": 10,
        "rate_limit_per_second": 3,
        "max_recipients_per_connection": 50,
        "retry_strategy": "exponential",
        "notes": "DKIM signing mandatory. SPF and DMARC strongly recommended.",
    },
    "comcast": {
        "name": "Comcast / Xfinity",
        "description": "Comcast postmaster guidelines",
        "max_connections": 8,
        "rate_limit_per_second": 2,
        "max_recipients_per_connection": 50,
        "retry_strategy": "exponential",
        "notes": "Register at postmaster.comcast.net for complaint feedback.",
    },
    "generic": {
        "name": "Generic Conservative",
        "description": "Safe defaults for unknown or smaller ISPs",
        "max_connections": 5,
        "rate_limit_per_second": 2,
        "max_recipients_per_connection": 50,
        "retry_strategy": "exponential",
        "notes": "Good default for new IP warmup or unknown recipients.",
    },
}


@router.get("/warmup")
async def list_warmup_schedules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all IP warmup schedules for the current user."""
    schedules = db.query(IPWarmupSchedule).filter(
        IPWarmupSchedule.owner_id == current_user.id
    ).all()

    result = []
    for s in schedules:
        # Calculate current day of warmup
        days_active = (datetime.utcnow() - s.start_date).days if s.start_date else 0
        # Find current daily limit from schedule
        sched = s.schedule or DEFAULT_WARMUP_SCHEDULE
        current_limit = 0
        for day_str in sorted(sched.keys(), key=lambda x: int(x)):
            if days_active >= int(day_str):
                current_limit = sched[day_str]
        is_unlimited = current_limit == 0

        result.append({
            "id": s.id,
            "ip_address": s.ip_address,
            "is_active": s.is_active,
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "days_active": days_active,
            "current_daily_limit": None if is_unlimited else current_limit,
            "today_sent": s.today_sent,
            "schedule": sched,
            "notes": s.notes,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    return result


@router.post("/warmup")
async def create_warmup_schedule(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create an IP warmup schedule."""
    ip_str = (body.get("ip_address") or "").strip()
    if not ip_str:
        raise HTTPException(status_code=400, detail="ip_address is required")
    try:
        ipaddress.ip_address(ip_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid IP address: {ip_str}")

    existing = db.query(IPWarmupSchedule).filter(
        IPWarmupSchedule.owner_id == current_user.id,
        IPWarmupSchedule.ip_address == ip_str,
        IPWarmupSchedule.is_active == True,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Active warmup schedule already exists for this IP")

    schedule = body.get("schedule") or DEFAULT_WARMUP_SCHEDULE
    start_date_str = body.get("start_date")
    start_date = datetime.fromisoformat(start_date_str) if start_date_str else datetime.utcnow()

    sched = IPWarmupSchedule(
        owner_id=current_user.id,
        ip_address=ip_str,
        start_date=start_date,
        schedule=schedule,
        is_active=True,
        notes=(body.get("notes") or "").strip() or None,
    )
    db.add(sched)
    db.commit()
    db.refresh(sched)
    return {"message": "Warmup schedule created", "id": sched.id}


@router.put("/warmup/{schedule_id}")
async def update_warmup_schedule(
    schedule_id: int,
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a warmup schedule."""
    sched = db.query(IPWarmupSchedule).filter(
        IPWarmupSchedule.id == schedule_id,
        IPWarmupSchedule.owner_id == current_user.id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Warmup schedule not found")

    if "is_active" in body:
        sched.is_active = bool(body["is_active"])
    if "schedule" in body:
        sched.schedule = body["schedule"]
    if "notes" in body:
        sched.notes = body["notes"]
    if "start_date" in body:
        sched.start_date = datetime.fromisoformat(body["start_date"])

    db.commit()
    return {"message": "Warmup schedule updated"}


@router.delete("/warmup/{schedule_id}")
async def delete_warmup_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a warmup schedule."""
    sched = db.query(IPWarmupSchedule).filter(
        IPWarmupSchedule.id == schedule_id,
        IPWarmupSchedule.owner_id == current_user.id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Warmup schedule not found")
    db.delete(sched)
    db.commit()
    return {"message": "Warmup schedule deleted"}


# ─────────────────────────────────────────────
#  ISP Traffic Shaping Profiles  (PowerMTA)
# ─────────────────────────────────────────────

@router.get("/isp-profiles")
async def list_isp_profiles(current_user: User = Depends(get_current_user)):
    """
    Return pre-built ISP throttle profiles (PowerMTA traffic shaping equivalent).
    """
    return {
        "profiles": [
            {"isp": key, **profile}
            for key, profile in ISP_THROTTLE_PROFILES.items()
        ]
    }


@router.post("/isp-profiles/apply")
async def apply_isp_profile(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Apply an ISP throttle profile as a new routing rule.
    """
    isp_key = (body.get("isp") or "").lower().strip()
    if isp_key not in ISP_THROTTLE_PROFILES:
        raise HTTPException(status_code=400, detail=f"Unknown ISP profile: {isp_key}. Available: {list(ISP_THROTTLE_PROFILES)}")

    profile = ISP_THROTTLE_PROFILES[isp_key]
    recipient_domain = (body.get("recipient_domain") or "").strip() or None

    rule = RoutingRule(
        owner_id=current_user.id,
        name=f"{profile['name']} — ISP Profile",
        description=f"Auto-applied {profile['name']} traffic shaping profile. {profile['notes']}",
        recipient_domain=recipient_domain,
        max_connections=profile["max_connections"],
        rate_limit_per_second=profile["rate_limit_per_second"],
        retry_strategy=profile["retry_strategy"],
        is_active=True,
        priority_order=50,  # Higher priority than defaults
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"message": f"ISP profile for {profile['name']} applied as routing rule", "routing_rule_id": rule.id}


# ─────────────────────────────────────────────
#  Mailbox Simulator  (Amazon SES equivalent)
# ─────────────────────────────────────────────

SIMULATOR_SCENARIOS = {
    "delivery": {
        "description": "Simulates successful message delivery",
        "expected_status": "sent",
        "smtp_response": "250 2.0.0 OK: Message queued",
    },
    "bounce": {
        "description": "Simulates a hard bounce (address does not exist)",
        "expected_status": "bounced",
        "smtp_response": "550 5.1.1 The email account does not exist",
    },
    "soft_bounce": {
        "description": "Simulates a temporary soft bounce (mailbox full)",
        "expected_status": "deferred",
        "smtp_response": "452 4.2.2 Mailbox full",
    },
    "complaint": {
        "description": "Simulates a spam complaint via FBL",
        "expected_status": "sent",
        "smtp_response": "250 2.0.0 OK: Message delivered; FBL complaint generated",
    },
    "out_of_office": {
        "description": "Simulates an out-of-office autoresponder",
        "expected_status": "sent",
        "smtp_response": "250 2.0.0 OK: Message delivered with autoresponder",
    },
    "suppressed": {
        "description": "Simulates sending to a suppressed address",
        "expected_status": "failed",
        "smtp_response": "550 5.1.1 Address is on suppression list",
    },
}


@router.get("/simulator/scenarios")
async def list_simulator_scenarios(current_user: User = Depends(get_current_user)):
    """List available mailbox simulator scenarios (SES Mailbox Simulator equivalent)."""
    return {"scenarios": [{"id": k, **v} for k, v in SIMULATOR_SCENARIOS.items()]}


@router.post("/simulator/test")
async def run_simulator_test(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Run a mailbox simulator test.
    Simulates SMTP delivery scenarios without sending real email.
    """
    scenario_id = (body.get("scenario") or "").lower().strip()
    if scenario_id not in SIMULATOR_SCENARIOS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scenario '{scenario_id}'. Choose from: {list(SIMULATOR_SCENARIOS)}"
        )

    from_email = (body.get("from_email") or "").strip()
    if not from_email:
        raise HTTPException(status_code=400, detail="from_email is required")

    scenario = SIMULATOR_SCENARIOS[scenario_id]

    # Simulate processing delay and result
    import uuid as _uuid
    sim_message_id = f"<sim-{_uuid.uuid4().hex[:12]}@simulator.cloudmta>"

    result = {
        "simulation_id": sim_message_id,
        "scenario": scenario_id,
        "description": scenario["description"],
        "from_email": from_email,
        "to_email": f"simulator+{scenario_id}@cloudmta.test",
        "simulated_smtp_response": scenario["smtp_response"],
        "expected_final_status": scenario["expected_status"],
        "dkim_signed": True,
        "spf_pass": True,
        "dmarc_pass": True,
        "processing_time_ms": 42,
        "simulated_at": datetime.utcnow().isoformat(),
        "notes": "This is a simulation only. No real email was sent.",
    }

    # For bounce simulation, add suppression recommendation
    if scenario_id == "bounce":
        result["recommendations"] = [
            "Add this address to your Suppression List to prevent future sending",
            "Review your list source — addresses that bounce immediately may be purchased or invalid",
        ]
    elif scenario_id == "complaint":
        result["recommendations"] = [
            "Ensure a clear one-click unsubscribe link is present in all emails",
            "Review your sending frequency — complaint rates spike when sending increases sharply",
        ]

    return result


# ─────────────────────────────────────────────
#  Configuration Sets  (Amazon SES style)
# ─────────────────────────────────────────────

@router.get("/configuration-sets")
async def list_configuration_sets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all configuration sets."""
    sets = db.query(ConfigurationSet).filter(
        ConfigurationSet.owner_id == current_user.id
    ).all()

    return [
        {
            "id": cs.id,
            "name": cs.name,
            "description": cs.description,
            "open_tracking_enabled": cs.open_tracking_enabled,
            "click_tracking_enabled": cs.click_tracking_enabled,
            "sending_enabled": cs.sending_enabled,
            "max_bounce_rate": cs.max_bounce_rate,
            "max_complaint_rate": cs.max_complaint_rate,
            "dedicated_ips": cs.dedicated_ips or [],
            "virtual_mta_name": cs.virtual_mta_name,
            "is_active": cs.is_active,
            "created_at": cs.created_at.isoformat() if cs.created_at else None,
        }
        for cs in sets
    ]


@router.post("/configuration-sets")
async def create_configuration_set(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a configuration set."""
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Configuration set name is required")

    existing = db.query(ConfigurationSet).filter(
        ConfigurationSet.owner_id == current_user.id,
        ConfigurationSet.name == name,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A configuration set with this name already exists")

    cs = ConfigurationSet(
        owner_id=current_user.id,
        name=name,
        description=(body.get("description") or "").strip() or None,
        open_tracking_enabled=body.get("open_tracking_enabled"),
        click_tracking_enabled=body.get("click_tracking_enabled"),
        sending_enabled=bool(body.get("sending_enabled", True)),
        max_bounce_rate=float(body.get("max_bounce_rate", 0.10)),
        max_complaint_rate=float(body.get("max_complaint_rate", 0.001)),
        dedicated_ips=body.get("dedicated_ips") or [],
        virtual_mta_name=(body.get("virtual_mta_name") or "").strip() or None,
        is_active=bool(body.get("is_active", True)),
    )
    db.add(cs)
    db.commit()
    db.refresh(cs)
    return {"message": "Configuration set created", "id": cs.id}


@router.put("/configuration-sets/{set_id}")
async def update_configuration_set(
    set_id: int,
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a configuration set."""
    cs = db.query(ConfigurationSet).filter(
        ConfigurationSet.id == set_id,
        ConfigurationSet.owner_id == current_user.id,
    ).first()
    if not cs:
        raise HTTPException(status_code=404, detail="Configuration set not found")

    for field in ["name", "description", "sending_enabled", "max_bounce_rate",
                  "max_complaint_rate", "dedicated_ips", "virtual_mta_name", "is_active",
                  "open_tracking_enabled", "click_tracking_enabled"]:
        if field in body:
            setattr(cs, field, body[field])

    db.commit()
    return {"message": "Configuration set updated"}


@router.delete("/configuration-sets/{set_id}")
async def delete_configuration_set(
    set_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a configuration set."""
    cs = db.query(ConfigurationSet).filter(
        ConfigurationSet.id == set_id,
        ConfigurationSet.owner_id == current_user.id,
    ).first()
    if not cs:
        raise HTTPException(status_code=404, detail="Configuration set not found")
    db.delete(cs)
    db.commit()
    return {"message": "Configuration set deleted"}

