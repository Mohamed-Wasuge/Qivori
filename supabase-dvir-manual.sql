-- Allow manual DVIR submissions (not just from ELD providers)
ALTER TABLE eld_dvirs DROP CONSTRAINT IF EXISTS eld_dvirs_source_provider_check;
ALTER TABLE eld_dvirs ADD CONSTRAINT eld_dvirs_source_provider_check CHECK (source_provider IN ('samsara', 'motive', 'manual'));
