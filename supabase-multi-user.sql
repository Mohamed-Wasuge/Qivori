-- ============================================================
-- Qivori Multi-User Roles — Phase 1 Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─── Table: company_members ─────────────────────────────────
CREATE TABLE IF NOT EXISTS company_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'dispatcher', 'driver')),
  driver_id UUID,  -- links driver-role users to their driver record
  invited_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'deactivated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

-- ─── Table: invitations ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'driver' CHECK (role IN ('driver', 'dispatcher', 'admin')),
  driver_id UUID,  -- pre-link to existing driver record
  token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Alter profiles: add company_id if not exists ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN company_id UUID;
  END IF;
END$$;

-- ─── Helper functions for RLS ───────────────────────────────
CREATE OR REPLACE FUNCTION get_user_company_id(p_user_id UUID)
RETURNS UUID AS $$
  SELECT company_id FROM company_members WHERE user_id = p_user_id AND status = 'active' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_company_member(p_user_id UUID, p_owner_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members cm1
    JOIN company_members cm2 ON cm1.company_id = cm2.company_id
    WHERE cm1.user_id = p_user_id AND cm2.user_id = p_owner_id
    AND cm1.status = 'active' AND cm2.status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_status ON company_members(status);
CREATE INDEX IF NOT EXISTS idx_invitations_company_id ON invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);

-- ─── RLS on company_members ─────────────────────────────────
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of the same company
CREATE POLICY "company_members_select" ON company_members
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
  );

-- Only owners/admins can insert (via service role for API, but allow self-insert on accept)
CREATE POLICY "company_members_insert" ON company_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_members.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
    )
  );

-- Only owners/admins can update members
CREATE POLICY "company_members_update" ON company_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_members.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
    )
  );

-- ─── RLS on invitations ─────────────────────────────────────
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Members can see invitations for their company
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Only owners/admins can create invitations
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = invitations.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
    )
  );

-- Allow updating invitations (for accepting)
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR company_id = get_user_company_id(auth.uid())
  );
