# CloudMTA API Documentation

## Authentication

All API endpoints (except login) require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Login Endpoint

**POST** `/api/v1/auth/login`

Request body:
```json
{
  "email": "admin@yourdomain.com",
  "password": "ChangeMe123!"
}
```

Response:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

## Users API

### List Users
**GET** `/api/v1/users/`

Query Parameters:
- `skip` (int): Number of records to skip (default: 0)
- `limit` (int): Number of records to return (default: 10, max: 100)

Response: Array of user objects

### Get User
**GET** `/api/v1/users/{user_id}`

Response: User object with details

### Update User
**PATCH** `/api/v1/users/{user_id}`

Request body:
```json
{
  "full_name": "John Doe",
  "rate_limit_per_second": 150
}
```

### Create API Key
**POST** `/api/v1/users/{user_id}/api-key`

Request body:
```json
{
  "description": "My API Key"
}
```

Response:
```json
{
  "api_key": "cloudmta_...",
  "created_at": "2026-04-04T12:34:56Z",
  "description": "My API Key"
}
```

## Domains API

### Create Domain
**POST** `/api/v1/domains/`

Request body:
```json
{
  "domain_name": "example.com"
}
```

Response: Domain object with auto-generated DKIM keys

### List Domains
**GET** `/api/v1/domains/`

Query Parameters:
- `skip` (int): Default 0
- `limit` (int): Default 10, max 100

### Get Domain Details
**GET** `/api/v1/domains/{domain_id}`

Response: Detailed domain object with DKIM keys, SPF, DMARC settings

### Update Domain
**PATCH** `/api/v1/domains/{domain_id}`

Request body:
```json
{
  "spf_record": "v=spf1 include:sendgrid.net ~all",
  "dmarc_policy": "quarantine",
  "dmarc_rua_email": "admin@example.com"
}
```

### Generate SPF Record
**POST** `/api/v1/domains/{domain_id}/generate-spf`

Query Parameters:
- `include_domains` (array): Domains to include in SPF
- `ips` (array): IP addresses to authorize

Response:
```json
{
  "spf_record": "v=spf1 ip4:192.0.2.1 include:cloudmta.local ~all",
  "instructions": "Add this TXT record to your DNS..."
}
```

### Verify DNS Records
**GET** `/api/v1/domains/{domain_id}/verify-dns`

Response:
```json
{
  "spf": {
    "verified": true,
    "record": "v=spf1..."
  },
  "dkim": {
    "verified": false,
    "public_key": "v=DKIM1; p=..."
  },
  "dmarc": {
    "verified": false,
    "record": "v=DMARC1; p=..."
  }
}
```

## Message Queue API

### Get Queue Stats
**GET** `/api/v1/queues/stats`

Response:
```json
{
  "total_messages": 1000,
  "queued": 150,
  "sending": 50,
  "sent": 750,
  "failed": 30,
  "bounced": 20,
  "deferred": 0
}
```

### List Queue Messages
**GET** `/api/v1/queues/messages`

Query Parameters:
- `skip` (int): Default 0
- `limit` (int): Default 10, max 100
- `status` (str): Filter by status (queued, sending, sent, failed, bounced, deferred)
- `domain_id` (int): Filter by domain

### Get Message Status
**GET** `/api/v1/queues/messages/{message_id}`

Response:
```json
{
  "message_id": "uuid",
  "status": "sent",
  "to_email": "recipient@example.com",
  "attempts": 1,
  "response_code": "250",
  "response_message": "OK",
  "dkim_signed": true,
  "spf_verified": true,
  "dmarc_compliant": true,
  "sent_at": "2026-04-04T12:34:56Z"
}
```

### Retry Failed Message
**PATCH** `/api/v1/queues/messages/{message_id}/retry`

Response: Updated message object with status reset to "queued"

### Delete Message
**DELETE** `/api/v1/queues/messages/{message_id}`

### Purge Old Messages
**POST** `/api/v1/queues/purge`

Query Parameters:
- `days` (int): Delete messages older than X days (default: 7)
- `status_filter` (str): Only delete messages with specific status

### Requeue Deferred Messages
**POST** `/api/v1/queues/requeue-deferred`

Response:
```json
{
  "requeued": 50,
  "message": "Requeued 50 deferred messages"
}
```

## SMTP Settings API

### Get SMTP Configuration
**GET** `/api/v1/smtp/config`

Response:
```json
{
  "hostname": "mail.cloudmta.local",
  "ports": {
    "smtp": 25,
    "submission": 587,
    "smtps": 465
  },
  "max_connections": 1000,
  "timeout": 30,
  "queue_size": 10000,
  "ipv4_enabled": true,
  "ipv6_enabled": true,
  "ip_rotation_enabled": true
}
```

### Get Authentication Settings
**GET** `/api/v1/smtp/authentication`

Response:
```json
{
  "spf_enabled": true,
  "dkim_enabled": true,
  "dmarc_enabled": true,
  "spf_check_enabled": true,
  "dkim_signing_enabled": true
}
```

### Test SMTP Connection
**POST** `/api/v1/smtp/test-connection/{domain_id}`

### Test Authentication
**POST** `/api/v1/smtp/test-authentication/{domain_id}`

Query Parameters:
- `test_email` (str): Email to test with

Response:
```json
{
  "domain": "example.com",
  "spf": {
    "enabled": true,
    "status": "verified",
    "verified": true
  },
  "dkim": {
    "enabled": true,
    "signing_enabled": true,
    "selector": "default",
    "key_present": true
  },
  "dmarc": {
    "enabled": true,
    "policy": "quarantine",
    "rua_email": "admin@example.com"
  }
}
```

## Analytics API

### Dashboard Stats
**GET** `/api/v1/analytics/dashboard`

Query Parameters:
- `days` (int): Default 7, max 90

Response includes summary statistics for the period

### Delivery by Domain
**GET** `/api/v1/analytics/delivery-by-domain`

Query Parameters:
- `days` (int): Default 7, max 90

### Hourly Stats
**GET** `/api/v1/analytics/hourly-stats`

Query Parameters:
- `days` (int): Default 1, max 7

### Authentication Stats
**GET** `/api/v1/analytics/authentication-stats`

Query Parameters:
- `days` (int): Default 7, max 90

### Failure Reasons
**GET** `/api/v1/analytics/failure-reasons`

Query Parameters:
- `days` (int): Default 7, max 90

### IP Usage Stats
**GET** `/api/v1/analytics/ip-usage`

Query Parameters:
- `days` (int): Default 7, max 90

## Error Responses

All errors return standard error format:

```json
{
  "error": "Error message here",
  "status_code": 400,
  "timestamp": "2026-04-04T12:34:56Z"
}
```

Common HTTP Status Codes:
- 200: Success
- 201: Created
- 204: No Content
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error
- 503: Service Unavailable

## Rate Limiting

Rate limiting is applied per user based on their settings. Default rate limits:
- API: 1000 requests/second
- Authentication: 5 requests/second
- SMTP: 100 messages/second (configurable per user/domain)

Rate limit information is returned in response headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Suppression List API

Base path: `/api/v1/suppressions`

### List Suppressions
**GET** `/api/v1/suppressions`

Query Parameters:
- `skip` (int): Default 0
- `limit` (int): Default 50, max 500
- `reason` (str): Filter by reason (`bounce`, `complaint`, `manual`, `unsubscribe`)
- `search` (str): Search by email

### Add Suppressions (Bulk)
**POST** `/api/v1/suppressions`

Request body:
```json
{
  "addresses": [
    {
      "email": "bounce@example.com",
      "reason": "bounce",
      "notes": "Hard bounce on 2026-04-04"
    }
  ]
}
```

### Check if Suppressed
**GET** `/api/v1/suppressions/check?email=user@example.com`

Response:
```json
{
  "email": "user@example.com",
  "suppressed": true,
  "reason": "bounce",
  "created_at": "2026-04-04T10:00:00Z"
}
```

### Get Suppression Stats
**GET** `/api/v1/suppressions/stats`

Response:
```json
{
  "total": 1520,
  "bounce": 1100,
  "complaint": 80,
  "manual": 320,
  "unsubscribe": 20
}
```

### Delete Suppression by ID
**DELETE** `/api/v1/suppressions/{id}`

### Delete Suppression by Email
**DELETE** `/api/v1/suppressions/email/{email}`

---

## Reputation API

Base path: `/api/v1/reputation`

### Get Reputation Score
**GET** `/api/v1/reputation/score?days=7`

Response:
```json
{
  "score": 87,
  "grade": "B+",
  "period_days": 7,
  "total_sent": 45000,
  "bounce_rate": 0.012,
  "complaint_rate": 0.0008,
  "delivery_rate": 0.988,
  "breakdown": {
    "delivery_score": 92,
    "bounce_score": 85,
    "complaint_score": 95,
    "engagement_score": 78
  }
}
```

### Get Reputation Dashboard (Trends)
**GET** `/api/v1/reputation/dashboard?days=30`

Response: Daily time-series for score, bounce rate, complaint rate, and delivery rate.

### Get Smart Recommendations
**GET** `/api/v1/reputation/recommendations`

Response:
```json
{
  "recommendations": [
    {
      "priority": "high",
      "category": "bounce",
      "title": "Bounce rate elevated",
      "message": "Bounce rate is 3.5% — above 2% threshold. Clean your list.",
      "action": "Review suppression list"
    }
  ]
}
```

### Get Per-Domain Health
**GET** `/api/v1/reputation/domain-health`

Response: Array of domain objects with individual bounce/complaint/score metrics.

---

## HTTP Send API

Base path: `/api/v1/send`

### Send Email via REST
**POST** `/api/v1/send`

Request body:
```json
{
  "from_email": "sender@yourdomain.com",
  "from_name": "Sender Name",
  "to": ["recipient@example.com"],
  "cc": [],
  "bcc": [],
  "reply_to": "replies@yourdomain.com",
  "subject": "Hello from CloudMTA",
  "text_body": "Plain text content",
  "html_body": "<p>HTML content</p>",
  "priority": 5,
  "configuration_set": "transactional",
  "tags": {"campaign": "welcome", "env": "prod"}
}
```

Response:
```json
{
  "message_id": "uuid",
  "status": "queued",
  "queued_at": "2026-04-04T12:34:56Z"
}
```

### Get Message Delivery Status
**GET** `/api/v1/send/status/{message_id}`

Response: Full message status including SMTP response codes and delivery timestamps.

### Get Delivery Logs
**GET** `/api/v1/send/logs`

Query Parameters:
- `skip` (int): Default 0
- `limit` (int): Default 50
- `message_id` (str): Filter by message ID
- `status` (str): Filter by status

---

## SMTP Extended API

### Routing Rules

**GET** `/api/v1/smtp/routing-rules` — list all rules

**POST** `/api/v1/smtp/routing-rules` — create rule
```json
{
  "name": "Gmail Route",
  "match_type": "domain",
  "match_value": "gmail.com",
  "source_ip": "192.0.2.10",
  "priority": 10,
  "max_connections": 5,
  "notes": "Gmail ISP limits"
}
```

**PUT** `/api/v1/smtp/routing-rules/{id}` — update rule

**DELETE** `/api/v1/smtp/routing-rules/{id}` — delete rule

---

### Webhooks

**GET** `/api/v1/smtp/webhooks` — list all webhooks

**POST** `/api/v1/smtp/webhooks` — create webhook
```json
{
  "name": "My Webhook",
  "url": "https://example.com/webhook",
  "events": ["bounce", "complaint", "delivery"],
  "secret": "optional-hmac-secret",
  "active": true
}
```

**PUT** `/api/v1/smtp/webhooks/{id}` — update webhook

**DELETE** `/api/v1/smtp/webhooks/{id}` — delete webhook

**POST** `/api/v1/smtp/webhooks/{id}/test` — send a test event payload

---

### Tracking

**GET** `/api/v1/smtp/tracking` — get current tracking config
```json
{
  "open_tracking": true,
  "click_tracking": true,
  "tracking_domain": "track.yourdomain.com"
}
```

**PUT** `/api/v1/smtp/tracking` — update tracking settings

---

### IP Warmup Schedules

**GET** `/api/v1/smtp/warmup` — list all warmup schedules

**POST** `/api/v1/smtp/warmup` — create schedule
```json
{
  "ip_address": "192.0.2.20",
  "day_number": 1,
  "daily_limit": 500,
  "hourly_limit": 50,
  "notes": "New IP warmup Day 1"
}
```

**PUT** `/api/v1/smtp/warmup/{id}` — update schedule

**DELETE** `/api/v1/smtp/warmup/{id}` — delete schedule

---

### ISP Profiles

**GET** `/api/v1/smtp/isp-profiles` — list built-in ISP profiles

Returns profiles for: Gmail, Yahoo, Outlook, Apple Mail, Comcast, Generic. Each includes:
- `max_connections`
- `max_messages_per_connection`
- `rate_limit` (msgs/sec)
- `retry_delay` (seconds)
- `notes`

**POST** `/api/v1/smtp/isp-profiles/apply` — apply a profile to a routing rule
```json
{
  "profile_name": "gmail",
  "routing_rule_id": 3
}
```

---

### Mailbox Simulator

**GET** `/api/v1/smtp/simulator/scenarios` — list available test scenarios

Scenarios: `success`, `bounce`, `complaint`, `block`, `slowdown`, `ooo`

**POST** `/api/v1/smtp/simulator/test`
```json
{
  "scenario": "bounce",
  "from_email": "sender@yourdomain.com",
  "notes": "Test hard bounce handling"
}
```

Response:
```json
{
  "scenario": "bounce",
  "simulated": true,
  "expected_behavior": "Message will be treated as hard bounce",
  "recommendation": "Verify suppression list adds this address automatically"
}
```

---

### Configuration Sets

**GET** `/api/v1/smtp/configuration-sets` — list all config sets

**POST** `/api/v1/smtp/configuration-sets` — create config set
```json
{
  "name": "transactional",
  "open_tracking": true,
  "click_tracking": true,
  "webhook_id": 1,
  "notes": "For transactional emails"
}
```

**PUT** `/api/v1/smtp/configuration-sets/{id}` — update

**DELETE** `/api/v1/smtp/configuration-sets/{id}` — delete

---

### Server Info & IP Pool

**GET** `/api/v1/smtp/server-info` — server hostname, version, active connections, TLS info

**GET** `/api/v1/smtp/ip-pool` — list all configured sending IPs

**POST** `/api/v1/smtp/ip-pool/add`
```json
{
  "ip_address": "192.0.2.30",
  "label": "Secondary IP",
  "active": true
}
```

**DELETE** `/api/v1/smtp/ip-pool/{ip}` — remove IP from pool
