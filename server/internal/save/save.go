package save

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// SaveState is the complete game state for one save slot.
type SaveState struct {
	ID           string          `json:"id"`
	UserID       string          `json:"user_id"`
	LocalityID   string          `json:"locality_id"`
	Name         string          `json:"name"`
	Flavor       string          `json:"flavor"`
	Difficulty   string          `json:"difficulty"`
	SpawnNodeID  string          `json:"spawn_node_id"`
	Party        json.RawMessage `json:"party"`
	Inventory    json.RawMessage `json:"inventory"`
	QuestState   json.RawMessage `json:"quest_state"`
	WorldState   json.RawMessage `json:"world_state"`
	RNGSeed      int64           `json:"rng_seed"`
	PlayTimeSec  int             `json:"play_time_seconds"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	CompletedAt  *time.Time      `json:"completed_at,omitempty"`
}

func (s *Service) Create(ctx context.Context, state *SaveState) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO saves (id, user_id, locality_id, name, flavor, difficulty, spawn_node_id,
		 party, inventory, quest_state, world_state, rng_seed)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		state.UserID, state.LocalityID, state.Name, state.Flavor, state.Difficulty,
		state.SpawnNodeID, state.Party, state.Inventory, state.QuestState, state.WorldState, state.RNGSeed)
	if err != nil {
		return fmt.Errorf("creating save: %w", err)
	}
	return nil
}

func (s *Service) Update(ctx context.Context, saveID string, state *SaveState) error {
	_, err := s.db.Exec(ctx,
		`UPDATE saves SET party = $1, inventory = $2, quest_state = $3, world_state = $4,
		 play_time_seconds = $5, updated_at = NOW()
		 WHERE id = $6 AND user_id = $7`,
		state.Party, state.Inventory, state.QuestState, state.WorldState,
		state.PlayTimeSec, saveID, state.UserID)
	if err != nil {
		return fmt.Errorf("updating save: %w", err)
	}
	return nil
}

func (s *Service) Load(ctx context.Context, saveID, userID string) (*SaveState, error) {
	var state SaveState
	err := s.db.QueryRow(ctx,
		`SELECT id, user_id, locality_id, name, flavor, difficulty, spawn_node_id,
		 party, inventory, quest_state, world_state, rng_seed,
		 play_time_seconds, created_at, updated_at, completed_at
		 FROM saves WHERE id = $1 AND user_id = $2`, saveID, userID).
		Scan(&state.ID, &state.UserID, &state.LocalityID, &state.Name,
			&state.Flavor, &state.Difficulty, &state.SpawnNodeID,
			&state.Party, &state.Inventory, &state.QuestState, &state.WorldState,
			&state.RNGSeed, &state.PlayTimeSec, &state.CreatedAt, &state.UpdatedAt,
			&state.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("loading save: %w", err)
	}
	return &state, nil
}

func (s *Service) ListByUser(ctx context.Context, userID string) ([]SaveState, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, user_id, locality_id, name, flavor, difficulty, spawn_node_id,
		 party, inventory, quest_state, world_state, rng_seed,
		 play_time_seconds, created_at, updated_at, completed_at
		 FROM saves WHERE user_id = $1 ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("listing saves: %w", err)
	}
	defer rows.Close()

	var saves []SaveState
	for rows.Next() {
		var s SaveState
		err := rows.Scan(&s.ID, &s.UserID, &s.LocalityID, &s.Name,
			&s.Flavor, &s.Difficulty, &s.SpawnNodeID,
			&s.Party, &s.Inventory, &s.QuestState, &s.WorldState,
			&s.RNGSeed, &s.PlayTimeSec, &s.CreatedAt, &s.UpdatedAt,
			&s.CompletedAt)
		if err != nil {
			return nil, fmt.Errorf("scanning save: %w", err)
		}
		saves = append(saves, s)
	}
	return saves, nil
}
