"""Pydantic schemas for API request/response validation"""

from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# Auth Schemas
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Domain Schemas
class DomainCreate(BaseModel):
    domain_name: str = Field(..., min_length=3)
    
class DomainUpdate(BaseModel):
    status: Optional[str] = None
    spf_record: Optional[str] = None
    dkim_enabled: Optional[bool] = None
    dmarc_policy: Optional[str] = None
    dmarc_rua_email: Optional[EmailStr] = None
    rate_limit_per_second: Optional[int] = None
    daily_limit: Optional[int] = None

class DomainResponse(BaseModel):
    id: int
    domain_name: str
    status: str
    spf_verified: bool
    dkim_enabled: bool
    dmarc_enabled: bool
    is_verified: bool
    rate_limit_per_second: int
    daily_limit: int
    created_at: datetime

    class Config:
        from_attributes = True

class DomainDetailResponse(DomainResponse):
    spf_record: Optional[str]
    dkim_selector: Optional[str]
    dmarc_policy: Optional[str]
    dmarc_rua_email: Optional[str]
    authorized_ipv4: List[str]
    authorized_ipv6: List[str]

# Message Schemas
class SendEmailRequest(BaseModel):
    to: EmailStr
    subject: str = Field(..., max_length=255)
    body: str
    headers: Optional[Dict[str, str]] = None
    priority: Optional[int] = 10

class SendBulkEmailRequest(BaseModel):
    recipients: List[EmailStr]
    subject: str = Field(..., max_length=255)
    body: str
    from_email: Optional[EmailStr] = None
    headers: Optional[Dict[str, str]] = None
    priority: Optional[int] = 10

class EmailResponse(BaseModel):
    message_id: str
    status: str
    to: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True

class MessageStatusResponse(BaseModel):
    message_id: str
    status: str
    attempts: int
    response_code: Optional[str]
    response_message: Optional[str]
    dkim_signed: bool
    spf_verified: bool
    dmarc_compliant: bool
    sent_at: Optional[datetime]

    class Config:
        from_attributes = True

# Queue Schemas
class QueueStatsResponse(BaseModel):
    total_messages: int
    queued: int
    sending: int
    sent: int
    failed: int
    bounced: int
    deferred: int

# Analytics Schemas
class AnalyticsRequest(BaseModel):
    start_date: datetime
    end_date: datetime
    group_by: Optional[str] = "day"  # day, hour, week, month

class SendingStatsResponse(BaseModel):
    timestamp: datetime
    total_sent: int
    total_failed: int
    total_bounced: int
    success_rate: float
    avg_delivery_time_ms: float

class DeliveryReportResponse(BaseModel):
    domain: str
    total_messages: int
    sent: int
    failed: int
    bounced: int
    deferred: int
    success_rate: float

# SMTP Settings Schemas
class SMTPSettingsResponse(BaseModel):
    hostname: str
    ports: Dict[str, int]
    max_connections: int
    timeout: int
    queue_size: int
    ipv4_enabled: bool
    ipv6_enabled: bool
    ip_rotation_enabled: bool

class AuthenticationSettingsResponse(BaseModel):
    spf_enabled: bool
    dkim_enabled: bool
    dmarc_enabled: bool
    spf_check_enabled: bool
    dkim_signing_enabled: bool

# API Key Schemas
class APIKeyCreate(BaseModel):
    description: Optional[str] = None

class APIKeyResponse(BaseModel):
    api_key: str
    created_at: datetime
    description: Optional[str]

# Error Response
class ErrorResponse(BaseModel):
    error: str
    status_code: int
    timestamp: datetime

    class Config:
        from_attributes = True
