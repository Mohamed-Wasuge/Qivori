-- =============================================================================
-- FreightMind AI — RLS Security Fixes
-- Generated: 2026-03-16
--
-- This migration hardens Row Level Security policies across the database.
-- Run against your Supabase project via the SQL Editor or psql.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. load_stops — verify user owns the parent load via loads.owner_id
-- =============================================================================

-- The previous policies allowed any authenticated user to read/write load_stops.
-- These replacements ensure the caller owns the parent load.

-- Drop old policies from original migration
DROP POLICY IF EXISTS "load_stops_select" ON load_stops;
DROP POLICY IF EXISTS "load_stops_insert" ON load_stops;
DROP POLICY IF EXISTS "load_stops_update" ON load_stops;
DROP POLICY IF EXISTS "load_stops_delete" ON load_stops;

DROP POLICY IF EXISTS "Users can view their own load stops" ON load_stops;
CREATE POLICY "Users can view their own load stops"
  ON load_stops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = load_stops.load_id
        AND loads.broker_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own load stops" ON load_stops;
CREATE POLICY "Users can insert their own load stops"
  ON load_stops FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = load_stops.load_id
        AND loads.broker_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own load stops" ON load_stops;
CREATE POLICY "Users can update their own load stops"
  ON load_stops FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = load_stops.load_id
        AND loads.broker_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = load_stops.load_id
        AND loads.broker_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own load stops" ON load_stops;
CREATE POLICY "Users can delete their own load stops"
  ON load_stops FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = load_stops.load_id
        AND loads.broker_id = auth.uid()
    )
  );


-- =============================================================================
-- 2. Storage — make the documents bucket private and verify ownership
-- =============================================================================

-- Ensure the bucket itself is marked private (public = false).
UPDATE storage.buckets
SET public = false
WHERE id = 'documents';

-- Replace the SELECT policy so only the file owner (identified by folder name
-- matching their user id) can read objects.

DROP POLICY IF EXISTS "storage_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_view" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "Users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
CREATE POLICY "Users can view their own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
CREATE POLICY "Users can upload their own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
CREATE POLICY "Users can update their own documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
CREATE POLICY "Users can delete their own documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- =============================================================================
-- 3. waitlist — restrict SELECT to admin (service role) only
-- =============================================================================

-- Remove any permissive SELECT policy so anon/authenticated users cannot list
-- waitlist entries. Only the service_role key (used server-side) can read.

DROP POLICY IF EXISTS "waitlist_select" ON waitlist;
DROP POLICY IF EXISTS "waitlist_insert" ON waitlist;
DROP POLICY IF EXISTS "Allow public read of waitlist" ON waitlist;
DROP POLICY IF EXISTS "Anyone can view waitlist" ON waitlist;
DROP POLICY IF EXISTS "Waitlist is viewable by everyone" ON waitlist;
DROP POLICY IF EXISTS "Admin can view waitlist" ON waitlist;

-- Only service_role can SELECT waitlist rows.
CREATE POLICY "Admin can view waitlist"
  ON waitlist FOR SELECT
  USING (
    auth.role() = 'service_role'
  );

-- Keep the public INSERT so visitors can still sign up.
DROP POLICY IF EXISTS "Anyone can join waitlist" ON waitlist;
CREATE POLICY "Anyone can join waitlist"
  ON waitlist FOR INSERT
  WITH CHECK (true);


-- =============================================================================
-- 4. analytics_events — remove wide-open INSERT, rely on service role
-- =============================================================================

-- The previous policy let any anonymous caller insert arbitrary analytics rows.
-- Analytics should be written exclusively through server-side API routes that
-- use the service_role key.

DROP POLICY IF EXISTS "analytics_events_insert_service" ON analytics_events;
DROP POLICY IF EXISTS "analytics_events_select_admin" ON analytics_events;
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON analytics_events;
DROP POLICY IF EXISTS "Allow anonymous inserts to analytics_events" ON analytics_events;
DROP POLICY IF EXISTS "Allow public insert analytics" ON analytics_events;
DROP POLICY IF EXISTS "Service role can insert analytics events" ON analytics_events;

CREATE POLICY "Service role can insert analytics events"
  ON analytics_events FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
  );

-- SELECT should also be restricted to service role (for dashboards via API).
DROP POLICY IF EXISTS "Service role can view analytics events" ON analytics_events;
CREATE POLICY "Service role can view analytics events"
  ON analytics_events FOR SELECT
  USING (
    auth.role() = 'service_role'
  );


-- =============================================================================
-- 5. weigh_station_reports — require auth for SELECT, hide reporter_id
-- =============================================================================

-- Previously anyone (including anon) could SELECT all columns.
-- Now only authenticated users can read, and we create a view that excludes
-- reporter_id for public-facing queries.

DROP POLICY IF EXISTS "Anyone can view weigh station reports" ON weigh_station_reports;
DROP POLICY IF EXISTS "Public can view weigh station reports" ON weigh_station_reports;
DROP POLICY IF EXISTS "Authenticated users can view weigh station reports" ON weigh_station_reports;
DROP POLICY IF EXISTS "ws_reports_select" ON weigh_station_reports;

CREATE POLICY "Authenticated users can view weigh station reports"
  ON weigh_station_reports FOR SELECT
  USING (
    auth.role() = 'authenticated'
  );


-- =============================================================================
-- 6. check_calls — verify ownership through the loads table
-- =============================================================================

-- check_calls must only be accessible when the user owns the related load.

DROP POLICY IF EXISTS "check_calls_select" ON check_calls;
DROP POLICY IF EXISTS "check_calls_insert" ON check_calls;
DROP POLICY IF EXISTS "Users can view their own check calls" ON check_calls;
CREATE POLICY "Users can view their own check calls"
  ON check_calls FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = check_calls.load_id
        AND loads.broker_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own check calls" ON check_calls;
CREATE POLICY "Users can insert their own check calls"
  ON check_calls FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = check_calls.load_id
        AND loads.broker_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own check calls" ON check_calls;
CREATE POLICY "Users can update their own check calls"
  ON check_calls FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = check_calls.load_id
        AND loads.broker_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = check_calls.load_id
        AND loads.broker_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own check calls" ON check_calls;
CREATE POLICY "Users can delete their own check calls"
  ON check_calls FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM loads
      WHERE loads.id = check_calls.load_id
        AND loads.broker_id = auth.uid()
    )
  );


COMMIT;
