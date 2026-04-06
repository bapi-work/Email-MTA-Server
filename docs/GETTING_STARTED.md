# CloudMTA - Getting Started Guide

## What is CloudMTA?

CloudMTA is a professional-grade SMTP server built with modern technology. It provides:
- **Bulk email sending capabilities**
- **IPv4 and IPv6 support with intelligent rotation**
- **Email authentication (SPF, DKIM, DMARC)**
- **REST API for programmatic control — including HTTP Send (no SMTP client required)**
- **Web-based admin portal**
- **Real-time analytics and monitoring**
- **Multi-user and multi-domain support**
- **Suppression List** — SES-style address suppression with bounce/complaint tracking
- **Reputation Dashboard** — real-time sender score, trends, and smart recommendations
- **IP Warmup Scheduler** — automated daily send-volume ramp-up per IP
- **Routing Rules** — virtual MTA-style routing per domain/sender/IP
- **Webhooks** — event delivery to external endpoints
- **Open & Click Tracking** — pixel-based and URL-rewriting tracking
- **ISP Traffic Shaping Profiles** — per-ISP connection limits for Gmail, Yahoo, Outlook, and more
- **Mailbox Simulator** — test delivery scenarios without sending real mail
- **Configuration Sets** — group emails by use case with independent tracking

## 5-Minute Quick Start

### Step 1: Install Prerequisites

Download and install:
- [Docker Desktop](https://www.docker.com/products/docker-desktop) - includes Docker and Docker Compose
- [Git](https://git-scm.com/) (optional, for version control)

### Step 2: Get CloudMTA

Option A: Using Git
```bash
git clone https://github.com/yourusername/cloudmta.git
cd cloudmta
```

Option B: Download the ZIP file
```bash
# Download cloudmta-main.zip from GitHub
unzip cloudmta-main.zip
cd cloudmta-main
```

### Step 3: Start the Services

```bash
docker-compose up -d
```

This starts all services automatically. Watch the startup:
```bash
docker-compose logs -f
```

Wait for messages like:
```
cloudmta_backend | Application startup complete
cloudmta_smtp | CloudMTA SMTP server started successfully
```

### Step 4: Access the Admin Portal

Open your browser and go to:
```
http://localhost:3000
```

**Login with default credentials:**
- Email: `admin@yourdomain.com`
- Password: `ChangeMe123!`

⚠️ **Change this password after first login!**

### Step 5: Send Your First Email

Using the API:
```bash
# Get authentication token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "ChangeMe123!"
  }'

# Response includes access_token - copy it

# Send test email via SMTP (telnet example)
telnet localhost 25
> EHLO localhost
> AUTH PLAIN
> [base64 encoded admin@yourdomain.com:ChangeMe123!]
> MAIL FROM:<sender@yourdomain.com>
> RCPT TO:<recipient@example.com>
> DATA
> Subject: Test Email
> 
> This is a test email from CloudMTA
> .
> QUIT
```

Or use the admin portal:
1. Go to **Domains** → **Add Domain**
2. Enter your domain name
3. Follow the SPF/DKIM/DMARC setup instructions
4. Go to **Message Queue** to send test emails

## Common Tasks

### Add a New User

**Via Admin Portal:**
1. Navigate to Users section
2. Click "Add User"
3. Fill in email, password, full name
4. Click Create

**Via API:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "SecurePassword123!",
    "full_name": "New User"
  }'
```

### Add a Sending Domain

**Via Admin Portal:**
1. Go to **Domains** → **Add Domain**
2. Enter domain name (e.g., `mail.example.com`)
3. Note the DKIM public key provided
4. Add DNS records:
   - **SPF**: Copy the generated SPF record to DNS TXT
   - **DKIM**: Add DKIM public key to DNS
   - **DMARC**: Configure DMARC policy

**Via API:**
```bash
curl -X POST http://localhost:8000/api/v1/domains/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain_name": "mail.example.com"}'
```

### Generate API Key

**Via Admin Portal:**
1. Go to Users → Select User
2. Click "Generate API Key"
3. Copy the key (shown only once!)

**Via API:**
```bash
curl -X POST http://localhost:8000/api/v1/users/1/api-key \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "My Integration"}'
```

### Check Message Queue

**Via Admin Portal:**
1. Go to **Message Queue** section
2. View message status and statistics
3. Retry failed messages if needed

**Via API:**
```bash
# Get queue statistics
curl http://localhost:8000/api/v1/queues/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# List messages
curl http://localhost:8000/api/v1/queues/messages \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific message status
curl http://localhost:8000/api/v1/queues/messages/{message_id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### View Analytics

**Via Admin Portal:**
1. Go to **Analytics** section
2. View delivery statistics
3. Check authentication compliance
4. Analyze failure reasons

**Via API:**
```bash
# Dashboard stats
curl http://localhost:8000/api/v1/analytics/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"

# Delivery by domain
curl http://localhost:8000/api/v1/analytics/delivery-by-domain \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Send Email via HTTP API (No SMTP Client Needed)

CloudMTA includes a REST Send API — useful for application integrations without an SMTP library.

```bash
# Get auth token first
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"ChangeMe123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Send an email via HTTP REST API
curl -X POST http://localhost:8000/api/v1/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_email": "sender@yourdomain.com",
    "from_name": "My App",
    "to": ["recipient@example.com"],
    "subject": "Hello from CloudMTA",
    "text_body": "Plain text content",
    "html_body": "<p>Hello from <strong>CloudMTA</strong>!</p>",
    "configuration_set": "transactional"
  }'
```

### Check Sender Reputation

**Via Admin Portal:**
1. Go to **Reputation** section
2. Review your sender score (0–100 with letter grade)
3. Check bounce and complaint rate trends
4. Follow the smart recommendations if any warnings appear

**Via API:**
```bash
# Get overall score (last 7 days)
curl http://localhost:8000/api/v1/reputation/score?days=7 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get smart recommendations
curl http://localhost:8000/api/v1/reputation/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Manage Suppression List

Suppressed addresses are never delivered to — they are checked before sending.

**Via Admin Portal:**
1. Go to **Suppression List** section
2. Add addresses manually or in bulk
3. Check if an address is suppressed using the search box
4. View totals by reason (bounce, complaint, manual, unsubscribe)

**Via API:**
```bash
# Add suppressed addresses
curl -X POST http://localhost:8000/api/v1/suppressions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"addresses": [{"email": "bad@example.com", "reason": "bounce"}]}'

# Check if suppressed
curl "http://localhost:8000/api/v1/suppressions/check?email=bad@example.com" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get stats
curl http://localhost:8000/api/v1/suppressions/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Set Up IP Warmup

Use IP Warmup to ramp up a new sending IP over time and avoid ISP blocks.

**Via Admin Portal:**
1. Go to **Settings** → **IP Warmup** tab
2. Add a schedule entry for your new IP
3. Set the day number and daily limit (e.g., Day 1 = 500 emails)
4. Enable the schedule and add entries for subsequent days

**Via API:**
```bash
curl -X POST http://localhost:8000/api/v1/smtp/warmup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ip_address": "192.0.2.20",
    "day_number": 1,
    "daily_limit": 500,
    "hourly_limit": 50
  }'
```

## SMTP Configuration for Clients

### Connection Details

| Setting | Value |
|---------|-------|
| **SMTP Server** | localhost (or your server IP) |
| **SMTP Port** | 25 (plain), 587 (STARTTLS) |
| **SMTPS Port** | 465 (SSL/TLS) |
| **Authentication** | Plain or Login |
| **Username** | Your email address |
| **Password** | Your password |

### Example: Configure Mail Client

**Thunderbird:**
1. Tools → Account Settings
2. Add Mail Account
3. Set SMTP Server to `localhost:587`
4. Enable STARTTLS
5. Set username to your email

**PHP (using PHPMailer):**
```php
$mail = new PHPMailer(true);
$mail->Host = 'localhost';
$mail->Port = 587;
$mail->SMTPAuth = true;
$mail->Username = 'sender@yourdomain.com';
$mail->Password = 'ChangeMe123!';
$mail->SMTPSecure = 'tls';
$mail->setFrom('sender@yourdomain.com');
$mail->addAddress('recipient@example.com');
$mail->Subject = 'Test Email';
$mail->Body = 'Hello from CloudMTA!';
$mail->send();
```

**Python (using smtplib):**
```python
import smtplib
from email.mime.text import MIMEText

msg = MIMEText('Hello from CloudMTA!')
msg['Subject'] = 'Test Email'
msg['From'] = 'sender@yourdomain.com'
msg['To'] = 'recipient@example.com'

smtp = smtplib.SMTP('localhost', 587)
smtp.starttls()
smtp.login('sender@yourdomain.com', 'ChangeMe123!')
smtp.send_message(msg)
smtp.quit()
```

**Node.js (using nodemailer):**
```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 587,
  secure: false,
  auth: {
    user: 'sender@yourdomain.com',
    pass: 'ChangeMe123!'
  }
});

transporter.sendMail({
  from: 'sender@yourdomain.com',
  to: 'recipient@example.com',
  subject: 'Test Email',
  text: 'Hello from CloudMTA!'
}, (err, info) => {
  if (err) console.log(err);
  else console.log('Email sent');
});
```

## Troubleshooting

### Can't access the admin portal

**Check if services are running:**
```bash
docker-compose ps
```

**All services should show "Up"**

**Check logs for errors:**
```bash
docker-compose logs backend
docker-compose logs frontend
```

### SMTP connection refused

**Check if SMTP is running:**
```bash
docker-compose logs smtp-server
```

**Try telnet:**
```bash
telnet localhost 25
```

Should see: `220 cloudmta ESMTP`

### Authentication fails

**Check credentials:**
- Default: `admin@yourdomain.com` / `ChangeMe123!`
- Verify user exists: Check Users section in admin portal
- Check password case sensitivity

**Debug auth:**
```bash
docker-compose logs smtp-server
# Look for AUTH attempts
```

### Messages stuck in queue

**Check queue status:**
```bash
curl http://localhost:8000/api/v1/queues/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**View queue logs:**
```bash
docker-compose logs backend
```

**Requeue deferred messages:**
```bash
curl -X POST http://localhost:8000/api/v1/queues/requeue-deferred \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Database errors

**Check database logs:**
```bash
docker-compose logs postgres
```

**Verify database is accessible:**
```bash
docker-compose exec postgres psql -U cloudmta -d cloudmta_db -c "SELECT 1"
```

**Reset database (⚠️ DELETES ALL DATA):**
```bash
docker-compose down
docker volume rm cloudmta_postgres_data redis_data
docker-compose up -d
```

## Next Steps

1. **Read the full documentation:**
   - [API Documentation](API.md)
   - [Deployment Guide](DEPLOYMENT.md)
   - [Features & Architecture](FEATURES_ARCHITECTURE.md)

2. **Configure your first domain:**
   - Add a domain in the admin portal
   - Set up DNS records (SPF, DKIM, DMARC)
   - Verify setup with the verification tool

3. **Integrate with your application:**
   - Use the SMTP server as your mail relay (ports 25/587/465)
   - Or use the HTTP Send REST API for programmatic access — no SMTP client required
   - See API examples above and in `docs/API.md`

4. **Manage deliverability:**
   - Set up Suppression List to auto-block bounced/complained addresses
   - Configure IP Warmup for new sending IPs
   - Review the Reputation Dashboard regularly

5. **Tune routing and compliance:**
   - Add Routing Rules for per-ISP traffic shaping
   - Apply ISP Profiles (Gmail, Yahoo, Outlook, etc.)
   - Configure Webhooks to receive delivery events
   - Add Configuration Sets to group emails by use case

6. **Secure your installation:**
   - Change all default passwords
   - Generate new API keys
   - Set up SSL/TLS certificates
   - Configure firewall rules
   - Use `docker-compose.prod.yml` for production

## Need Help?

- **API Documentation**: http://localhost:8000/docs
- **Swagger UI**: http://localhost:8000/docs
- **GitHub Issues**: Report bugs or request features
- **Documentation**: See `docs/` folder in repository

## What's Included?

```
cloudmta/
├── backend/              # FastAPI application
├── frontend/             # React admin portal
├── smtp-server/          # SMTP server implementation
├── database/             # Database schemas and migrations
├── config/               # Configuration files (nginx, etc.)
├── docs/                 # Documentation
│   ├── API.md           # API reference
│   ├── DEPLOYMENT.md    # Deployment guide
│   └── FEATURES_ARCHITECTURE.md
├── docker-compose.yml   # Container orchestration
├── .env                 # Environment configuration
└── README.md            # This file
```

## Feature Checklist

- ✅ SMTP Server (ports 25, 587, 465)
- ✅ SPF, DKIM, DMARC support
- ✅ IPv4 & IPv6 rotation
- ✅ Admin Web Portal (React + Ant Design)
- ✅ REST API with JWT auth & API keys
- ✅ HTTP Send API (no SMTP client required)
- ✅ User & Domain Management
- ✅ Message Queue with status tracking
- ✅ Analytics & Reporting
- ✅ Suppression List (SES-style)
- ✅ Reputation Dashboard (score, trends, recommendations)
- ✅ Routing Rules (Virtual MTAs)
- ✅ Webhooks (event delivery with HMAC signing)
- ✅ Open & Click Tracking
- ✅ IP Warmup Scheduler
- ✅ ISP Traffic Shaping Profiles
- ✅ Mailbox Simulator (6 test scenarios)
- ✅ Configuration Sets (SES-parity)
- ✅ Docker containerization (6 containers)
- ✅ PostgreSQL database (10 tables)
- ✅ Redis caching
- ✅ nginx reverse proxy with rate limiting
- ✅ Production overrides (docker-compose.prod.yml)
- ✅ Idle auto-logout (3 min inactivity)

## License

Proprietary - All rights reserved

---

**Ready to get started? Run `docker-compose up -d` and open http://localhost:3000!**
