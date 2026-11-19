-- Initial database setup and default data

-- The default admin account is seeded by the backend at startup
-- (backend/main.py: ensure_default_admin), using ADMIN_EMAIL/ADMIN_USERNAME/
-- ADMIN_PASSWORD from .env, so there is a single source of truth for the
-- default password instead of a hardcoded hash here that can drift out of
-- sync with .env. It only seeds when no admin exists yet, so it never
-- overwrites a password that was changed after first deployment.

-- NOTE: a 'demo' user with a published password used to be seeded here.
-- It was removed for security: a known-credential account on a mail server
-- can be used to send mail. Create users from the admin portal instead.
-- (On existing production databases the backend disables that account at
-- startup — see backend/main.py: disable_demo_account.)
