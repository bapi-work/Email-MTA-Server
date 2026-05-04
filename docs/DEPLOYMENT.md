# CloudMTA Deployment Guide

## Quick Start with Docker Compose

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 1.29+
- 2GB RAM minimum
- 10GB disk space minimum

### Installation Steps

1. **Clone or download the CloudMTA repository**

```bash
mkdir cloudmta
cd cloudmta
```

2. **Start the services**

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database (port 5432)
- Redis cache (port 6379)
- Backend API (port 8000)
- SMTP Server (ports 25, 587, 465)
- Frontend (port 3000)
- Nginx reverse proxy (ports 80, 443)

3. **Access the Admin Portal**

Open your browser and navigate to:
- HTTP: `http://localhost`
- HTTPS: `https://localhost` (with self-signed certificate)

4. **Default Credentials**

```
Email: admin@yourdomain.com
Password: ChangeMe123!
```

> Change the default password immediately after first login.

## Production Deployment

### Using docker-compose.prod.yml

A production overrides file is included. It enables:
- 4-worker uvicorn backend (no `--reload`)
- Internal ports hidden (postgres, redis, frontend not exposed on host)
- Resource limits on all services

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

> **Note**: Resource limits (`deploy.resources`) require **Docker Compose V2** (`docker compose`, bundled with Docker Desktop 3.3+ / Docker Engine 20.10+). The legacy `docker-compose` V1 binary silently ignores those limits. Verify with `docker compose version`.

### Pre-Flight Checklist

Before going live, complete all of the following in `.env`:

- [ ] `SECRET_KEY` — generate a new random 64-char secret
- [ ] `POSTGRES_PASSWORD` — change from default
- [ ] `REDIS_PASSWORD` — change from the dev default to a strong random value
- [ ] `SMTP_HOSTNAME` — set to your actual mail server FQDN
- [ ] `ENVIRONMENT=production`
- [ ] `DEBUG=false`
- [ ] `LOG_LEVEL=WARNING`
- [ ] `CORS_ORIGINS` — add your production domain (e.g. `https://mta.yourdomain.com`)
- [ ] Copy real TLS certificates to `config/ssl/cert.pem` and `config/ssl/key.pem`
- [ ] Change admin account password after first login
- [ ] Set `OPEN_TRACKING_ENABLED` and `CLICK_TRACKING_ENABLED` as needed
- [ ] Set `TRACKING_DOMAIN` to your tracking subdomain

### Environment Configuration

Edit the `.env` file before deploying:

```bash
# Change the secret key
SECRET_KEY=your-very-secure-secret-key-here

# Configure database
DATABASE_URL=postgresql://cloudmta:YOUR_SECURE_PASSWORD@postgres:5432/cloudmta_db

# Configure Redis
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@redis:6379/0

# Set environment
DEBUG=false
ENVIRONMENT=production
LOG_LEVEL=WARNING

# Configure SMTP
SMTP_HOSTNAME=mail.yourdomain.com
SMTP_PORT=25
SMTP_TLS_PORT=587
SMTP_SSL_PORT=465

# Set SMTP authentication
SMTP_AUTH_ENABLED=true

# CORS — add your production domain (comma-separated, no spaces)
CORS_ORIGINS=https://mta.yourdomain.com,http://localhost:3000
```

### SSL/TLS Certificate Setup

For production, replace the self-signed certificates:

```bash
# Copy your certificates to the config directory
cp /path/to/your/cert.pem config/ssl/cert.pem
cp /path/to/your/key.pem config/ssl/key.pem
```

### Database Backup

PostgreSQL database backup:

```bash
# Backup
docker exec cloudmta_postgres pg_dump -U cloudmta cloudmta_db > backup.sql

# Restore
docker exec -i cloudmta_postgres psql -U cloudmta cloudmta_db < backup.sql
```

> Tables are auto-created by SQLAlchemy at startup. No migration tool is required.

### Redis Backup

```bash
# Enable persistence (add to docker-compose.yml)
# command: redis-server --appendonly yes

# Backup
docker cp cloudmta_redis:/data/appendonly.aof ./redis-backup.aof

# Restore
docker cp ./redis-backup.aof cloudmta_redis:/data/appendonly.aof
docker restart cloudmta_redis
```

## Manual Setup (Without Docker)

### Prerequisites

- Python 3.9+
- Node.js 16+
- PostgreSQL 13+
- Redis 6+

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://user:password@localhost/cloudmta_db"
export REDIS_URL="redis://:yourpassword@localhost:6379/0"
export SECRET_KEY="your-secret-key"

# Tables are auto-created at startup — no migration step needed

# Start the API server
uvicorn main:app --host 0.0.0.0 --port 8000
```

### SMTP Server Setup

```bash
cd smtp-server

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://user:password@localhost/cloudmta_db"
export REDIS_URL="redis://localhost:6379/1"

# Start the SMTP server
python smtp_server.py
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Build for production
npm run build

# Or run in development
npm start
```

## Health Checks

### API Health Check

```bash
curl http://localhost:8000/health
```

### Database Health Check

```bash
docker exec cloudmta_postgres pg_isready -U cloudmta
```

### Redis Health Check

```bash
docker exec cloudmta_redis redis-cli -a YOUR_REDIS_PASSWORD --no-auth-warning ping
```

### SMTP Health Check

```bash
telnet localhost 25
# Should see: "220 cloudmta ESMTP"
```

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f smtp-server
docker-compose logs -f postgres
```

### Performance Monitoring

Monitor the metrics available in the Analytics section of the admin portal:
- Message delivery rates
- Authentication success rates
- Queue depth
- IP rotation stats
- Failure reasons

## Troubleshooting

### Connection Refused

**Backend can't connect to database:**
```bash
docker-compose logs postgres
# Check DATABASE_URL in .env
```

**SMTP can't connect to API:**
```bash
docker-compose logs smtp-server
# Check if backend is running: docker-compose ps
```

### Port Already in Use

```bash
# Check what's using the port
sudo lsof -i :25
sudo lsof -i :587
sudo lsof -i :8000
sudo lsof -i :3000

# Change ports in docker-compose.yml if needed
```

### Database Issues

```bash
# Check database status
docker-compose logs postgres

# Reset database (WARNING: Deletes all data)
docker-compose down
docker volume rm cloudmta_postgres_data
docker-compose up postgres
```

### Memory Issues

Increase allocated memory in Docker:
- Windows/Mac: Docker Desktop preferences
- Linux: Modify docker-compose resource limits

## Scaling

### Horizontal Scaling

Run multiple SMTP server instances:

```yaml
# docker-compose.yml
smtp-server:
  deploy:
    replicas: 3
```

### Database Optimization

- Enable query logging
- Set up indexes on frequently queried fields
- Configure connection pooling with PgBouncer

### Rate Limiting Configuration

Adjust in `.env`:
```
RATE_LIMIT_PER_SECOND=1000
```

## Security Best Practices

1. **Change default credentials immediately**
   - Update admin password
   - Generate new API keys

2. **Use strong passwords**
   - Minimum 12 characters
   - Mix of upper, lower, numbers, special chars

3. **Enable TLS/SSL**
   - Use valid SSL certificates (not self-signed in production)
   - Configure in nginx.conf

4. **Network Security**
   - Use firewall rules
   - Only expose necessary ports
   - Use VPN for admin access

5. **Database Security**
   - Change default database password
   - Use strong authentication
   - Regular backups

6. **API Security**
   - Use API keys for integrations
   - Implement rate limiting
   - Monitor for suspicious activity

### Updates & Maintenance

```bash
# Rebuild containers with latest code
docker-compose up -d --build

# View logs
docker-compose logs -f backend

# Restart a single service
docker-compose restart backend
```

> Database tables are auto-created by SQLAlchemy on startup. No manual migration step is ever required.

## Support & Documentation

- Interactive API docs: http://localhost/docs
- Admin Portal: http://localhost
- Full documentation: See `docs/` directory

## License

Proprietary - All rights reserved
