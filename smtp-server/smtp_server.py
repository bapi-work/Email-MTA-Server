"""CloudMTA SMTP Server Implementation"""

import asyncio
import logging
import signal
import ssl
import os
import email
import redis
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from aiosmtpd.smtp import SMTP as AIOSMTP, AuthResult
from email.mime.text import MIMEText

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration — all ports read from env so they can be overridden in .env
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_USER = os.getenv("DB_USER", "cloudmta")
DB_PASSWORD = os.getenv("DB_PASSWORD", "CloudMTA2026!")
DB_NAME = os.getenv("DB_NAME", "cloudmta_db")
REDIS_URL = os.getenv("REDIS_URL", "redis://:Redis2026!@redis:6379/1")
SMTP_HOSTNAME = os.getenv("SMTP_HOSTNAME", "cloudmta")
SMTP_PORT = int(os.getenv("SMTP_PORT", 25))
SMTP_TLS_PORT = int(os.getenv("SMTP_TLS_PORT", 587))
SMTP_SSL_PORT = int(os.getenv("SMTP_SSL_PORT", 465))
HEALTH_PORT = int(os.getenv("SMTP_HEALTH_PORT", 9000))
SSL_CERT_FILE = os.getenv("SSL_CERT_FILE", "/config/ssl/cert.pem")
SSL_KEY_FILE = os.getenv("SSL_KEY_FILE", "/config/ssl/key.pem")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
RETRY_INTERVAL_SECONDS = int(os.getenv("SMTP_RETRY_INTERVAL_SECONDS", 60))


class DatabaseManager:
    """Manage database connections"""

    def __init__(self):
        self.conn = None

    def connect(self):
        """Connect to database"""
        try:
            self.conn = psycopg2.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME
            )
            logger.info("Connected to database")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise

    def disconnect(self):
        """Disconnect from database"""
        if self.conn:
            self.conn.close()
            logger.info("Disconnected from database")

    def _is_connection_dead(self) -> bool:
        return self.conn is None or self.conn.closed != 0

    def execute(self, query, params=None):
        """Execute query. Returns rows for statements with a result set
        (SELECT / ... RETURNING), or [] for plain INSERT/UPDATE/DELETE.

        Transparently reconnects once if the connection has dropped (idle
        timeout, network blip, Postgres restart) so a single stale connection
        doesn't take down mail handling until the whole process is restarted.
        """
        for attempt in (1, 2):
            try:
                if self._is_connection_dead():
                    logger.warning("Database connection is closed — reconnecting")
                    self.connect()

                cursor = self.conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, params or ())
                self.conn.commit()
                if cursor.description is None:
                    return []
                return cursor.fetchall()
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                logger.error(f"Database connection error (attempt {attempt}/2): {e}")
                try:
                    self.conn.rollback()
                except Exception:
                    pass
                if attempt == 2:
                    raise
                # Force a reconnect on the next loop iteration
                self.conn = None
            except Exception as e:
                logger.error(f"Query execution failed: {e}")
                self.conn.rollback()
                raise

    def get_user_by_username(self, username):
        """Get user by username"""
        query = "SELECT * FROM users WHERE username = %s"
        result = self.execute(query, (username,))
        return result[0] if result else None

    def get_domain_by_name(self, domain_name):
        """Get domain by name"""
        query = "SELECT * FROM domains WHERE domain_name = %s AND status = 'active'"
        result = self.execute(query, (domain_name,))
        return result[0] if result else None

    def get_owned_active_domain(self, owner_id, domain_name):
        """Get a domain by name, but only if it's active and owned by owner_id.
        Used to verify a sender is allowed to relay mail as this domain."""
        query = "SELECT * FROM domains WHERE domain_name = %s AND owner_id = %s AND status = 'active'"
        result = self.execute(query, (domain_name, owner_id))
        return result[0] if result else None

    def get_deferred_messages(self, limit=50):
        """Fetch outbound messages that failed relay and are due for a retry.

        Only 'deferred' messages (never 'queued') are eligible — 'deferred'
        is exclusively set by the outbound relay path in handle_DATA;
        'queued' is also used by local inbound delivery, which this worker
        must never touch (retrying MX delivery for our own hosted domains
        would be both wrong and wasteful).
        """
        query = """
        SELECT message_id, from_email, to_email, subject, body, headers, attempts, max_attempts
        FROM messages
        WHERE status = 'deferred' AND attempts < max_attempts
        ORDER BY updated_at ASC
        LIMIT %s
        """
        return self.execute(query, (limit,))

    def update_message_status(self, message_id, message_status, response_code=None, response_message=None):
        """Update a message's delivery status after a relay attempt"""
        query = """
        UPDATE messages
        SET status = %s, response_code = %s, response_message = %s,
            attempts = attempts + 1,
            sent_at = CASE WHEN %s = 'sent' THEN NOW() ELSE sent_at END
        WHERE message_id = %s
        """
        self.execute(query, (message_status, response_code, response_message, message_status, message_id))

    def create_message(self, user_id, domain_id, from_email, to_email, subject, body, headers=None):
        """Create message record in database"""
        import uuid
        from psycopg2.extras import Json
        message_id = str(uuid.uuid4())

        query = """
        INSERT INTO messages
        (message_id, user_id, domain_id, from_email, to_email, subject, body, headers, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'queued')
        RETURNING id, message_id
        """

        self.execute(query, (
            message_id, user_id, domain_id, from_email, to_email, subject, body,
            Json(headers) if headers is not None else None
        ))
        return message_id


def _build_mime_message(subject, body, headers):
    """Reconstruct a raw RFC 5322 message for a retry attempt.

    The original raw bytes aren't persisted — only the parsed subject/body/
    headers are — so a retry rebuilds an equivalent message from those.
    """
    from email.message import EmailMessage
    msg = EmailMessage()
    msg['Subject'] = subject or ''
    skip = {'subject', 'content-type', 'mime-version', 'content-transfer-encoding'}
    for key, value in (headers or {}).items():
        if key.lower() not in skip:
            msg[key] = value
    msg.set_content(body or '')
    return msg.as_bytes()


def _relay_to_internet(mail_from, rcpt_to, raw_message, timeout=20):
    """Best-effort direct-to-MX delivery for outbound mail.

    Looks up the recipient domain's MX records (falling back to the domain's
    A record per RFC 5321) and attempts delivery to each host in preference
    order, using STARTTLS when the remote server offers it. Returns
    (success: bool, code: str, message: str).
    """
    import smtplib
    import dns.resolver

    recipient_domain = rcpt_to.split('@')[-1]

    hosts = []
    try:
        mx_records = sorted(
            dns.resolver.resolve(recipient_domain, 'MX'),
            key=lambda r: r.preference
        )
        if len(mx_records) == 1 and str(mx_records[0].exchange) == '.':
            # RFC 7505 "null MX" — the domain has explicitly declared it
            # accepts no mail at all. Don't fall back to an A record.
            return False, "556", f"{recipient_domain} does not accept mail (null MX)"
        hosts = [str(r.exchange).rstrip('.') for r in mx_records if str(r.exchange) != '.']
    except Exception:
        hosts = []

    if not hosts:
        try:
            dns.resolver.resolve(recipient_domain, 'A')
            hosts = [recipient_domain]
        except Exception:
            return False, "550", f"No MX or A record found for {recipient_domain}"

    last_error = "Unknown error"
    for host in hosts:
        smtp = None
        try:
            smtp = smtplib.SMTP(host, 25, timeout=timeout)
            smtp.ehlo()
            if smtp.has_extn('STARTTLS'):
                smtp.starttls()
                smtp.ehlo()
            smtp.sendmail(mail_from, [rcpt_to], raw_message)
            return True, "250", f"Delivered to {host}"
        except Exception as e:
            last_error = str(e)
            continue
        finally:
            # Best-effort cleanup only — a failure here (e.g. the connection
            # already dropped) must never mask the real error caught above.
            if smtp is not None:
                try:
                    smtp.quit()
                except Exception:
                    try:
                        smtp.close()
                    except Exception:
                        pass

    return False, "450", f"Delivery to {recipient_domain} failed: {last_error}"


class SMTPHandler:
    """Handles SMTP protocol and message processing"""

    def __init__(self, db_manager):
        self.db = db_manager
        self.redis_client = None
        self._init_redis()

    def _init_redis(self):
        """Initialize Redis connection"""
        try:
            self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            self.redis_client.ping()
            logger.info("Connected to Redis")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")

    async def handle_DATA(self, server, session, envelope):
        """Handle email data — routes to local inbound delivery for domains
        we host, or authenticated outbound relay for everything else."""
        try:
            msg = email.message_from_bytes(envelope.content)
            to_email = envelope.rcpt_tos[0]
            from_email = envelope.mail_from
            recipient_domain = to_email.split('@')[1]

            local_domain = self.db.get_domain_by_name(recipient_domain)
            if local_domain:
                # Inbound delivery to a domain we host
                message_id = self.db.create_message(
                    user_id=local_domain.get('owner_id'),
                    domain_id=local_domain.get('id'),
                    from_email=from_email,
                    to_email=to_email,
                    subject=msg.get('Subject', ''),
                    body=msg.get_payload(),
                    headers=dict(msg.items())
                )
                self._queue_message(message_id, local_domain.get('id'), from_email, to_email, msg)
                logger.info(f"Message {message_id} queued for local delivery to {to_email}")
                return "250 OK"

            # Not a locally hosted domain — this is an outbound relay request.
            # Require AUTH, and require the authenticated user to own an
            # active, verified sender domain matching MAIL FROM (anti-spoofing).
            authenticated_user = getattr(server, 'authenticated_user', None)
            if not authenticated_user:
                logger.warning(f"Rejected unauthenticated relay attempt to {to_email}")
                return "530 Authentication required for relay"

            sender_domain_name = from_email.split('@')[-1] if '@' in from_email else ''
            sender_domain = self.db.get_owned_active_domain(authenticated_user['id'], sender_domain_name)
            if not sender_domain:
                logger.warning(
                    f"Rejected relay: user {authenticated_user.get('username')} "
                    f"does not own verified domain {sender_domain_name}"
                )
                return "550 Sender domain not verified for this account"

            message_id = self.db.create_message(
                user_id=authenticated_user['id'],
                domain_id=sender_domain.get('id'),
                from_email=from_email,
                to_email=to_email,
                subject=msg.get('Subject', ''),
                body=msg.get_payload(),
                headers=dict(msg.items())
            )
            self.db.update_message_status(message_id, 'sending')

            loop = asyncio.get_event_loop()
            success, code, response_message = await loop.run_in_executor(
                None, _relay_to_internet, from_email, to_email, envelope.content
            )

            self.db.update_message_status(
                message_id,
                'sent' if success else 'deferred',
                response_code=code,
                response_message=response_message
            )

            if success:
                logger.info(f"Message {message_id} relayed to {to_email}: {response_message}")
                return "250 OK"

            logger.warning(f"Message {message_id} relay failed to {to_email}: {response_message}")
            return f"{code} {response_message}"

        except Exception as e:
            logger.error(f"Error handling message: {e}")
            return "500 Internal server error"

    def _queue_message(self, message_id, domain_id, from_email, to_email, message):
        """Queue message for delivery"""
        try:
            if self.redis_client:
                queue_key = f"smtp_queue:{domain_id}"
                self.redis_client.lpush(queue_key, message_id)
                logger.info(f"Message {message_id} added to queue")
        except Exception as e:
            logger.error(f"Failed to queue message: {e}")


def authenticate_smtp(server, session, envelope, mechanism, auth_data):
    """aiosmtpd `authenticator` callback for AUTH LOGIN/PLAIN.

    Checks credentials against `users.smtp_password` — a dedicated SMTP
    credential, intentionally separate from the dashboard login password
    (`users.hashed_password`), so a leaked/rotated SMTP credential never
    exposes web access and vice versa.
    """
    if mechanism not in ('LOGIN', 'PLAIN'):
        return AuthResult(success=False, handled=False)

    username = auth_data.login.decode()
    password = auth_data.password.decode()

    user = server.db.get_user_by_username(username)
    if not user or not user.get('smtp_password'):
        return AuthResult(success=False, message='535 5.7.8 Authentication credentials invalid')

    import bcrypt
    if not bcrypt.checkpw(password.encode(), user['smtp_password'].encode()):
        return AuthResult(success=False, message='535 5.7.8 Authentication credentials invalid')

    server.authenticated_user = user
    return AuthResult(success=True)


class CloudMTASMTP(AIOSMTP):
    """Custom SMTP server with CloudMTA features"""

    def __init__(self, handler, db_manager, *args, **kwargs):
        super().__init__(handler, *args, **kwargs)
        self.db = db_manager
        self.authenticated_user = None


class SMTPServer:
    """Main SMTP Server"""

    def __init__(self):
        self.db = DatabaseManager()
        self.handler_instance = None
        self.smtp_servers = []
        self.health_server = None
        self._retry_task = None
        self._shutting_down = False

    async def _retry_deferred_messages(self):
        """Periodically retry outbound messages that were deferred after a
        failed relay attempt, up to each message's max_attempts. Runs for
        the lifetime of the process alongside the SMTP listeners."""
        while not self._shutting_down:
            try:
                await asyncio.sleep(RETRY_INTERVAL_SECONDS)
                if self._shutting_down:
                    break

                rows = self.db.get_deferred_messages()
                if not rows:
                    continue

                logger.info(f"Retry worker: attempting redelivery of {len(rows)} deferred message(s)")
                loop = asyncio.get_event_loop()

                for row in rows:
                    raw_message = _build_mime_message(row['subject'], row['body'], row['headers'])
                    success, code, response_message = await loop.run_in_executor(
                        None, _relay_to_internet, row['from_email'], row['to_email'], raw_message
                    )

                    next_attempts = row['attempts'] + 1
                    if success:
                        final_status = 'sent'
                    elif next_attempts >= row['max_attempts']:
                        final_status = 'failed'
                    else:
                        final_status = 'deferred'

                    self.db.update_message_status(
                        row['message_id'], final_status,
                        response_code=code, response_message=response_message
                    )
                    logger.info(
                        f"Retry worker: message {row['message_id']} -> {final_status} "
                        f"(attempt {next_attempts}/{row['max_attempts']}): {response_message}"
                    )
            except Exception as e:
                logger.error(f"Retry worker iteration failed: {e}")

    def _load_ssl_context(self):
        """Load SSL context for SMTPS (port 465). Returns None if certs are missing."""
        if not (os.path.exists(SSL_CERT_FILE) and os.path.exists(SSL_KEY_FILE)):
            logger.warning(
                f"SSL certificates not found at {SSL_CERT_FILE} / {SSL_KEY_FILE}; "
                f"SMTPS port {SMTP_SSL_PORT} will not be started"
            )
            return None
        try:
            ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            ctx.load_cert_chain(SSL_CERT_FILE, SSL_KEY_FILE)
            logger.info("SSL certificates loaded successfully")
            return ctx
        except Exception as e:
            logger.error(f"Failed to load SSL certificates: {e}")
            return None

    async def _start_health_server(self):
        """Start minimal HTTP health server on HEALTH_PORT for container health checks."""
        async def _handle(reader, writer):
            try:
                await reader.read(4096)
                body = b"healthy"
                writer.write(
                    b"HTTP/1.1 200 OK\r\n"
                    b"Content-Type: text/plain\r\n"
                    b"Content-Length: " + str(len(body)).encode() + b"\r\n"
                    b"\r\n" + body
                )
                await writer.drain()
            finally:
                writer.close()

        server = await asyncio.start_server(_handle, '0.0.0.0', HEALTH_PORT)
        logger.info(f"Health server listening on port {HEALTH_PORT}")
        return server

    async def start(self):
        """Start SMTP server on all configured ports"""
        try:
            self.db.connect()

            handler = SMTPHandler(self.db)
            self.handler_instance = handler

            ssl_ctx = self._load_ssl_context()

            # Port 25 — plain SMTP (server-to-server inbound; AUTH not offered
            # in cleartext, matching auth_require_tls's default rejection)
            logger.info(f"Starting SMTP server on port {SMTP_PORT}")
            self.smtp_servers.append(await self._create_smtp(SMTP_PORT, handler))

            # Port 587 — STARTTLS submission. tls_context enables the STARTTLS
            # command and lets aiosmtpd advertise "AUTH LOGIN PLAIN" in EHLO
            # once the session has been upgraded to TLS.
            if ssl_ctx:
                logger.info(f"Starting SMTP submission (STARTTLS) on port {SMTP_TLS_PORT}")
                self.smtp_servers.append(
                    await self._create_smtp(SMTP_TLS_PORT, handler, tls_context=ssl_ctx)
                )
            else:
                logger.warning(f"No SSL certs — starting port {SMTP_TLS_PORT} without STARTTLS/AUTH")
                self.smtp_servers.append(await self._create_smtp(SMTP_TLS_PORT, handler))

            # Port 465 — implicit SSL/TLS (SMTPS), only if certificates are present.
            # The transport is already encrypted before the SMTP session starts,
            # so auth_require_tls is relaxed here (aiosmtpd's TLS detection only
            # tracks STARTTLS upgrades, not transport-level TLS applied at accept time).
            if ssl_ctx:
                logger.info(f"Starting SMTPS (implicit TLS) on port {SMTP_SSL_PORT}")
                self.smtp_servers.append(
                    await self._create_smtp(
                        SMTP_SSL_PORT, handler, ssl_context=ssl_ctx, auth_require_tls=False
                    )
                )

            # Health endpoint
            self.health_server = await self._start_health_server()

            # Background retry worker for deferred outbound messages
            self._retry_task = asyncio.create_task(self._retry_deferred_messages())

            logger.info("CloudMTA SMTP server started successfully")
            await asyncio.Event().wait()

        except Exception as e:
            logger.error(f"SMTP server startup failed: {e}")
            raise

    async def _create_smtp(self, port, handler, ssl_context=None, tls_context=None, auth_require_tls=True):
        """Create and return a TCP server bound to *port*, optionally with SSL."""
        loop = asyncio.get_event_loop()

        def factory():
            return CloudMTASMTP(
                handler,
                self.db,
                hostname=SMTP_HOSTNAME,
                ident="CloudMTA ESMTP",
                tls_context=tls_context,
                authenticator=authenticate_smtp,
                auth_require_tls=auth_require_tls,
            )

        server = await loop.create_server(
            factory,
            host='0.0.0.0',
            port=port,
            ssl=ssl_context,
        )
        return server

    async def stop(self):
        """Stop all SMTP and health servers"""
        logger.info("Shutting down SMTP server...")

        self._shutting_down = True
        if self._retry_task:
            self._retry_task.cancel()

        for server in self.smtp_servers:
            if server:
                server.close()

        if self.health_server:
            self.health_server.close()

        self.db.disconnect()
        logger.info("SMTP server stopped")


async def main():
    """Main entry point"""
    server = SMTPServer()

    def signal_handler():
        logger.info("Signal received, shutting down...")
        asyncio.create_task(server.stop())

    loop = asyncio.get_event_loop()
    loop.add_signal_handler(signal.SIGTERM, signal_handler)
    loop.add_signal_handler(signal.SIGINT, signal_handler)

    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        raise
    finally:
        await server.stop()


if __name__ == "__main__":
    asyncio.run(main())
