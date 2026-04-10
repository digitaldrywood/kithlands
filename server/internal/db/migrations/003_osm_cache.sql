-- 003_osm_cache.sql
-- Add radius column to localities for OSM cache lookups

ALTER TABLE localities ADD COLUMN IF NOT EXISTS radius_m INT;

CREATE INDEX IF NOT EXISTS idx_localities_coords
    ON localities(center_lat, center_lng)
    WHERE source = 'osm';
