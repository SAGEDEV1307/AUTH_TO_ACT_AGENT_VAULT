-- Seed data for development
-- Creates a test admin user (Auth0 ID must match your dev tenant)

INSERT INTO users (auth0_id, email, name, is_active) VALUES
  ('auth0|dev-admin-placeholder', 'admin@example.com', 'Dev Admin', true)
ON CONFLICT (auth0_id) DO NOTHING;

-- Assign admin role to seed user
INSERT INTO user_roles (user_id, role_id)
  SELECT u.id, r.id FROM users u, roles r
  WHERE u.email = 'admin@example.com' AND r.name = 'admin'
ON CONFLICT DO NOTHING;
