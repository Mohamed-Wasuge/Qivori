-- Carrier Public Pages — adds slug + public page toggle to companies table
-- Safe to re-run (uses IF NOT EXISTS)

-- Add slug column (unique, used in public URL)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Add public page toggle
ALTER TABLE companies ADD COLUMN IF NOT EXISTS public_page_enabled BOOLEAN DEFAULT false;

-- Add tagline for the public page
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tagline TEXT;

-- Add service areas (text, e.g. "Midwest, Southeast, Northeast")
ALTER TABLE companies ADD COLUMN IF NOT EXISTS service_areas TEXT;

-- Add equipment list for public display (text, e.g. "Dry Van, Reefer, Flatbed")
ALTER TABLE companies ADD COLUMN IF NOT EXISTS equipment_types TEXT;

-- Index for fast slug lookups (public page loads)
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies (slug) WHERE slug IS NOT NULL;

-- Allow public read access to companies with public_page_enabled = true
-- This lets the API endpoint fetch carrier data without user auth
DROP POLICY IF EXISTS "Public can view enabled carrier pages" ON companies;
CREATE POLICY "Public can view enabled carrier pages" ON companies
  FOR SELECT USING (public_page_enabled = true);
