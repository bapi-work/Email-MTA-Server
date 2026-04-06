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

### 10. Suppression List
- **SES-style address suppression** — block sending to bounced or complained addresses
- **Bulk add**: upload multiple addresses via JSON
- **Reason tracking**: `bounce`, `complaint`, `manual`, `unsubscribe`
- **Pre-delivery check**: SMTP server checks suppression list before sending
- **Stats API**: total counts broken down by reason
- **Search**: look up any address instantly

### 11. Routing Rules (Virtual MTAs)
- **PowerMTA-parity**: define rules per destination domain, sender, or IP
- **Match types**: domain, sender, IP, or wildcard
- **Per-rule**: source IP, max connections, message rate, priority
- **Active/inactive toggle**: enable or disable at runtime without deletion

### 12. Webhooks & Event Delivery
- **GreenArrow-parity**: HTTP POST webhook delivery for email events
- **Events**: `send`, `bounce`, `complaint`, `delivery`, `open`, `click`
- **HMAC signing**: optional secret-key signing of payloads
- **Test delivery**: send a test event payload from the admin UI
- **Active/inactive toggle**: pause webhooks without deletion

### 13. Open & Click Tracking
- **Open tracking**: 1px transparent pixel injection
- **Click tracking**: URL rewriting through tracking domain
- **Configurable tracking domain**: use your own subdomain
- **Per-domain toggle**: enable/disable per sending domain

### 14. IP Warmup Scheduler
- **Automated ramp-up**: define per-IP daily send limits by day number
- **Hourly sub-limits**: optional hourly cap alongside daily cap
- **Multiple schedules per IP**: track multiple warmup phases
- **Enable/disable**: pause warmup without deleting schedule

### 15. ISP Traffic Shaping Profiles
- **6 built-in ISP profiles**: Gmail, Yahoo, Outlook, Apple Mail, Comcast, Generic
- **Per-profile settings**: max connections, messages per connection, rate (msgs/sec), retry delay
- **Apply to routing rule**: link a profile to a specific routing rule in one click

### 16. Mailbox Simulator
- **SES Mailbox Simulator parity** — test delivery outcomes without real recipients
- **6 scenarios**: `success`, `bounce`, `complaint`, `block`, `slowdown`, `ooo`
- **Safe testing**: never sends real mail
- **Recommendations**: each scenario includes suggested remediation steps

### 17. Configuration Sets
- **SES-parity**: group emails by use case (transactional, marketing, etc.)
- **Per-set tracking**: override open/click tracking settings
- **Webhook linkage**: route events from a config set to a specific webhook
- **Specify at send time**: include `configuration_set` in HTTP Send API payload

### 18. HTTP Send API
- **GreenArrow-parity**: submit emails via REST POST — no SMTP client required
- **Full headers**: from, to, cc, bcc, reply-to, subject, text, HTML
- **Priority control**: set message delivery priority
- **Delivery logs**: per-message SMTP log viewer
- **Status lookup**: query delivery status by message ID

### 19. Reputation Dashboard
- **Sender score** (0–100) with letter grade
- **Trend charts**: 7/14/30/90-day time series for bounces, complaints, delivery rate
- **Per-domain health**: individual score breakdown per sending domain
- **Smart recommendations**: auto-generated advice when metrics cross warning thresholds

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

All tables are auto-created at startup via SQLAlchemy `Base.metadata.create_all`:

| Table | Purpose |
|---|---|
| `users` | Accounts, roles, API keys, rate limits |
| `domains` | Domains with SPF/DKIM/DMARC config |
| `messages` | Queued/sent messages with delivery status |
| `api_logs` | API request audit log |
| `routing_rules` | Virtual MTA-style routing rules |
| `webhooks` | Event webhook endpoint definitions |
| `suppression_list` | Suppressed email addresses |
| `ip_warmup_schedules` | Per-IP daily send ramp-up schedule |
| `configuration_sets` | SES-style email grouping |
| `delivery_logs` | Per-message SMTP delivery log entries |

### API Endpoints Structure

```
/api/v1/
├── auth/
│   ├── login
│   ├── register
│   ├── refresh
│   └── me
├── users/
│   ├── GET / POST
│   ├── /{id} GET PATCH DELETE
│   └── /{id}/api-key POST DELETE
├── domains/
│   ├── GET / POST
│   ├── /{id} GET PATCH DELETE
│   ├── /{id}/verify-dns
│   ├── /{id}/generate-spf
│   └── /{id}/generate-dmarc
├── queues/
│   ├── /stats
│   ├── /messages GET
│   ├── /messages/{id} GET DELETE
│   ├── /messages/{id}/retry PATCH
│   ├── /purge POST
│   └── /requeue-deferred POST
├── smtp/
│   ├── /config GET
│   ├── /authentication GET
│   ├── /test-connection/{domain_id} POST
│   ├── /test-authentication/{domain_id} POST
│   ├── /server-info GET
│   ├── /ip-pool GET
│   ├── /ip-pool/add POST
│   ├── /ip-pool/{ip} DELETE
│   ├── /routing-rules GET POST
│   ├── /routing-rules/{id} PUT DELETE
│   ├── /webhooks GET POST
│   ├── /webhooks/{id} PUT DELETE
│   ├── /webhooks/{id}/test POST
│   ├── /tracking GET PUT
│   ├── /warmup GET POST
│   ├── /warmup/{id} PUT DELETE
│   ├── /isp-profiles GET
│   ├── /isp-profiles/apply POST
│   ├── /simulator/scenarios GET
│   ├── /simulator/test POST
│   ├── /configuration-sets GET POST
│   └── /configuration-sets/{id} PUT DELETE
├── suppressions/
│   ├── GET POST
│   ├── /check GET
│   ├── /stats GET
│   ├── /{id} DELETE
│   └── /email/{email} DELETE
├── reputation/
│   ├── /score GET
│   ├── /dashboard GET
│   ├── /recommendations GET
│   └── /domain-health GET
├── send/
│   ├── POST
│   ├── /status/{message_id} GET
│   └── /logs GET
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

## Comparison with PowerMTA, GreenArrow, and Amazon SES

| Feature | CloudMTA | PowerMTA | GreenArrow | Amazon SES |
|---|:---:|:---:|:---:|:---:|
| SMTP Server (25/587/465) | ✅ | ✅ | ✅ | ✅ |
| SPF / DKIM / DMARC | ✅ | ✅ | ✅ | ✅ |
| IPv4/IPv6 Rotation | ✅ | ✅ | ✅ | ✅ |
| Admin Portal | ✅ | ✅ | ✅ | ✅ |
| REST API | ✅ | ✅ | ✅ | ✅ |
| Routing Rules / Virtual MTAs | ✅ | ✅ | ✅ | Partial |
| Webhooks / Event Delivery | ✅ | ✅ | ✅ | ✅ |
| Suppression List | ✅ | ✅ | ✅ | ✅ |
| Reputation Dashboard / VDM | ✅ | Partial | ✅ | ✅ |
| IP Warmup Schedule | ✅ | Manual | ✅ | ✅ |
| ISP Traffic Shaping Profiles | ✅ | ✅ | ✅ | Partial |
| Mailbox Simulator | ✅ | ❌ | ❌ | ✅ |
| Configuration Sets | ✅ | ❌ | Partial | ✅ |
| HTTP Send API (no SMTP client) | ✅ | ❌ | ✅ | ✅ |
| Self-hosted / Open-source | ✅ | ❌ | ❌ | ❌ |
| Docker-native | ✅ | Limited | Limited | N/A |

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
- **Production**: Use `docker-compose.prod.yml` for multi-worker backend (`--workers 4`)
