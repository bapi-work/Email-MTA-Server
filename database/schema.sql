-- CloudMTA Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    api_key VARCHAR(255) UNIQUE,
    api_key_created_at TIMESTAMP,
    ipv4_addresses JSONB DEFAULT '[]'::jsonb,
    ipv6_addresses JSONB DEFAULT '[]'::jsonb,
    rate_limit_per_second INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- Domains table
CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    domain_name VARCHAR(255) UNIQUE NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'verification_pending',
    
    -- SPF
    spf_record VARCHAR(1000),
    spf_verified BOOLEAN DEFAULT FALSE,
    spf_verified_at TIMESTAMP,
    
    -- DKIM
    dkim_public_key TEXT,
    dkim_private_key TEXT,  -- Should be encrypted in production
    dkim_selector VARCHAR(255) DEFAULT 'default',
    dkim_enabled BOOLEAN DEFAULT TRUE,
    dkim_signing_enabled BOOLEAN DEFAULT TRUE,
    
    -- DMARC
    dmarc_policy VARCHAR(10) DEFAULT 'none',
    dmarc_rua_email VARCHAR(255),
    dmarc_ruf_email VARCHAR(255),
    dmarc_percent INTEGER DEFAULT 100,
    dmarc_enabled BOOLEAN DEFAULT FALSE,
    
    -- IP Settings
    authorized_ipv4 JSONB DEFAULT '[]'::jsonb,
    authorized_ipv6 JSONB DEFAULT '[]'::jsonb,
    
    -- Rate Limiting
    rate_limit_per_second INTEGER DEFAULT 100,
    daily_limit INTEGER DEFAULT 100000,
    
    -- Settings
    use_tls BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 10,
    is_verified BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_domains_name ON domains(domain_name);
CREATE INDEX idx_domains_owner ON domains(owner_id);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    
    from_email VARCHAR(255) NOT NULL,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    
    headers JSONB,
    body TEXT,
    
    status VARCHAR(50) DEFAULT 'queued',
    priority INTEGER DEFAULT 10,
    
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 24,
    
    ipv4_used VARCHAR(255),
    ipv6_used VARCHAR(255),
    
    dkim_signed BOOLEAN DEFAULT FALSE,
    spf_verified BOOLEAN DEFAULT FALSE,
    dmarc_compliant BOOLEAN DEFAULT FALSE,
    
    response_code VARCHAR(10),
    response_message TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_id ON messages(message_id);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_domain ON messages(domain_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- API Logs table
CREATE TABLE IF NOT EXISTS api_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    method VARCHAR(10),
    path VARCHAR(500),
    status_code INTEGER,
    
    request_body JSONB,
    response_time_ms FLOAT,
    
    ip_address VARCHAR(255),
    user_agent VARCHAR(500),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_logs_user ON api_logs(user_id);
CREATE INDEX idx_api_logs_created ON api_logs(created_at);

-- Bounce table for tracking bounced emails
CREATE TABLE IF NOT EXISTS bounces (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) REFERENCES messages(message_id) ON DELETE CASCADE,
    bounce_type VARCHAR(50),  -- permanent, temporary, undetermined
    bounce_subtype VARCHAR(50),
    recipient VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bounces_message ON bounces(message_id);

-- IP address pool
CREATE TABLE IF NOT EXISTS ip_addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(255) NOT NULL,
    ip_version INTEGER,  -- 4 or 6
    is_active BOOLEAN DEFAULT TRUE,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ips_user ON ip_addresses(user_id);
CREATE INDEX idx_ips_address ON ip_addresses(ip_address);
