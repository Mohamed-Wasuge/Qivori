-- Add route calculation columns to loads table
-- Stores fuel cost, toll estimate, and coordinates for analytics + fleet map

ALTER TABLE loads ADD COLUMN IF NOT EXISTS fuel_estimate NUMERIC(10,2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS toll_estimate NUMERIC(10,2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS drive_time_minutes INTEGER;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS diesel_price_at_booking NUMERIC(6,3);
