-- ============================================================
-- QIVORI EDI SYSTEM — DATABASE MIGRATION
-- Tables: trading_partners, edi_transactions, edi_exceptions
-- ============================================================

-- ── 1. Trading Partners ──────────────────────────────────────
-- Each shipper/broker that sends/receives EDI documents
CREATE TABLE IF NOT EXISTS trading_partners (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) NOT NULL,

    -- Identity
    name TEXT NOT NULL,
    isa_id TEXT,                          -- ISA sender/receiver ID (EDI qualifier)
    gs_id TEXT,                           -- GS application sender/receiver code
    partner_type TEXT DEFAULT 'broker',   -- 'broker', 'shipper', 'carrier', '3pl'

    -- Connection
    connection_type TEXT DEFAULT 'api',   -- 'api', 'as2', 'sftp' (as2/sftp = future VAN)
    api_endpoint TEXT,                    -- webhook URL for outbound EDI
    api_key TEXT,                         -- partner API key (encrypted at rest by Supabase)

    -- Mapping overrides
    field_mapping JSONB DEFAULT '{}'::jsonb,  -- partner-specific field mapping rules
    auto_accept BOOLEAN DEFAULT false,        -- auto-accept all tenders from this partner
    auto_respond BOOLEAN DEFAULT true,        -- auto-send 990 responses
    send_214 BOOLEAN DEFAULT true,            -- auto-send status updates
    send_210 BOOLEAN DEFAULT true,            -- auto-send invoices

    -- Thresholds (override carrier defaults per partner)
    min_profit INTEGER,
    min_rpm NUMERIC(6,2),

    -- Contact
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,

    -- Status
    status TEXT DEFAULT 'active',        -- 'active', 'inactive', 'testing'
    last_transaction_at TIMESTAMPTZ,
    transaction_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. EDI Transactions ──────────────────────────────────────
-- Every EDI document sent or received (audit trail + reprocessing)
CREATE TABLE IF NOT EXISTS edi_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) NOT NULL,

    -- Transaction identity
    transaction_type TEXT NOT NULL,       -- '204', '990', '214', '210'
    direction TEXT NOT NULL,              -- 'inbound', 'outbound'
    trading_partner_id UUID REFERENCES trading_partners(id),

    -- EDI envelope
    isa_control_number TEXT,              -- ISA13 interchange control number
    gs_control_number TEXT,               -- GS06 group control number
    st_control_number TEXT,               -- ST02 transaction set control number

    -- Content
    raw_edi TEXT,                         -- original X12 string
    parsed_data JSONB,                   -- parsed JSON representation
    canonical_load JSONB,                -- mapped to canonical load model

    -- Links
    load_id UUID REFERENCES loads(id),
    load_number TEXT,
    related_transaction_id UUID REFERENCES edi_transactions(id),  -- e.g., 990 links to its 204

    -- Processing
    status TEXT DEFAULT 'received',      -- 'received', 'processing', 'processed', 'error', 'duplicate', 'acknowledged'
    ai_decision TEXT,                    -- 'accept', 'reject', 'negotiate' (for 204s)
    ai_confidence INTEGER,               -- 0-100
    ai_reasons JSONB,                    -- decision reasons array
    ai_metrics JSONB,                    -- evaluation metrics

    -- Acknowledgment
    ack_status TEXT,                      -- 'pending', 'sent', 'confirmed', 'failed'
    ack_sent_at TIMESTAMPTZ,

    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,

    -- Timestamps
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. EDI Exceptions ────────────────────────────────────────
-- Failed/flagged transactions that need human review
CREATE TABLE IF NOT EXISTS edi_exceptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) NOT NULL,

    -- Links
    edi_transaction_id UUID REFERENCES edi_transactions(id),
    load_id UUID REFERENCES loads(id),
    trading_partner_id UUID REFERENCES trading_partners(id),

    -- Exception details
    exception_type TEXT NOT NULL,         -- 'parse_error', 'validation_error', 'duplicate', 'transmission_failure', 'ai_review', 'missing_data'
    severity TEXT DEFAULT 'warning',      -- 'info', 'warning', 'error', 'critical'
    title TEXT NOT NULL,
    description TEXT,

    -- Original data for reprocessing
    raw_data TEXT,
    parsed_data JSONB,

    -- Resolution
    status TEXT DEFAULT 'open',          -- 'open', 'acknowledged', 'resolved', 'ignored'
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Actions taken
    reprocessed BOOLEAN DEFAULT false,
    reprocessed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Trading partners
CREATE INDEX IF NOT EXISTS idx_trading_partners_owner ON trading_partners(owner_id);
CREATE INDEX IF NOT EXISTS idx_trading_partners_isa ON trading_partners(isa_id);
CREATE INDEX IF NOT EXISTS idx_trading_partners_status ON trading_partners(status);

-- EDI transactions
CREATE INDEX IF NOT EXISTS idx_edi_transactions_owner ON edi_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_edi_transactions_type ON edi_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_edi_transactions_direction ON edi_transactions(direction);
CREATE INDEX IF NOT EXISTS idx_edi_transactions_status ON edi_transactions(status);
CREATE INDEX IF NOT EXISTS idx_edi_transactions_load ON edi_transactions(load_id);
CREATE INDEX IF NOT EXISTS idx_edi_transactions_partner ON edi_transactions(trading_partner_id);
CREATE INDEX IF NOT EXISTS idx_edi_transactions_isa ON edi_transactions(isa_control_number);
CREATE INDEX IF NOT EXISTS idx_edi_transactions_created ON edi_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edi_transactions_related ON edi_transactions(related_transaction_id);

-- EDI exceptions
CREATE INDEX IF NOT EXISTS idx_edi_exceptions_owner ON edi_exceptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_edi_exceptions_status ON edi_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_edi_exceptions_type ON edi_exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_edi_exceptions_transaction ON edi_exceptions(edi_transaction_id);
CREATE INDEX IF NOT EXISTS idx_edi_exceptions_severity ON edi_exceptions(severity);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE trading_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE edi_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edi_exceptions ENABLE ROW LEVEL SECURITY;

-- Users see their own data
CREATE POLICY "Users own trading_partners" ON trading_partners FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Service role trading_partners" ON trading_partners FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users own edi_transactions" ON edi_transactions FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Service role edi_transactions" ON edi_transactions FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users own edi_exceptions" ON edi_exceptions FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Service role edi_exceptions" ON edi_exceptions FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE TRIGGER trading_partners_updated_at
    BEFORE UPDATE ON trading_partners
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER edi_transactions_updated_at
    BEFORE UPDATE ON edi_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER edi_exceptions_updated_at
    BEFORE UPDATE ON edi_exceptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-increment partner transaction count
CREATE OR REPLACE FUNCTION update_partner_transaction_count()
RETURNS TRIGGER AS $fn$
BEGIN
    IF NEW.trading_partner_id IS NOT NULL THEN
        UPDATE trading_partners
        SET transaction_count = transaction_count + 1,
            last_transaction_at = NOW()
        WHERE id = NEW.trading_partner_id;
    END IF;
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_edi_transaction_count
    AFTER INSERT ON edi_transactions
    FOR EACH ROW EXECUTE FUNCTION update_partner_transaction_count();

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Check for duplicate 204 tenders (same ISA control + ST control)
CREATE OR REPLACE FUNCTION check_edi_duplicate(
    p_owner_id UUID,
    p_isa_control TEXT,
    p_st_control TEXT,
    p_transaction_type TEXT
)
RETURNS BOOLEAN AS $fn$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM edi_transactions
        WHERE owner_id = p_owner_id
          AND isa_control_number = p_isa_control
          AND st_control_number = p_st_control
          AND transaction_type = p_transaction_type
          AND status NOT IN ('error', 'duplicate')
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
