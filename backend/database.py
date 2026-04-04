"""Database configuration and models"""

from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, JSON, Enum, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum
from config import settings

# Database engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=settings.DEBUG
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base
Base = declarative_base()

def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Enums
class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"
    RESTRICTED = "restricted"

class DomainStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    VERIFICATION_PENDING = "verification_pending"

class MessageStatus(str, enum.Enum):
    QUEUED = "queued"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"
    BOUNCED = "bounced"
    DEFERRED = "deferred"

# Models
class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index('idx_email', 'email'),
        Index('idx_username', 'username'),
    )
    
    id = Column(Integer, primary_key=True)
    username = Column(String(255), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    api_key = Column(String(255), unique=True, nullable=True)
    api_key_created_at = Column(DateTime, nullable=True)
    ipv4_addresses = Column(JSON, default=[])
    ipv6_addresses = Column(JSON, default=[])
    rate_limit_per_second = Column(Integer, default=100)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    domains = relationship("Domain", back_populates="owner")
    api_logs = relationship("APILog", back_populates="user")
    
    def __repr__(self):
        return f"<User {self.username}>"

class Domain(Base):
    __tablename__ = "domains"
    __table_args__ = (
        Index('idx_domain_name', 'domain_name'),
        Index('idx_owner_id', 'owner_id'),
    )
    
    id = Column(Integer, primary_key=True)
    domain_name = Column(String(255), unique=True, nullable=False)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    status = Column(Enum(DomainStatus), default=DomainStatus.VERIFICATION_PENDING)
    
    # SPF Settings
    spf_record = Column(String(1000))
    spf_verified = Column(Boolean, default=False)
    spf_verified_at = Column(DateTime, nullable=True)
    
    # DKIM Settings
    dkim_public_key = Column(Text)
    dkim_private_key = Column(Text)  # Encrypted
    dkim_selector = Column(String(255), default="default")
    dkim_enabled = Column(Boolean, default=True)
    dkim_signing_enabled = Column(Boolean, default=True)
    
    # DMARC Settings
    dmarc_policy = Column(String(10), default="none")  # none, quarantine, reject
    dmarc_rua_email = Column(String(255))
    dmarc_ruf_email = Column(String(255))
    dmarc_percent = Column(Integer, default=100)
    dmarc_enabled = Column(Boolean, default=False)
    
    # IP Settings
    authorized_ipv4 = Column(JSON, default=[])
    authorized_ipv6 = Column(JSON, default=[])
    
    # Rate Limiting
    rate_limit_per_second = Column(Integer, default=100)
    daily_limit = Column(Integer, default=100000)
    
    # Settings
    use_tls = Column(Boolean, default=True)
    priority = Column(Integer, default=10)
    is_verified = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    owner = relationship("User", back_populates="domains")
    messages = relationship("Message", back_populates="domain")
    
    def __repr__(self):
        return f"<Domain {self.domain_name}>"

class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index('idx_message_id', 'message_id'),
        Index('idx_status', 'status'),
        Index('idx_user_id', 'user_id'),
        Index('idx_created_at', 'created_at'),
    )
    
    id = Column(Integer, primary_key=True)
    message_id = Column(String(255), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    domain_id = Column(Integer, ForeignKey('domains.id'), nullable=False)
    
    from_email = Column(String(255), nullable=False)
    to_email = Column(String(255), nullable=False)
    subject = Column(String(255))
    
    headers = Column(JSON)
    body = Column(Text)
    
    status = Column(Enum(MessageStatus), default=MessageStatus.QUEUED)
    priority = Column(Integer, default=10)
    
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=24)
    
    ipv4_used = Column(String(255))
    ipv6_used = Column(String(255))
    
    dkim_signed = Column(Boolean, default=False)
    spf_verified = Column(Boolean, default=False)
    dmarc_compliant = Column(Boolean, default=False)
    
    response_code = Column(String(10))
    response_message = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    domain = relationship("Domain", back_populates="messages")
    
    def __repr__(self):
        return f"<Message {self.message_id}>"

class APILog(Base):
    __tablename__ = "api_logs"
    __table_args__ = (
        Index('idx_user_id', 'user_id'),
        Index('idx_created_at', 'created_at'),
    )
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    method = Column(String(10))
    path = Column(String(500))
    status_code = Column(Integer)
    
    request_body = Column(JSON)
    response_time_ms = Column(Float)
    
    ip_address = Column(String(255))
    user_agent = Column(String(500))
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="api_logs")

# Create all tables
Base.metadata.create_all(bind=engine)
