# CloudMTA Features & Architecture

## Features Overview

### 1. SMTP Server
- **Full RFC Compliance**: Implements RFC 5321 & 5322 standards
- **Multiple Ports**: 
  - Port 25: Standard SMTP
  - Port 587: Submission (STARTTLS)
  - Port 465: SMTPS (immediate TLS)
- **TLS/SSL Support**: Secure connections with certificate validation
- **Authentication**: PLAIN and LOGIN mechanisms
- **Message Queuing**: Robust message queue with persistence
- **Rate Limiting**: Per-user, per-domain, and IP-based controls

### 2. Email Authentication
- **SPF (Sender Policy Framework)**
  - Automatic SPF record generation
  - DNS verification
  - Include domain support
  
- **DKIM (DomainKeys Identified Mail)**
  - Automatic key generation (2048-bit RSA)
  - Message signing with DKIM
  - Multiple selectors support
  - Key rotation support
  
- **DMARC (Domain-based Message Authentication)**
  - Policy enforcement (none, quarantine, reject)
  - Aggregate and forensic reporting
  - Per-domain configuration
  - Alignment checking

### 3. Bulk Email Support
- **High Volume Delivery**: Designed for sending thousands of messages
- **Recipient Management**: Handle large recipient lists
- **Template Support**: Dynamic content rendering
- **Scheduled Delivery**: Queue messages for scheduled sending
- **Batch Optimization**: Efficient batch processing

### 4. Dual Stack Networking
- **IPv4 Support**: Full IPv4 address support
- **IPv6 Support**: Complete IPv6 implementation
- **IP Rotation**: Intelligent rotation across multiple IPs
  - Round-robin rotation
  - Least-used IP selection
  - Custom rotation policies
- **IP Pool Management**: Add, remove, test IPs
- **Geo-distribution**: Support for multiple data centers

### 5. Admin Portal
- **Web-based Interface**: React-based admin dashboard
- **User Management**: Create, edit, delete users
- **Domain Management**: Full domain lifecycle management
- **Queue Monitoring**: Real-time queue status
- **Analytics Dashboard**: Comprehensive reporting
- **Settings Management**: System configuration
- **API Key Management**: Generate and revoke API keys

### 6. RESTful API
- **Complete API Coverage**: Full REST API for all operations
- **API Authentication**: JWT-based token authentication
- **API Versioning**: v1 API with upgrade path
- **Detailed Documentation**: Swagger/OpenAPI docs
- **Rate Limiting**: API-level rate limiting
- **Error Handling**: Comprehensive error responses

### 7. User & Domain Management
- **Multi-tenancy**: Support for multiple users
- **Domain Ownership**: User-specific domain management
- **Role-based Access**: Admin, User, Restricted roles
- **API Keys**: Per-user API keys for integrations
- **Usage Quotas**: Rate limits per user/domain
- **Custom Settings**: Per-domain configuration

### 8. Queue Management
- **Message Status Tracking**: Real-time status updates
- **Retry Logic**: Configurable retry attempts
- **Dead Letter Queue**: Failed message handling
- **Purging**: Automatic cleanup of old messages
- **Requeue**: Ability to retry deferred messages
- **Priority Support**: High/low priority delivery

### 9. Analytics & Reporting
- **Delivery Statistics**: Sent, failed, bounced counts
- **Success Rates**: Percentage calculations
- **Hourly Analytics**: Time-series data
- **Domain-wise Reports**: Per-domain breakdown
- **Authentication Stats**: SPF/DKIM/DMARC compliance
- **Failure Analysis**: Bounce and failure reasons
- **IP Usage**: IP-specific statistics

### 10. Security Features
- **Password Hashing**: bcrypt password hashing
- **JWT Tokens**: Secure token-based authentication
- **Token Expiration**: Short-lived access tokens
- **Refresh Tokens**: Long-lived refresh mechanism
- **API Key Security**: Unique API key generation
- **CORS**: Cross-origin request handling
- **TLS/SSL**: End-to-end encryption
- **SQL Injection Prevention**: Parameterized queries
- **CSRF Protection**: Built-in security headers

## Architecture

### Technology Stack

**Backend**
- Framework: FastAPI (Python)
- ORM: SQLAlchemy
- Server: Uvicorn
- Task Queue: Redis + Celery
- Database: PostgreSQL

**SMTP**
- Library: aiosmtpd (Python)
- Async: asyncio
- DKIM: dkimpy
- SPF: pyspf

**Frontend**
- Framework: React 18
- UI Library: Ant Design
- Routing: React Router v6
- HTTP Client: Axios
- Charts: Recharts

**Infrastructure**
- Containerization: Docker
- Orchestration: Docker Compose
- Reverse Proxy: Nginx
- Database: PostgreSQL 15
- Cache: Redis 7

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Admin Portal (React)                   │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTP/HTTPS
        ┌──────────v──────────┐
        │   Nginx (Proxy)      │
        │  (SSL/TLS, Auth)     │
        └──────────┬───────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
┌────v────┐   ┌────v────┐   ┌───v────┐
│ Frontend │   │ Backend  │   │  SMTP  │
│(React)  │   │(FastAPI) │   │ Server │
└─────────┘   └────┬─────┘   └────┬───┘
                   │               │
        ┌──────────┼───────────────┤
        │          │               │
   ┌────v───┐ ┌───v──────┐ ┌─────v─────┐
   │PostgreSQL│ │  Redis  │ │ Message  │
   │Database  │ │ (Queue) │ │  Queue   │
   └──────────┘ └─────────┘ └──────────┘
```

### Data Flow

1. **Email Submission**
   - Client connects to SMTP server (port 25/587/465)
   - Authenticates using username/password
   - Submits email message

2. **Message Processing**
   - Message parsed and validated
   - DKIM signature generated
   - Message stored in database
   - Message queued for delivery

3. **Delivery**
   - Message retrieved from queue
   - IP address selected (IPv4 or IPv6)
   - Message sent via SMTP
   - Response recorded in database

4. **Reporting**
   - Analytics aggregated from message records
   - Statistics exposed via API
   - Dashboard updated in real-time

### Database Schema

Key tables:
- `users` - User accounts and credentials
- `domains` - Registered domains with auth settings
- `messages` - Mail message records
- `bounces` - Bounce notifications
- `ip_addresses` - IP pool management
- `api_logs` - API request logging

### API Endpoints Structure

```
/api/v1/
├── auth/
│   ├── login
│   ├── refresh
│   └── me
├── users/
│   ├── GET / POST
│   ├── /{id} GET PATCH DELETE
│   ├── /{id}/api-key POST DELETE
│   └── /{id}/domains GET
├── domains/
│   ├── GET / POST
│   ├── /{id} GET PATCH DELETE
│   ├── /{id}/verify-dns
│   ├── /{id}/generate-spf
│   └── /{id}/generate-dmarc
├── queues/
│   ├── /stats GET
│   ├── /messages GET
│   ├── /messages/{id} GET
│   ├── /messages/{id}/retry PATCH
│   ├── /messages/{id} DELETE
│   └── /purge POST
├── smtp/
│   ├── /config GET
│   ├── /authentication GET
│   ├── /test-connection/{domain_id} POST
│   └── /test-authentication/{domain_id} POST
└── analytics/
    ├── /dashboard GET
    ├── /delivery-by-domain GET
    ├── /hourly-stats GET
    ├── /authentication-stats GET
    ├── /failure-reasons GET
    └── /ip-usage GET
```

### Message Flow Diagram

```
SMTP Client
    │
    ├─ EHLO/HELO
    │
    ├─ AUTH (LOGIN/PLAIN)
    │  └─ Validate against users table
    │
    ├─ MAIL FROM
    │  └─ Validate domain ownership
    │
    ├─ RCPT TO
    │  └─ Validate recipient
    │
    ├─ DATA
    │  ├─ Parse message
    │  ├─ Generate DKIM signature
    │  ├─ Store in database
    │  └─ Queue for delivery
    │
    └─ QUIT
```

### IP Rotation Mechanism

1. **Selection Algorithm**
   - Maintains list of available IPs (IPv4 and IPv6)
   - Tracks usage count per IP
   - Selects least-used IP for next message
   - Updates usage counter

2. **Configuration**
   - Per-user IP allocation
   - Per-domain IP override
   - IP rotation interval
   - Fallback IPs

3. **Monitoring**
   - Track delivery success per IP
   - Identify problematic IPs
   - Automatic reputation management

### Security Layers

1. **Network Level**
   - TLS/SSL encryption
   - Firewall rules
   - DDoS protection

2. **Application Level**
   - Input validation
   - SQL injection prevention
   - XSS protection
   - CSRF tokens

3. **API Level**
   - JWT authentication
   - API key validation
   - Rate limiting
   - Cors configuration

4. **Data Level**
   - Password hashing (bcrypt)
   - Encrypted connections
   - DKIM key storage
   - Database backups

## Comparison with Momentum, PowerMTA, Halon

| Feature | CloudMTA | Momentum | PowerMTA | Halon |
|---------|----------|----------|----------|-------|
| SMTP Server | ✓ | ✓ | ✓ | ✓ |
| SPF/DKIM/DMARC | ✓ | ✓ | ✓ | ✓ |
| IPv4/IPv6 Rotation | ✓ | ✓ | ✓ | ✓ |
| Admin Portal | ✓ | ✓ | ✓ | ✓ |
| RESTful API | ✓ | ✓ | ✓ | ✓ |
| Bulk Email Support | ✓ | ✓ | ✓ | ✓ |
| Queue Management | ✓ | ✓ | ✓ | ✓ |
| Analytics | ✓ | ✓ | ✓ | ✓ |
| Multi-tenant | ✓ | Limited | Limited | Limited |
| Open Source | ✓ | ✗ | ✗ | ✗ |
| Cloud Ready | ✓ | Limited | Limited | ✓ |
| Docker Support | ✓ | Limited | Limited | ✓ |

## Performance Specifications

- **Message Throughput**: 1000+ messages/second per instance
- **Queue Capacity**: 10,000 messages per domain
- **Connection Pool**: 1000 concurrent SMTP connections
- **Database**: Optimized for PostgreSQL 13+
- **Memory Usage**: ~500MB base + message buffer
- **Disk Usage**: ~1GB per million messages (with archiving)
- **API Response Time**: <100ms average

## Scalability

- **Horizontal**: Run multiple SMTP instances behind load balancer
- **Vertical**: Increase hardware resources
- **Database**: Connection pooling with PgBouncer
- **Cache**: Redis clustering support
- **Load Balancing**: Nginx, HAProxy, cloud LB support

## Future Enhancements

- Webhook support for bounce/delivery notifications
- Advanced ML-based spam filtering
- Inbound email support
- Postfix integration modules
- Mobile admin app
- Advanced compliance reporting (GDPR, CAN-SPAM)
- Third-party integrations (SendGrid, AWS SES compatibility)
