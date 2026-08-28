-- Initial database setup and default data

-- The default admin account is seeded by the backend at startup
-- (backend/main.py: ensure_default_admin), using ADMIN_EMAIL/ADMIN_USERNAME/
-- ADMIN_PASSWORD from .env, so there is a single source of truth for the
-- default password instead of a hardcoded hash here that can drift out of
-- sync with .env. It only seeds when no admin exists yet, so it never
-- overwrites a password that was changed after first deployment.

-- Create a demo user
-- Password: Demo12345!
INSERT INTO users (username, email, hashed_password, role, full_name, is_active, rate_limit_per_second)
VALUES (
    'demo',
    'demo@cloudmta.local',
    '$2b$12$QzATqvxZDgBVoci1Lzcyce.tP71u.TQ9yb74NRfq3d8NCNqpLS6LW',
    'user',
    'Demo User',
    TRUE,
    100
) ON CONFLICT (email) DO NOTHING;
