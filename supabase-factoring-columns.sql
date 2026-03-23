-- Factoring columns on invoices table
-- Run this in Supabase SQL Editor

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='factored_at') THEN
    ALTER TABLE invoices ADD COLUMN factored_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='factoring_company') THEN
    ALTER TABLE invoices ADD COLUMN factoring_company TEXT DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='factoring_rate') THEN
    ALTER TABLE invoices ADD COLUMN factoring_rate NUMERIC(4,2) DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='factoring_fee') THEN
    ALTER TABLE invoices ADD COLUMN factoring_fee NUMERIC(10,2) DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='factoring_net') THEN
    ALTER TABLE invoices ADD COLUMN factoring_net NUMERIC(10,2) DEFAULT NULL;
  END IF;
END $$;
