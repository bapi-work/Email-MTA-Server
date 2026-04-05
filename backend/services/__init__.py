"""Service layer for CloudMTA Backend"""

from datetime import datetime
import logging
import redis
from sqlalchemy import create_engine, text
from config import settings

logger = logging.getLogger(__name__)

class HealthcheckService:
    """Service to check overall health of the system"""
    
    async def check_health(self):
        """Check health of all services"""
        health_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "services": {}
        }
        
        # Check database
        try:
            from database import SessionLocal
            db = SessionLocal()
            db.execute(text("SELECT 1"))
            db.close()
            health_status["services"]["database"] = {
                "status": "healthy",
                "type": "PostgreSQL"
            }
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            health_status["services"]["database"] = {
                "status": "unhealthy",
                "error": str(e)
            }
            health_status["status"] = "unhealthy"
        
        # Check Redis
        try:
            r = redis.from_url(settings.REDIS_URL, decode_responses=True)
            r.ping()
            health_status["services"]["redis"] = {
                "status": "healthy",
                "type": "Redis"
            }
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            health_status["services"]["redis"] = {
                "status": "unhealthy",
                "error": str(e)
            }
            health_status["status"] = "unhealthy"
        
        return health_status

class AuthenticationService:
    """Service for authentication operations"""
    
    @staticmethod
    async def create_access_token(user_id: int, email: str, role: str, expires_in: int = None):
        """Create JWT access token"""
        import jwt
        from datetime import timedelta
        
        if expires_in is None:
            expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        
        expire = datetime.utcnow() + timedelta(minutes=expires_in)
        
        payload = {
            "sub": str(user_id),
            "email": email,
            "role": role,
            "exp": expire
        }
        
        token = jwt.encode(
            payload,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        
        return token

class SPFService:
    """Service for SPF (Sender Policy Framework) validation and management"""
    
    @staticmethod
    def generate_spf_record(domain: str, include_domains: list = None, ips: list = None):
        """Generate SPF record for a domain"""
        spf_parts = ["v=spf1"]
        
        # Add IPv4 addresses
        if ips:
            for ip in ips:
                if "." in ip:  # IPv4
                    spf_parts.append(f"ip4:{ip}")
                elif ":" in ip:  # IPv6
                    spf_parts.append(f"ip6:{ip}")
        
        # Add include domains
        if include_domains:
            for include_domain in include_domains:
                spf_parts.append(f"include:{include_domain}")
        
        # Add default policy
        spf_parts.append("~all")  # Soft fail
        
        return " ".join(spf_parts)
    
    @staticmethod
    def validate_spf_record(spf_record: str):
        """Validate SPF record syntax"""
        import spf
        try:
            # Basic validation
            if not spf_record.startswith("v=spf1"):
                return False, "SPF record must start with 'v=spf1'"
            return True, "Valid SPF record"
        except Exception as e:
            return False, str(e)

class DKIMService:
    """Service for DKIM (DomainKeys Identified Mail) signing"""
    
    @staticmethod
    def generate_dkim_keys():
        """Generate DKIM public/private key pair"""
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.backends import default_backend
        
        # Generate RSA key pair (2048 bits recommended for DKIM)
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        
        # Serialize private key
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ).decode('utf-8')
        
        # Serialize public key
        public_key = private_key.public_key()
        public_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode('utf-8')
        
        return private_pem, public_pem
    
    @staticmethod
    def sign_message(message: bytes, private_key: str, domain: str, selector: str = "default"):
        """Sign email message with DKIM"""
        import dkim
        
        try:
            signature = dkim.sign(
                message,
                selector=selector.encode(),
                domain=domain.encode(),
                privkey=private_key.encode()
            )
            return signature
        except Exception as e:
            logger.error(f"DKIM signing failed: {e}")
            return None

class DMARCService:
    """Service for DMARC (Domain-based Message Authentication) policy management"""
    
    @staticmethod
    def generate_dmarc_record(policy: str = "none", rua_email: str = None, ruf_email: str = None, percent: int = 100):
        """Generate DMARC record"""
        dmarc_parts = ["v=DMARC1", f"p={policy}"]
        
        if rua_email:
            dmarc_parts.append(f"rua=mailto:{rua_email}")
        
        if ruf_email:
            dmarc_parts.append(f"ruf=mailto:{ruf_email}")
        
        if percent < 100:
            dmarc_parts.append(f"pct={percent}")
        
        return "; ".join(dmarc_parts)
    
    @staticmethod
    def validate_dmarc_record(dmarc_record: str):
        """Validate DMARC record syntax"""
        try:
            if not dmarc_record.startswith("v=DMARC1"):
                return False, "DMARC record must start with 'v=DMARC1'"
            
            # Check for required policy
            if "p=" not in dmarc_record:
                return False, "DMARC record must include policy (p=)"
            
            return True, "Valid DMARC record"
        except Exception as e:
            return False, str(e)

class IPRotationService:
    """Service for managing IPv4/IPv6 rotation"""
    
    @staticmethod
    def get_next_ip(user_id: int, domain_id: int, use_ipv4: bool = True):
        """Get next IP address for rotation"""
        try:
            redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
            
            # Get rotation index
            key = f"ip_rotation:{user_id}:{domain_id}:{'ipv4' if use_ipv4 else 'ipv6'}"
            current_index = redis_client.incr(key)
            
            return current_index
        except Exception as e:
            logger.error(f"IP rotation failed: {e}")
            return 0
