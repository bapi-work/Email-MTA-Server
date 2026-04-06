"""
HTTP Send API — GreenArrow-style REST endpoint for email submission.
POST /api/v1/send  — submit email via HTTP (alternative to SMTP submission)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from database import get_db, Message, Domain, User, MessageStatus, SuppressionEntry
from datetime import datetime
import uuid
import re

router = APIRouter()


def get_current_user(request: Request, db: Session = Depends(get_db)):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# ── Request / Response schemas ──────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    from_email: str
    to: List[str]
    subject: str
    text_body: Optional[str] = None
    html_body: Optional[str] = None
    cc: Optional[List[str]] = []
    bcc: Optional[List[str]] = []
    reply_to: Optional[str] = None
    headers: Optional[dict] = {}
    priority: Optional[int] = 10  # 1 (high) – 10 (low), matches queue priority
    configuration_set: Optional[str] = None  # Configuration Set name
    tags: Optional[dict] = {}  # arbitrary key/value tags for reporting

    @validator("to")
    def validate_recipients(cls, v):
        if not v:
            raise ValueError("At least one recipient is required")
        if len(v) > 1000:
            raise ValueError("Maximum 1000 recipients per send call")
        email_pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
        for addr in v:
            if not email_pattern.match(addr):
                raise ValueError(f"Invalid email address: {addr}")
        return v

    @validator("from_email")
    def validate_from(cls, v):
        email_pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
        if not email_pattern.match(v):
            raise ValueError("Invalid from_email address")
        return v

    @validator("priority")
    def validate_priority(cls, v):
        if v is not None and not (1 <= v <= 10):
            raise ValueError("priority must be between 1 and 10")
        return v


class SendEmailResponse(BaseModel):
    message_ids: List[str]
    accepted: int
    rejected: int
    suppressed: int
    queued_at: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=SendEmailResponse, status_code=status.HTTP_202_ACCEPTED)
async def send_email(
    payload: SendEmailRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submit email via HTTP API (GreenArrow-style).

    - Accepts up to 1000 recipients per call
    - Checks suppression list before queuing
    - Returns per-call message IDs for tracking
    - Respects Configuration Set settings when specified
    """
    # Resolve sending domain
    from_domain = payload.from_email.split("@")[-1].lower()
    domain = db.query(Domain).filter(
        Domain.owner_id == current_user.id,
        Domain.domain_name == from_domain
    ).first()

    if not domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sending domain '{from_domain}' not registered. Add it under Domains first."
        )

    if not domain.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Domain '{from_domain}' is not verified. Complete DNS verification before sending."
        )

    # Load suppression list for this user
    suppressed_emails = set(
        row.email.lower()
        for row in db.query(SuppressionEntry.email).filter(
            SuppressionEntry.owner_id == current_user.id
        ).all()
    )

    message_ids = []
    accepted = 0
    suppressed_count = 0

    all_recipients = payload.to + (payload.cc or []) + (payload.bcc or [])

    for recipient in payload.to:
        if recipient.lower() in suppressed_emails:
            suppressed_count += 1
            continue

        msg_id = f"<{uuid.uuid4().hex}@{from_domain}>"

        msg = Message(
            message_id=msg_id,
            user_id=current_user.id,
            domain_id=domain.id,
            from_email=payload.from_email,
            to_email=recipient,
            subject=payload.subject,
            body=payload.html_body or payload.text_body or "",
            headers={
                **(payload.headers or {}),
                "Reply-To": payload.reply_to or payload.from_email,
                "X-Configuration-Set": payload.configuration_set or "",
                "X-Tags": str(payload.tags or {}),
                "X-Priority": str(payload.priority),
                "CC": ", ".join(payload.cc or []),
            },
            status=MessageStatus.QUEUED.value,
            priority=payload.priority or 10,
            created_at=datetime.utcnow(),
        )
        db.add(msg)
        message_ids.append(msg_id)
        accepted += 1

    db.commit()

    return SendEmailResponse(
        message_ids=message_ids,
        accepted=accepted,
        rejected=0,
        suppressed=suppressed_count,
        queued_at=datetime.utcnow().isoformat()
    )


@router.get("/status/{message_id}")
async def get_message_status(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get delivery status for a specific message ID."""
    msg = db.query(Message).filter(
        Message.message_id == message_id,
        Message.user_id == current_user.id
    ).first()

    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    return {
        "message_id": msg.message_id,
        "status": msg.status,
        "from_email": msg.from_email,
        "to_email": msg.to_email,
        "subject": msg.subject,
        "attempts": msg.attempts,
        "response_code": msg.response_code,
        "response_message": msg.response_message,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
    }


@router.get("/logs")
async def get_delivery_logs(
    page: int = 1,
    page_size: int = 50,
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delivery log viewer — paginated list of recent messages with SMTP status.
    """
    query = db.query(Message).filter(Message.user_id == current_user.id)

    if status_filter:
        query = query.filter(Message.status == status_filter)

    total = query.count()
    messages = (
        query.order_by(Message.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "logs": [
            {
                "message_id": m.message_id,
                "from_email": m.from_email,
                "to_email": m.to_email,
                "subject": m.subject,
                "status": m.status,
                "attempts": m.attempts,
                "response_code": m.response_code,
                "response_message": m.response_message,
                "dkim_signed": m.dkim_signed,
                "ip_used": m.ipv4_used or m.ipv6_used,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "sent_at": m.sent_at.isoformat() if m.sent_at else None,
            }
            for m in messages
        ],
    }
