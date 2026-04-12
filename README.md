# CloudMTA - Professional Email MTA Server

A production-ready, feature-rich SMTP server with admin portal, REST API, and enterprise-grade delivery infrastructure — with feature parity against PowerMTA, GreenArrow, and Amazon SES.

## Features

### Core Delivery
- **SMTP Protocol**: Full RFC 5321/5322 compliance — ports 25, 587, 465
- **Bulk Email**: High-volume delivery with queue management and retry logic
- **Dual Stack**: IPv4 & IPv6 with intelligent rotation
- **Email Authentication**: SPF, DKIM, DMARC checking and signing

### Routing & Traffic Shaping
- **Routing Rules**: Virtual MTA-style routing per domain/sender/IP (PowerMTA parity)
- **ISP Traffic Shaping Profiles**: Per-ISP connection limits for Gmail, Yahoo, Outlook, Apple Mail, Comcast, and Generic
- **IP Pool Management**: Add/remove sending IPs at runtime

### Deliverability & Compliance
- **Suppression List**: SES-style address suppression with bounce/complaint reason tracking
- **IP Warmup Scheduler**: Automated daily send-volume ramp-up per IP (GreenArrow parity)
- **Reputation Dashboard**: Real-time sender score (0–100), bounce/complaint rates, domain health, and smart recommendations
- **Configuration Sets**: Group emails by use case for independent tracking (SES parity)

### Webhooks & Tracking
- **Webhooks**: Event delivery to external endpoints (send, bounce, complaint, open, click)
- **Open Tracking**: Pixel-based email open tracking
- **Click Tracking**: URL rewriting for click tracking

### Testing & Simulation
- **Mailbox Simulator**: Test delivery scenarios — success, bounce, complaint, block, slowdown, OOO (SES Mailbox Simulator parity)

### HTTP Send API
- **REST Send API**: Submit emails via HTTP POST — no SMTP client required (GreenArrow parity)
- **Delivery Logs**: Per-message SMTP delivery log viewer

### Admin & Management
- **Admin Portal**: React web UI at port 80
- **User Management**: Multi-user with role-based access and per-user API keys
- **Domain Management**: Multiple domains with DNS verification
- **Queue Management**: Real-time queue stats and message management
- **Analytics**: Delivery, bounce, and complaint trend reports
- **Settings**: 14-tab settings panel covering all configuration areas

## Quick Start

### Prerequisites
- Docker & Docker Compose

### Installation

1. Navigate to the project directory:
```bash
cd "Email MTA Server"
```

2. Start all services:
```bash
docker-compose up -d
```

3. Access the admin portal:
```
http://localhost
```

Default credentials:
- Email: `admin@yourdomain.com`
- Password: `ChangeMe123!`

> **Important**: Change the default password and update `.env` secrets before exposing to the internet.

### Production Deployment

Use the production overrides file for multi-worker backend, hidden internal ports, and resource limits:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full production checklist.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           nginx Reverse Proxy  (Port 80/443)            │
│  Rate limiting, CORS, security headers, gzip            │
└────────┬─────────────────────────┬───────────────────────┘
         │ /api/*                  │ /*
┌────────v──────────┐    ┌─────────v──────────────────────┐
│  FastAPI Backend  │    │  React Frontend (Ant Design 5) │
│  Port 8000        │    │  Port 3000                     │
│  9 API routers    │    │  10 pages / 14-tab Settings    │
└──────┬────────────┘    └────────────────────────────────┘
       │
  ┌────┴──────────────────┐
  │                       │
┌─v──────────┐    ┌───────v───────┐    ┌──────────────────┐
│ PostgreSQL │    │ Redis         │    │  SMTP Server     │
│ Port 5432  │    │ Port 6379     │    │  Ports 25/587/465│
│ 9 tables   │    │ Queue/cache   │    │  aiosmtpd        │
└────────────┘    └───────────────┘    └──────────────────┘
```

## Comparison

| Feature | CloudMTA | PowerMTA | GreenArrow | Amazon SES |
|---|:---:|:---:|:---:|:---:|
| Routing Rules / Virtual MTAs | ✅ | ✅ | ✅ | Partial |
| Webhooks / Event Delivery | ✅ | ✅ | ✅ | ✅ |
| Suppression List | ✅ | ✅ | ✅ | ✅ |
| Reputation Dashboard | ✅ | Partial | ✅ | ✅ |
| IP Warmup Schedule | ✅ | Manual | ✅ | ✅ |
| ISP Traffic Shaping Profiles | ✅ | ✅ | ✅ | Partial |
| Mailbox Simulator | ✅ | ❌ | ❌ | ✅ |
| Configuration Sets | ✅ | ❌ | Partial | ✅ |
| HTTP Send API (no SMTP client) | ✅ | ❌ | ✅ | ✅ |
| Self-hosted / Open source | ✅ | ❌ | ❌ | ❌ |

## API Documentation

- Interactive Swagger UI: `http://localhost/docs`
- ReDoc: `http://localhost/redoc`
- Full API reference: [docs/API.md](docs/API.md)

## Documentation

| Document | Description |
|---|---|
| [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) | Step-by-step first-use guide |
| [docs/API.md](docs/API.md) | Complete REST API reference |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment & ops guide |
| [docs/FEATURES_ARCHITECTURE.md](docs/FEATURES_ARCHITECTURE.md) | Feature deep-dives & architecture |

## Configuration

All runtime configuration is managed via the `.env` file and the Settings UI. Key variables:

```env
SECRET_KEY=your-jwt-secret
POSTGRES_PASSWORD=your-db-password
REDIS_PASSWORD=your-redis-password
SMTP_HOSTNAME=mail.yourdomain.com
OPEN_TRACKING_ENABLED=true
CLICK_TRACKING_ENABLED=true
IP_WARMUP_ENABLED=true
```

## Security Considerations

- All API endpoints require JWT authentication
- SMTP connections support TLS/STARTTLS
- Passwords are hashed using bcrypt
- Rate limiting on all API routes (nginx)
- CORS with origin matching (no wildcard)
- `server_tokens off`, security headers
- Sessions auto-expire; idle auto-logout after 3 minutes
- Change `SECRET_KEY`, `POSTGRES_PASSWORD`, and `REDIS_PASSWORD` before production use

## Directory Structure

```
.
├── backend/
│   ├── main.py               # FastAPI app, router registration
│   ├── database.py           # SQLAlchemy models & table auto-creation
│   ├── config.py             # Settings from .env
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py           # JWT login/register
│       ├── users.py          # User CRUD, API keys
│       ├── domains.py        # Domain CRUD, DNS verification
│       ├── queues.py         # Queue stats & management
│       ├── analytics.py      # Dashboard & delivery reports
│       ├── smtp.py           # SMTP config, Routing Rules, Webhooks,
│       │                     # Tracking, Warmup, ISP Profiles,
│       │                     # Simulator, Config Sets, IP Pool
│       ├── suppressions.py   # Suppression list CRUD
│       ├── reputation.py     # Reputation scoring & recommendations
│       └── send.py           # HTTP Send API & delivery logs
├── frontend/
│   └── src/
│       ├── App.js            # Routes, nav
│       └── pages/
│           ├── DashboardPage.js
│           ├── DomainsPage.js
│           ├── UsersPage.js
│           ├── QueuesPage.js
│           ├── AnalyticsPage.js
│           ├── SuppressionsPage.js
│           ├── ReputationPage.js
│           ├── SettingsPage.js    # 14-tab settings panel
│           └── ProfilePage.js
├── smtp-server/              # aiosmtpd SMTP handler
├── config/
│   ├── nginx.conf            # Reverse proxy, rate limiting, headers
│   └── ssl/                  # TLS certificates (mount your own)
├── docs/                     # Extended documentation
├── docker-compose.yml        # Development orchestration
├── docker-compose.prod.yml   # Production overrides
├── .env                      # Secrets (git-ignored)
└── README.md
```

## License

Proprietary. All rights reserved.

## Support

For issues and feature requests, open a ticket with your support team.
