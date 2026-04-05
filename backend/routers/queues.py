"""Queue management router"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db, Message, User, MessageStatus
from schemas import QueueStatsResponse, MessageStatusResponse
import uuid

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

@router.get("/stats", response_model=QueueStatsResponse)
async def get_queue_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get queue statistics for current user"""
    
    # Get counts by status
    total_messages = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id
    ).scalar()
    
    queued = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.QUEUED
    ).scalar()
    
    sending = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.SENDING
    ).scalar()
    
    sent = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.SENT
    ).scalar()
    
    failed = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.FAILED
    ).scalar()
    
    bounced = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.BOUNCED
    ).scalar()
    
    deferred = db.query(func.count(Message.id)).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.DEFERRED
    ).scalar()
    
    return QueueStatsResponse(
        total_messages=total_messages or 0,
        queued=queued or 0,
        sending=sending or 0,
        sent=sent or 0,
        failed=failed or 0,
        bounced=bounced or 0,
        deferred=deferred or 0
    )

@router.get("/messages", response_model=list[MessageStatusResponse])
async def list_queue_messages(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: str = Query(None),
    domain_id: int = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List messages in queue"""
    
    query = db.query(Message).filter(Message.user_id == current_user.id)
    
    if status:
        query = query.filter(Message.status == status)
    
    if domain_id:
        query = query.filter(Message.domain_id == domain_id)
    
    messages = query.offset(skip).limit(limit).all()
    
    return messages

@router.get("/messages/{message_id}", response_model=MessageStatusResponse)
async def get_message_status(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get status of a specific message"""
    
    message = db.query(Message).filter(
        Message.message_id == message_id,
        Message.user_id == current_user.id
    ).first()
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    return message

@router.patch("/messages/{message_id}/retry", response_model=MessageStatusResponse)
async def retry_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retry a failed message"""
    
    message = db.query(Message).filter(
        Message.message_id == message_id,
        Message.user_id == current_user.id
    ).first()
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    if message.status not in [MessageStatus.FAILED, MessageStatus.DEFERRED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only retry failed or deferred messages"
        )
    
    if message.attempts >= message.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message has reached maximum retry attempts"
        )
    
    # Reset for retry
    message.status = MessageStatus.QUEUED
    message.attempts = 0
    
    db.commit()
    db.refresh(message)
    
    return message

@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a message from queue"""
    
    message = db.query(Message).filter(
        Message.message_id == message_id,
        Message.user_id == current_user.id
    ).first()
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    if message.status in [MessageStatus.SENDING]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete message currently being sent"
        )
    
    db.delete(message)
    db.commit()

@router.post("/purge")
async def purge_queue(
    status_filter: str = Query(None),
    days: int = Query(7),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Purge old messages from queue"""
    
    from datetime import timedelta, datetime
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.query(Message).filter(
        Message.user_id == current_user.id,
        Message.created_at < cutoff_date
    )
    
    if status_filter:
        query = query.filter(Message.status == status_filter)
    
    deleted_count = query.delete()
    db.commit()
    
    return {
        "deleted": deleted_count,
        "message": f"Purged {deleted_count} messages older than {days} days"
    }

@router.post("/requeue-deferred")
async def requeue_deferred_messages(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Requeue all deferred messages"""
    
    deferred_messages = db.query(Message).filter(
        Message.user_id == current_user.id,
        Message.status == MessageStatus.DEFERRED
    ).all()
    
    for message in deferred_messages:
        if message.attempts < message.max_attempts:
            message.status = MessageStatus.QUEUED
            message.attempts = 0
    
    db.commit()
    
    return {
        "requeued": len(deferred_messages),
        "message": f"Requeued {len(deferred_messages)} deferred messages"
    }
