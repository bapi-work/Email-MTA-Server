"""Analytics router"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db, Message, Domain, User, MessageStatus
from schemas import SendingStatsResponse, DeliveryReportResponse
from datetime import datetime, timedelta

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

@router.get("/dashboard")
async def get_dashboard_stats(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard analytics"""
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get overall stats
    total_sent = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.SENT,
        Message.created_at >= start_date
    ).scalar() or 0
    
    total_failed = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.FAILED,
        Message.created_at >= start_date
    ).scalar() or 0
    
    total_bounced = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.BOUNCED,
        Message.created_at >= start_date
    ).scalar() or 0
    
    total_queued = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.QUEUED
    ).scalar() or 0
    
    total_messages = total_sent + total_failed + total_bounced + total_queued
    success_rate = (total_sent / total_messages * 100) if total_messages > 0 else 0
    
    return {
        "period": {
            "start": start_date.isoformat(),
            "end": datetime.utcnow().isoformat(),
            "days": days
        },
        "summary": {
            "total_messages": total_messages,
            "sent": total_sent,
            "failed": total_failed,
            "bounced": total_bounced,
            "queued": total_queued,
            "success_rate": round(success_rate, 2)
        },
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/delivery-by-domain", response_model=list[DeliveryReportResponse])
async def get_delivery_by_domain(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get delivery statistics grouped by domain"""
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get user's domains
    domains = db.query(Domain).filter(Domain.owner_id == current_user.id).all()
    
    reports = []
    
    for domain in domains:
        total = db.query(func.count(Message.id)).filter(
            Message.domain_id == domain.id,
            Message.created_at >= start_date
        ).scalar() or 0
        
        sent = db.query(func.count(Message.id)).filter(
            Message.domain_id == domain.id,
            Message.status == MessageStatus.SENT,
            Message.created_at >= start_date
        ).scalar() or 0
        
        failed = db.query(func.count(Message.id)).filter(
            Message.domain_id == domain.id,
            Message.status == MessageStatus.FAILED,
            Message.created_at >= start_date
        ).scalar() or 0
        
        bounced = db.query(func.count(Message.id)).filter(
            Message.domain_id == domain.id,
            Message.status == MessageStatus.BOUNCED,
            Message.created_at >= start_date
        ).scalar() or 0
        
        deferred = db.query(func.count(Message.id)).filter(
            Message.domain_id == domain.id,
            Message.status == MessageStatus.DEFERRED,
            Message.created_at >= start_date
        ).scalar() or 0
        
        success_rate = (sent / total * 100) if total > 0 else 0
        
        reports.append(DeliveryReportResponse(
            domain=domain.domain_name,
            total_messages=total,
            sent=sent,
            failed=failed,
            bounced=bounced,
            deferred=deferred,
            success_rate=round(success_rate, 2)
        ))
    
    return reports

@router.get("/hourly-stats")
async def get_hourly_stats(
    days: int = Query(1, ge=1, le=7),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get hourly sending statistics"""
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get messages grouped by hour
    query = db.query(
        func.date_trunc('hour', Message.created_at).label('hour'),
        func.count(Message.id).label('total'),
        func.sum(func.cast(Message.status == MessageStatus.SENT, type_=int)).label('sent'),
        func.sum(func.cast(Message.status == MessageStatus.FAILED, type_=int)).label('failed')
    ).filter(
        Message.user_id == current_user.id,
        Message.created_at >= start_date
    ).group_by('hour').all()
    
    stats = []
    for hour, total, sent, failed in query:
        stats.append({
            "timestamp": hour.isoformat() if hour else None,
            "total": total or 0,
            "sent": sent or 0,
            "failed": failed or 0,
            "success_rate": round(((sent or 0) / total * 100), 2) if total else 0
        })
    
    return {
        "period": "hourly",
        "data": stats
    }

@router.get("/authentication-stats")
async def get_authentication_stats(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get authentication methods usage statistics"""
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    total_messages = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.created_at >= start_date
    ).scalar() or 0
    
    dkim_signed = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.dkim_signed == True,
        Message.created_at >= start_date
    ).scalar() or 0
    
    spf_verified = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.spf_verified == True,
        Message.created_at >= start_date
    ).scalar() or 0
    
    dmarc_compliant = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.dmarc_compliant == True,
        Message.created_at >= start_date
    ).scalar() or 0
    
    return {
        "period": {
            "start": start_date.isoformat(),
            "end": datetime.utcnow().isoformat(),
            "days": days
        },
        "statistics": {
            "total_messages": total_messages,
            "dkim_signed": {
                "count": dkim_signed,
                "percentage": round((dkim_signed / total_messages * 100), 2) if total_messages else 0
            },
            "spf_verified": {
                "count": spf_verified,
                "percentage": round((spf_verified / total_messages * 100), 2) if total_messages else 0
            },
            "dmarc_compliant": {
                "count": dmarc_compliant,
                "percentage": round((dmarc_compliant / total_messages * 100), 2) if total_messages else 0
            }
        }
    }

@router.get("/failure-reasons")
async def get_failure_reasons(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get failure reasons breakdown"""
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get failed messages grouped by response code
    query = db.query(
        Message.response_code,
        Message.response_message,
        func.count(Message.id).label('count')
    ).filter(
        Message.user_id == current_user.id,
        Message.status.in_([MessageStatus.FAILED, MessageStatus.BOUNCED]),
        Message.created_at >= start_date
    ).group_by(
        Message.response_code,
        Message.response_message
    ).order_by(
        func.count(Message.id).desc()
    ).all()
    
    failure_reasons = []
    for code, message, count in query:
        failure_reasons.append({
            "code": code,
            "message": message,
            "count": count
        })
    
    return {
        "period": {
            "start": start_date.isoformat(),
            "end": datetime.utcnow().isoformat(),
            "days": days
        },
        "failures": failure_reasons
    }

@router.get("/ip-usage")
async def get_ip_usage_stats(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get IP address usage statistics"""
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # IPv4 usage
    ipv4_query = db.query(
        Message.ipv4_used,
        func.count(Message.id).label('count'),
        func.sum(func.cast(Message.status == MessageStatus.SENT, type_=int)).label('sent')
    ).filter(
        Message.user_id == current_user.id,
        Message.ipv4_used.isnot(None),
        Message.created_at >= start_date
    ).group_by(Message.ipv4_used).all()
    
    # IPv6 usage
    ipv6_query = db.query(
        Message.ipv6_used,
        func.count(Message.id).label('count'),
        func.sum(func.cast(Message.status == MessageStatus.SENT, type_=int)).label('sent')
    ).filter(
        Message.user_id == current_user.id,
        Message.ipv6_used.isnot(None),
        Message.created_at >= start_date
    ).group_by(Message.ipv6_used).all()
    
    ipv4_stats = []
    for ip, count, sent in ipv4_query:
        ipv4_stats.append({
            "address": ip,
            "messages": count,
            "sent": sent or 0,
            "success_rate": round(((sent or 0) / count * 100), 2) if count else 0
        })
    
    ipv6_stats = []
    for ip, count, sent in ipv6_query:
        ipv6_stats.append({
            "address": ip,
            "messages": count,
            "sent": sent or 0,
            "success_rate": round(((sent or 0) / count * 100), 2) if count else 0
        })
    
    return {
        "period": {
            "start": start_date.isoformat(),
            "end": datetime.utcnow().isoformat(),
            "days": days
        },
        "ipv4": ipv4_stats,
        "ipv6": ipv6_stats
    }
