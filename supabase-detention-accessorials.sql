-- ═══════════════════════════════════════════════════════════════════════════════
-- QIVORI AI — Detention Tracking & Invoice Line Items
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add detention tracking fields to loads
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS detention_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detention_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detention_hours NUMERIC(6,2);

-- Add line items (accessorial charges) to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]';
-- line_items format: [{ type: "detention", description: "Detention (2.5hrs @ $75/hr)", amount: 187.50 }]

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════════════════════════
