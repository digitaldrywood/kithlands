-- 003_autosave.sql
-- Add autosave support per Issue #11

ALTER TABLE saves ADD COLUMN save_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE saves ADD COLUMN trigger_event TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_saves_user_type ON saves(user_id, save_type);
