"""CloudMTA SMTP Server Implementation"""

import asyncio
import logging
import signal
import smtplib
from datetime import datetime
from aiosmtpd.smtp import SMTP as AIOSMTP
from aiosmtpd.smtp import AuthResult
import email
from email.mime.text import MIMEText
import redis
import psycopg2
from psycopg2.extras import RealDictCursor
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_USER = os.getenv("DB_USER", "cloudmta")
DB_PASSWORD = os.getenv("DB_PASSWORD", "CloudMTA2026!")
DB_NAME = os.getenv("DB_NAME", "cloudmta_db")
REDIS_URL = os.getenv("REDIS_URL", "redis://:Redis2026!@redis:6379/1")
SMTP_PORT = int(os.getenv("SMTP_PORT", 25))
SMTP_TLS_PORT = int(os.getenv("SMTP_TLS_PORT", 587))
SMTP_SSL_PORT = int(os.getenv("SMTP_SSL_PORT", 465))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

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
    
    def execute(self, query, params=None):
        """Execute query"""
        try:
            cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(query, params or ())
            self.conn.commit()
            return cursor.fetchall()
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
    
    def create_message(self, user_id, domain_id, from_email, to_email, subject, body, headers=None):
        """Create message record in database"""
        import uuid
        message_id = str(uuid.uuid4())
        
        query = """
        INSERT INTO messages 
        (message_id, user_id, domain_id, from_email, to_email, subject, body, headers, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'queued')
        RETURNING id, message_id
        """
        
        result = self.execute(query, (message_id, user_id, domain_id, from_email, to_email, subject, body, headers))
        return message_id

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
        """Handle email data"""
        try:
            # Parse message
            msg = email.message_from_bytes(envelope.content)
            
            # Validate recipient domain
            to_email = envelope.rcpt_tos[0]
            domain_name = to_email.split('@')[1]
            domain = self.db.get_domain_by_name(domain_name)
            
            if not domain:
                logger.warning(f"Domain not found: {domain_name}")
                return "550 Invalid domain"
            
            # Get authenticated user (from MAIL FROM)
            from_email = envelope.mail_from
            user_domain_name = from_email.split('@')[1]
            
            # Create message record
            message_id = self.db.create_message(
                user_id=domain.get('owner_id'),
                domain_id=domain.get('id'),
                from_email=from_email,
                to_email=to_email,
                subject=msg.get('Subject', ''),
                body=msg.get_payload(),
                headers=dict(msg.items())
            )
            
            # Queue for delivery
            self._queue_message(message_id, domain.get('id'), from_email, to_email, msg)
            
            logger.info(f"Message {message_id} queued for delivery to {to_email}")
            return "250 OK"
            
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

class CloudMTASMTP(AIOSMTP):
    """Custom SMTP server with CloudMTA features"""
    
    def __init__(self, handler, db_manager, *args, **kwargs):
        super().__init__(handler, *args, **kwargs)
        self.db = db_manager
        self.authenticated_user = None
    
    async def handle_AUTH(self, arg):
        """Handle SMTP AUTH"""
        # Parse AUTH mechanism
        auth_parts = arg.split()
        if not auth_parts:
            await self.push("500 Error")
            return
        
        mechanism = auth_parts[0].upper()
        
        if mechanism not in ['LOGIN', 'PLAIN']:
            await self.push("504 Unrecognized authentication type")
            return
        
        if mechanism == 'LOGIN':
            await self.push("334 VXNlcm5hbWU6")  # "Username:"
            username = await self._readline()
            
            await self.push("334 UGFzc3dvcmQ6")  # "Password:"
            password = await self._readline()
        else:  # PLAIN
            if len(auth_parts) < 2:
                await self.push("334 ")
                credentials = await self._readline()
            else:
                credentials = auth_parts[1]
            
            import base64
            try:
                decoded = base64.b64decode(credentials).decode()
                parts = decoded.split('\0')
                username = parts[-2]
                password = parts[-1]
            except Exception as e:
                logger.error(f"AUTH parsing failed: {e}")
                await self.push("535 Authentication failed")
                return
        
        # Verify credentials
        user = self.db.get_user_by_username(username)
        if not user:
            await self.push("535 Authentication failed")
            return
        
        # In production, verify hashed password
        import bcrypt
        if not bcrypt.checkpw(password.encode(), user.get('hashed_password', '').encode()):
            await self.push("535 Authentication failed")
            return
        
        self.authenticated_user = user
        await self.push("235 Authentication successful")

class SMTPServer:
    """Main SMTP Server"""
    
    def __init__(self):
        self.db = DatabaseManager()
        self.handler_instance = None
        self.smtp_servers = []
    
    async def start(self):
        """Start SMTP server"""
        try:
            self.db.connect()
            
            # Create handler
            handler = SMTPHandler(self.db)
            self.handler_instance = handler
            
            # Create SMTP servers for different ports
            logger.info(f"Starting SMTP server on port {SMTP_PORT}")
            smtp = await self._create_smtp(SMTP_PORT, handler)
            self.smtp_servers.append(smtp)
            
            logger.info(f"Starting TLS server on port {SMTP_TLS_PORT}")
            tls_smtp = await self._create_smtp(SMTP_TLS_PORT, handler)
            self.smtp_servers.append(tls_smtp)
            
            logger.info("CloudMTA SMTP server started successfully")
            
            # Keep server running
            await asyncio.Event().wait()
            
        except Exception as e:
            logger.error(f"SMTP server startup failed: {e}")
            raise
    
    async def _create_smtp(self, port, handler):
        """Create SMTP server instance"""
        loop = asyncio.get_event_loop()
        
        def factory():
            return CloudMTASMTP(handler, self.db)
        
        server = await loop.create_server(
            factory,
            host='0.0.0.0',
            port=port
        )
        
        return server
    
    async def stop(self):
        """Stop SMTP server"""
        logger.info("Shutting down SMTP server...")
        
        for server in self.smtp_servers:
            if server:
                server.close()
        
        self.db.disconnect()
        logger.info("SMTP server stopped")

async def main():
    """Main entry point"""
    server = SMTPServer()
    
    # Handle signals
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
