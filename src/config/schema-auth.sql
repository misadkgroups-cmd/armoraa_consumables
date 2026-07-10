-- DEMO USERS FOR ARMORAA CLINIC PORTAL
-- Run this AFTER running schema.sql

-- Insert 3 branches
INSERT INTO branches (branch_name) VALUES
  ('Arumbakkam'),
  ('Adyar'),
  ('Velachery')
ON CONFLICT DO NOTHING;

-- Insert demo users with passwords (using Supabase Auth)
-- Demo credentials: User1@123, User2@123, User3@123

-- Create auth users and profiles
INSERT INTO auth.users (email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('user1@armoraa.com', NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Arumbakkam User"}'),
  ('user2@armoraa.com', NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Adyar User"}'),
  ('user3@armoraa.com', NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Velachery User"}')
ON CONFLICT (email) DO NOTHING;

-- Create profiles linked to branches
INSERT INTO profiles (user_id, branch_id, email, full_name)
SELECT 
  id,
  CASE email
    WHEN 'user1@armoraa.com' THEN (SELECT id FROM branches WHERE branch_name = 'Arumbakkam')
    WHEN 'user2@armoraa.com' THEN (SELECT id FROM branches WHERE branch_name = 'Adyar')
    WHEN 'user3@armoraa.com' THEN (SELECT id FROM branches WHERE branch_name = 'Velachery')
  END,
  email,
  raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email IN ('user1@armoraa.com', 'user2@armoraa.com', 'user3@armoraa.com')
ON CONFLICT (email) DO NOTHING;

-- Sample data for each branch
INSERT INTO master_services (branch_id, service_name)
SELECT id, 'General Dermatology' FROM branches WHERE branch_name = 'Arumbakkam'
UNION ALL
SELECT id, 'Skin Care' FROM branches WHERE branch_name = 'Arumbakkam'
UNION ALL
SELECT id, 'Hair Treatment' FROM branches WHERE branch_name = 'Adyar'
UNION ALL
SELECT id, 'Laser Therapy' FROM branches WHERE branch_name = 'Adyar'
UNION ALL
SELECT id, 'Cosmetic Surgery' FROM branches WHERE branch_name = 'Velachery'
UNION ALL
SELECT id, 'Anti-Aging' FROM branches WHERE branch_name = 'Velachery'
ON CONFLICT DO NOTHING;

INSERT INTO master_consumables (branch_id, consumable_name, default_unit)
SELECT id, 'Syringe 10ml', 'pcs' FROM branches WHERE branch_name = 'Arumbakkam'
UNION ALL
SELECT id, 'Gauze Pad', 'pcs' FROM branches WHERE branch_name = 'Arumbakkam'
UNION ALL
SELECT id, 'Antiseptic Solution', 'ml' FROM branches WHERE branch_name = 'Arumbakkam'
UNION ALL
SELECT id, 'Hair Serum', 'ml' FROM branches WHERE branch_name = 'Adyar'
UNION ALL
SELECT id, 'Laser Gel', 'ml' FROM branches WHERE branch_name = 'Adyar'
UNION ALL
SELECT id, 'Surgical Blade', 'pcs' FROM branches WHERE branch_name = 'Velachery'
UNION ALL
SELECT id, 'Suture Thread', 'pcs' FROM branches WHERE branch_name = 'Velachery'
ON CONFLICT DO NOTHING;
