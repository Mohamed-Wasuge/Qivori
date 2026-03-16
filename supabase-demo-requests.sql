-- Demo requests table — tracks who requested demo access
CREATE TABLE IF NOT EXISTS demo_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text,
  email text NOT NULL,
  phone text,
  company text,
  source text DEFAULT 'landing_page',
  converted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Allow service key to insert
ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service key full access" ON demo_requests FOR ALL USING (true) WITH CHECK (true);

-- Index for admin queries
CREATE INDEX idx_demo_requests_email ON demo_requests(email);
CREATE INDEX idx_demo_requests_created ON demo_requests(created_at DESC);
