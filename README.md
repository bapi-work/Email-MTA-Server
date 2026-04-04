# CloudMTA - Professional Email MTA Server

A robust, feature-rich SMTP server with admin portal, API controls, and enterprise-grade security features comparable to Momentum, PowerMTA, and Halon.

## Features

- **SMTP Protocol Support**: Full RFC 5321/5322 compliance
- **Bulk Email Services**: Support for high-volume email delivery
- **Dual Stack Networking**: IPv4 & IPv6 with intelligent rotation
- **Authentication & Security**:
  - SPF (Sender Policy Framework)
  - DKIM (DomainKeys Identified Mail)
  - DMARC (Domain-based Message Authentication)
- **Admin Portal**: Web-based management interface
- **RESTful API**: Complete control via API endpoints
- **User Management**: Multi-user support with role-based access
- **Domain Management**: Multiple domain support with individual settings
- **Queue Management**: Sophisticated message queuing and retry logic
- **Rate Limiting**: Per-user, per-domain, and IP-based controls
- **Monitoring & Analytics**: Real-time delivery tracking
- **Docker Ready**: Complete containerization for easy deployment

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.9+
- Node.js 16+ (for frontend)
- PostgreSQL 13+

### Installation

1. Clone and navigate to project:
```bash
cd "Email MTA Server"
```

2. Start with Docker:
```bash
docker-compose up -d
```

3. Access the admin portal:
```
http://localhost:3000
```

Default credentials:
- Email: `admin@localhost`
- Password: `ChangeMe123!`

### Manual Setup

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python main.py
```

**SMTP Server:**
```bash
cd smtp-server
pip install -r requirements.txt
python smtp_server.py
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

## API Documentation

API endpoints are documented at: `http://localhost:8000/docs`

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           Admin Portal (React/Next.js)              │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP/HTTPS
┌──────────────────v──────────────────────────────────┐
│     RESTful API (FastAPI) - Port 8000               │
│  ├─ Users Management                                │
│  ├─ Domain Management                              │
│  ├─ Queue Management                               │
│  └─ Analytics & Monitoring                         │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
   ┌────v────┐ ┌──v──────┐ ┌─v──────────┐
   │PostgreSQL│ │Redis    │ │SMTP Handler│
   │Database  │ │(Queue)  │ │ Port 25/587│
   └──────────┘ └─────────┘ └────────────┘
```

## Configuration

See `config/` directory for detailed configuration options including:
- SMTP settings (ports, timeouts, etc.)
- IP rotation policies
- Authentication methods
- Rate limiting rules
- Database connections

## Security Considerations

- All API endpoints require authentication
- SMTP connections support TLS/STARTTLS
- Passwords are hashed using bcrypt
- DKIM keys are securely stored
- Rate limiting prevents abuse
- IP whitelisting/blacklisting available

## Directory Structure

```
.
├── backend/              # FastAPI application & API logic
├── frontend/             # React admin portal
├── smtp-server/          # SMTP server implementation
├── database/             # Database migrations & schemas
├── config/               # Configuration files
├── docs/                 # Documentation
├── docker-compose.yml    # Container orchestration
└── README.md            # This file
```

## License

Proprietary. All rights reserved.

## Support

For issues and feature requests, contact: support@cloudmta.local
