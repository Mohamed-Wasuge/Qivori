-- Incident Documents & AI Report: add columns to driver_incidents
-- Run this in Supabase SQL Editor

-- Store attached documents (photos, police reports, insurance claims) as JSONB array
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_incidents' AND column_name='documents') THEN
    ALTER TABLE driver_incidents ADD COLUMN documents JSONB DEFAULT '[]';
  END IF;
END $$;

-- Store AI-generated incident report
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_incidents' AND column_name='ai_report') THEN
    ALTER TABLE driver_incidents ADD COLUMN ai_report TEXT DEFAULT NULL;
  END IF;
END $$;

-- Timestamp when AI report was generated
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_incidents' AND column_name='report_generated_at') THEN
    ALTER TABLE driver_incidents ADD COLUMN report_generated_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;
