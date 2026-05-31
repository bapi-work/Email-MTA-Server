-- Initial database setup and default data

-- Create default admin user
-- Username: admin
-- Email: admin@yourdomain.com
-- Password: CloudMTA2026!
INSERT INTO users (username, email, hashed_password, role, full_name, is_active)
VALUES (
    'admin',
    'admin@yourdomain.com',
    '$2b$12$s.okKxp.jDrHO4liXfW2QOGWMelOwsoaHe752PUdNTh27EMaP.GzK',
    'admin',
    'System Administrator',
    TRUE
) ON CONFLICT (email) DO NOTHING;

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
