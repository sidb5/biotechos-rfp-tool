-- Admin portal: admin_users table for gated admin access.
-- Admin accounts require email-based approval from APP_ADMINISTRATOR.

CREATE TABLE admin_users (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email                     text NOT NULL,
  approved                  boolean DEFAULT false,
  approval_token            text,
  approval_token_expires_at timestamptz,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(email)
);

-- No RLS policies — admin routes use service role to bypass RLS.
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE admin_users IS
  'Gated admin accounts. Signup creates a row with approved=false; APP_ADMINISTRATOR clicks approval link to activate.';
