"""
Reputation Dashboard — SES Virtual Deliverability Manager equivalent
Provides real-time sender reputation scoring, trend analytics, and smart recommendations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db, Message, Domain, User, MessageStatus
from datetime import datetime, timedelta

router = APIRouter()


def get_current_user(request: Request, db: Session = Depends(get_db)):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _compute_score(bounce_rate: float, complaint_rate: float) -> int:
    """
    Compute a 0-100 sender reputation score.
    Industry thresholds:
      Bounce rate > 10% = critical   | < 2% = healthy
      Complaint rate > 0.1% = critical | < 0.05% = healthy
    """
    score = 100

    # Deductions for bounce rate
    if bounce_rate >= 0.10:
        score -= 50
    elif bounce_rate >= 0.05:
        score -= 30
    elif bounce_rate >= 0.02:
        score -= 15
    elif bounce_rate >= 0.01:
        score -= 5

    # Deductions for complaint rate
    if complaint_rate >= 0.001:
        score -= 40
    elif complaint_rate >= 0.0005:
        score -= 20
    elif complaint_rate >= 0.0001:
        score -= 8

    return max(0, score)


def _grade(score: int) -> str:
    if score >= 90:
        return "Excellent"
    elif score >= 75:
        return "Good"
    elif score >= 50:
        return "Fair"
    elif score >= 25:
        return "Poor"
    return "Critical"


@router.get("/score")
async def get_reputation_score(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Current reputation score with bounce rate, complaint rate, and grade.
    """
    start_date = datetime.utcnow() - timedelta(days=days)

    total = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.created_at >= start_date
    ).scalar() or 0

    bounced = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.BOUNCED.value,
        Message.created_at >= start_date
    ).scalar() or 0

    # Complaints are messages with response_code starting with 5 and complaint in message
    failed = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.FAILED.value,
        Message.created_at >= start_date
    ).scalar() or 0

    sent = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.SENT.value,
        Message.created_at >= start_date
    ).scalar() or 0

    bounce_rate = (bounced / total) if total > 0 else 0.0
    complaint_rate = 0.0  # Placeholder; real FBL data would populate this

    score = _compute_score(bounce_rate, complaint_rate)
    grade = _grade(score)

    return {
        "score": score,
        "grade": grade,
        "period_days": days,
        "metrics": {
            "total_sent": total,
            "delivered": sent,
            "bounced": bounced,
            "failed": failed,
            "bounce_rate": round(bounce_rate * 100, 3),
            "complaint_rate": round(complaint_rate * 100, 4),
            "delivery_rate": round((sent / total * 100) if total > 0 else 0, 2),
        },
        "thresholds": {
            "bounce_rate_warning": 2.0,
            "bounce_rate_critical": 5.0,
            "complaint_rate_warning": 0.05,
            "complaint_rate_critical": 0.1,
        },
        "computed_at": datetime.utcnow().isoformat()
    }


@router.get("/dashboard")
async def get_reputation_dashboard(
    days: int = Query(30, ge=7, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Time-series reputation data — one data point per day.
    """
    daily_data = []

    for day_offset in range(days - 1, -1, -1):
        day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=day_offset)
        day_end = day_start + timedelta(days=1)

        day_total = db.query(func.count(Message.id)).filter(
            Message.user_id == current_user.id,
            Message.created_at >= day_start,
            Message.created_at < day_end
        ).scalar() or 0

        day_bounced = db.query(func.count(Message.id)).filter(
            Message.user_id == current_user.id,
            Message.status == MessageStatus.BOUNCED.value,
            Message.created_at >= day_start,
            Message.created_at < day_end
        ).scalar() or 0

        day_sent = db.query(func.count(Message.id)).filter(
            Message.user_id == current_user.id,
            Message.status == MessageStatus.SENT.value,
            Message.created_at >= day_start,
            Message.created_at < day_end
        ).scalar() or 0

        bounce_rate = (day_bounced / day_total * 100) if day_total > 0 else 0.0
        delivery_rate = (day_sent / day_total * 100) if day_total > 0 else 0.0

        daily_data.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "total": day_total,
            "sent": day_sent,
            "bounced": day_bounced,
            "bounce_rate": round(bounce_rate, 3),
            "delivery_rate": round(delivery_rate, 2),
            "score": _compute_score(bounce_rate / 100, 0.0)
        })

    return {
        "period_days": days,
        "data": daily_data
    }


@router.get("/recommendations")
async def get_reputation_recommendations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Smart recommendations based on current sending metrics.
    Mirrors Amazon SES Virtual Deliverability Manager advice.
    """
    start_date = datetime.utcnow() - timedelta(days=7)

    total = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.created_at >= start_date
    ).scalar() or 0

    bounced = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.BOUNCED.value,
        Message.created_at >= start_date
    ).scalar() or 0

    # Count domains without DKIM
    domains_without_dkim = db.query(func.count(Domain.id)).filter(
        Domain.owner_id == current_user.id,
        Domain.dkim_enabled == False
    ).scalar() or 0

    # Domains without DMARC
    domains_without_dmarc = db.query(func.count(Domain.id)).filter(
        Domain.owner_id == current_user.id,
        Domain.dmarc_enabled == False
    ).scalar() or 0

    bounce_rate = (bounced / total) if total > 0 else 0.0

    recommendations = []

    # Bounce rate recommendations
    if bounce_rate >= 0.05:
        recommendations.append({
            "severity": "critical",
            "category": "bounce_rate",
            "title": "High Bounce Rate Detected",
            "description": f"Your bounce rate is {bounce_rate*100:.1f}%, well above the 2% safe threshold. ISPs may block your sending.",
            "action": "Remove invalid addresses from your lists immediately. Use the Suppression List to block repeat bounces. Consider email list verification."
        })
    elif bounce_rate >= 0.02:
        recommendations.append({
            "severity": "warning",
            "category": "bounce_rate",
            "title": "Bounce Rate Approaching Warning Level",
            "description": f"Your bounce rate is {bounce_rate*100:.1f}%. Industry best practice keeps this below 2%.",
            "action": "Review and clean your mailing list. Implement double opt-in for new subscribers."
        })

    # DKIM recommendation
    if domains_without_dkim > 0:
        recommendations.append({
            "severity": "warning",
            "category": "authentication",
            "title": f"{domains_without_dkim} Domain(s) Missing DKIM Signing",
            "description": "DKIM signing prevents email spoofing and improves deliverability scoring at major ISPs.",
            "action": "Navigate to Domains → select each domain → enable DKIM signing and publish the DNS TXT record."
        })

    # DMARC recommendation
    if domains_without_dmarc > 0:
        recommendations.append({
            "severity": "info",
            "category": "authentication",
            "title": f"{domains_without_dmarc} Domain(s) Missing DMARC Policy",
            "description": "DMARC tells receiving servers how to handle unauthenticated email. Required for Gmail/Yahoo bulk sender guidelines.",
            "action": "Publish a DMARC TXT record (_dmarc.yourdomain.com) with at minimum 'p=none' to start monitoring."
        })

    # Low volume — suggest warmup
    if total < 100:
        recommendations.append({
            "severity": "info",
            "category": "warmup",
            "title": "IP Warmup Recommended",
            "description": "Low sending volume detected. New or recently inactive IPs benefit from a gradual warmup schedule.",
            "action": "Enable IP Warmup in Settings → Warmup to gradually increase daily limits and build sender reputation."
        })

    # No issues
    if not recommendations:
        recommendations.append({
            "severity": "success",
            "category": "general",
            "title": "Sender Reputation Looks Healthy",
            "description": "No critical issues detected. Continue monitoring your bounce and complaint rates.",
            "action": "Keep maintaining good list hygiene and authentication records."
        })

    return {
        "recommendations": recommendations,
        "computed_at": datetime.utcnow().isoformat()
    }


@router.get("/domain-health")
async def get_domain_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Per-domain reputation summary — bounce rate, authentication status, send volume.
    """
    domains = db.query(Domain).filter(Domain.owner_id == current_user.id).all()
    start_date = datetime.utcnow() - timedelta(days=7)

    result = []
    for domain in domains:
        total = db.query(func.count(Message.id)).filter(
            Message.domain_id == domain.id,
            Message.created_at >= start_date
        ).scalar() or 0

        bounced = db.query(func.count(Message.id)).filter(
            Message.domain_id == domain.id,
            Message.status == MessageStatus.BOUNCED.value,
            Message.created_at >= start_date
        ).scalar() or 0

        bounce_rate = (bounced / total) if total > 0 else 0.0

        result.append({
            "domain": domain.domain_name,
            "domain_id": domain.id,
            "status": domain.status,
            "is_verified": domain.is_verified,
            "authentication": {
                "dkim_enabled": domain.dkim_enabled,
                "spf_verified": domain.spf_verified,
                "dmarc_enabled": domain.dmarc_enabled,
            },
            "metrics_7d": {
                "total_sent": total,
                "bounced": bounced,
                "bounce_rate": round(bounce_rate * 100, 3),
            },
            "score": _compute_score(bounce_rate, 0.0)
        })

    return {"domains": result}
