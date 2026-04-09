-- 002_localities.sql
-- Locality and save tables per Sections 9.5 and 13.1

CREATE TABLE localities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    name TEXT NOT NULL,
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    graph JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_localities_user ON localities(user_id);
CREATE INDEX idx_localities_name ON localities(name);

CREATE TABLE saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    locality_id UUID NOT NULL REFERENCES localities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    flavor TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    spawn_node_id TEXT NOT NULL,
    party JSONB NOT NULL,
    inventory JSONB NOT NULL,
    quest_state JSONB NOT NULL,
    world_state JSONB NOT NULL,
    rng_seed BIGINT NOT NULL,
    play_time_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_saves_user ON saves(user_id);
CREATE INDEX idx_saves_locality ON saves(locality_id);
