"""Suppression List router — GreenArrow / Amazon SES style address suppression"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Body, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db, User, SuppressionEntry
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_REASONS = {"hard_bounce", "soft_bounce", "complaint", "spam", "manual", "unsubscribe"}


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
#  List suppressions
# ─────────────────────────────────────────────
@router.get("")
async def list_suppressions(
    reason: str = Query(None, description="Filter by reason"),
    search: str = Query(None, description="Search email addresses"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all suppressed email addresses."""
    query = db.query(SuppressionEntry).filter(SuppressionEntry.owner_id == current_user.id)

    if reason and reason in VALID_REASONS:
        query = query.filter(SuppressionEntry.reason == reason)

    if search:
        query = query.filter(SuppressionEntry.email.ilike(f"%{search}%"))

    total = query.count()
    entries = query.order_by(SuppressionEntry.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [
            {
                "id": e.id,
                "email": e.email,
                "reason": e.reason,
                "reason_detail": e.reason_detail,
                "source": e.source,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ]
    }


# ─────────────────────────────────────────────
#  Add suppression
# ─────────────────────────────────────────────
@router.post("")
async def add_suppression(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add one or more email addresses to the suppression list."""
    emails_raw = body.get("emails") or body.get("email")
    if isinstance(emails_raw, str):
        emails_raw = [emails_raw]
    if not emails_raw:
        raise HTTPException(status_code=400, detail="'email' or 'emails' is required")

    reason = body.get("reason", "manual")
    if reason not in VALID_REASONS:
        raise HTTPException(status_code=400, detail=f"Invalid reason. Valid: {sorted(VALID_REASONS)}")

    added = []
    skipped = []

    for raw_email in emails_raw:
        email = raw_email.strip().lower()
        if not email or "@" not in email:
            skipped.append({"email": raw_email, "reason": "invalid format"})
            continue

        # Check for duplicate
        existing = db.query(SuppressionEntry).filter(
            SuppressionEntry.owner_id == current_user.id,
            SuppressionEntry.email == email,
        ).first()

        if existing:
            skipped.append({"email": email, "reason": "already suppressed"})
            continue

        entry = SuppressionEntry(
            owner_id=current_user.id,
            email=email,
            reason=reason,
            reason_detail=(body.get("reason_detail") or "").strip() or None,
            source=body.get("source", "manual"),
        )
        db.add(entry)
        added.append(email)

    db.commit()
    return {
        "message": f"{len(added)} address(es) added to suppression list",
        "added": added,
        "skipped": skipped,
    }


# ─────────────────────────────────────────────
#  Check if email is suppressed
# ─────────────────────────────────────────────
@router.get("/check")
async def check_suppression(
    email: str = Query(..., description="Email address to check"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check whether a specific email address is suppressed."""
    email_lower = email.strip().lower()
    entry = db.query(SuppressionEntry).filter(
        SuppressionEntry.owner_id == current_user.id,
        SuppressionEntry.email == email_lower,
    ).first()

    if entry:
        return {
            "suppressed": True,
            "email": email_lower,
            "reason": entry.reason,
            "source": entry.source,
            "added_at": entry.created_at.isoformat() if entry.created_at else None,
        }
    return {"suppressed": False, "email": email_lower}


# ─────────────────────────────────────────────
#  Remove suppression
# ─────────────────────────────────────────────
@router.delete("/{suppression_id}")
async def remove_suppression(
    suppression_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove an address from the suppression list."""
    entry = db.query(SuppressionEntry).filter(
        SuppressionEntry.id == suppression_id,
        SuppressionEntry.owner_id == current_user.id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Suppression entry not found")
    db.delete(entry)
    db.commit()
    return {"message": f"'{entry.email}' removed from suppression list"}


@router.delete("/email/{email_address:path}")
async def remove_suppression_by_email(
    email_address: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove an address from the suppression list by email."""
    email_lower = email_address.strip().lower()
    entry = db.query(SuppressionEntry).filter(
        SuppressionEntry.owner_id == current_user.id,
        SuppressionEntry.email == email_lower,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Email not in suppression list")
    db.delete(entry)
    db.commit()
    return {"message": f"'{email_lower}' removed from suppression list"}


# ─────────────────────────────────────────────
#  Bulk delete / import
# ─────────────────────────────────────────────
@router.delete("")
async def bulk_delete_suppressions(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk delete suppression entries by ID list."""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="'ids' list is required")

    deleted = db.query(SuppressionEntry).filter(
        SuppressionEntry.id.in_(ids),
        SuppressionEntry.owner_id == current_user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"{deleted} suppression(s) removed"}


# ─────────────────────────────────────────────
#  Stats
# ─────────────────────────────────────────────
@router.get("/stats")
async def suppression_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get suppression list statistics."""
    from sqlalchemy import func

    total = db.query(SuppressionEntry).filter(SuppressionEntry.owner_id == current_user.id).count()
    by_reason = (
        db.query(SuppressionEntry.reason, func.count(SuppressionEntry.id).label("count"))
        .filter(SuppressionEntry.owner_id == current_user.id)
        .group_by(SuppressionEntry.reason)
        .all()
    )
    return {
        "total": total,
        "by_reason": {r: c for r, c in by_reason},
    }
