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
  "email": "admin@localhost",
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
