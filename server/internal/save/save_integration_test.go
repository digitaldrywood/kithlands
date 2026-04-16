//go:build integration

package save

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/testutil"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestServiceCreateAndLoad(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	pool := testutil.NewIntegrationPool(t)
	service := NewService(pool)
	userID := seedUser(t, pool, "save-owner@example.com")
	localityID := seedLocality(t, pool, userID, "Cadott")

	state := &SaveState{
		UserID:       userID,
		LocalityID:   localityID,
		Name:         "Cadott Run",
		TriggerEvent: "",
		Flavor:       "governance",
		Difficulty:   "normal",
		SpawnNodeID:  "town-square",
		Party:        json.RawMessage(`[{"class":"warrior"}]`),
		Inventory:    json.RawMessage(`{"gold":10}`),
		QuestState:   json.RawMessage(`{"active":["q1"]}`),
		WorldState:   json.RawMessage(`{"cleared":[]}`),
		RNGSeed:      42,
	}

	if err := service.Create(ctx, state); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	saveID := fetchSaveIDByName(t, pool, userID, state.Name)
	loaded, err := service.Load(ctx, saveID, userID)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if loaded.Name != state.Name {
		t.Fatalf("Name = %q, want %q", loaded.Name, state.Name)
	}
	if loaded.SaveType != "manual" {
		t.Fatalf("SaveType = %q, want %q", loaded.SaveType, "manual")
	}
	assertJSONEqual(t, loaded.Party, state.Party)
	assertJSONEqual(t, loaded.Inventory, state.Inventory)
	if loaded.RNGSeed != state.RNGSeed {
		t.Fatalf("RNGSeed = %d, want %d", loaded.RNGSeed, state.RNGSeed)
	}
}

func TestServiceUpdateListAndDeleteOldestAutosaves(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	pool := testutil.NewIntegrationPool(t)
	service := NewService(pool)
	userID := seedUser(t, pool, "autosaves@example.com")
	localityID := seedLocality(t, pool, userID, "Eau Claire")

	manual := &SaveState{
		UserID:      userID,
		LocalityID:  localityID,
		Name:        "Manual Save",
		Flavor:      "conquest",
		Difficulty:  "hard",
		SpawnNodeID: "gate",
		Party:       json.RawMessage(`[{"class":"mage"}]`),
		Inventory:   json.RawMessage(`{"gold":1}`),
		QuestState:  json.RawMessage(`{"active":[]}`),
		WorldState:  json.RawMessage(`{"cleared":[]}`),
		RNGSeed:     7,
	}

	if err := service.Create(ctx, manual); err != nil {
		t.Fatalf("Create(manual) error = %v", err)
	}
	manualID := fetchSaveIDByName(t, pool, userID, manual.Name)

	update := &SaveState{
		UserID:      userID,
		Party:       json.RawMessage(`[{"class":"mage","hp":12}]`),
		Inventory:   json.RawMessage(`{"gold":99}`),
		QuestState:  json.RawMessage(`{"active":["q2"]}`),
		WorldState:  json.RawMessage(`{"cleared":["cave"]}`),
		PlayTimeSec: 123,
	}
	if err := service.Update(ctx, manualID, update); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	loaded, err := service.Load(ctx, manualID, userID)
	if err != nil {
		t.Fatalf("Load(updated) error = %v", err)
	}
	if loaded.PlayTimeSec != 123 {
		t.Fatalf("PlayTimeSec = %d, want %d", loaded.PlayTimeSec, 123)
	}
	assertJSONEqual(t, loaded.Inventory, json.RawMessage(`{"gold":99}`))

	for i := 0; i < 3; i++ {
		name := "Autosave " + string(rune('A'+i))
		if err := service.Create(ctx, &SaveState{
			UserID:       userID,
			LocalityID:   localityID,
			Name:         name,
			SaveType:     "autosave",
			TriggerEvent: "quest_complete",
			Flavor:       "conquest",
			Difficulty:   "hard",
			SpawnNodeID:  "gate",
			Party:        json.RawMessage(`[{"class":"rogue"}]`),
			Inventory:    json.RawMessage(`{"gold":2}`),
			QuestState:   json.RawMessage(`{"active":[]}`),
			WorldState:   json.RawMessage(`{"cleared":[]}`),
			RNGSeed:      int64(i + 100),
		}); err != nil {
			t.Fatalf("Create(autosave %d) error = %v", i, err)
		}
	}

	saves, err := service.ListByUser(ctx, userID)
	if err != nil {
		t.Fatalf("ListByUser() error = %v", err)
	}
	if len(saves) != 4 {
		t.Fatalf("len(ListByUser()) = %d, want %d", len(saves), 4)
	}

	if err := service.DeleteOldestAutosaves(ctx, userID, 2); err != nil {
		t.Fatalf("DeleteOldestAutosaves() error = %v", err)
	}

	var autosaveCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM saves WHERE user_id = $1 AND save_type = 'autosave'`, userID).Scan(&autosaveCount); err != nil {
		t.Fatalf("count autosaves: %v", err)
	}
	if autosaveCount != 2 {
		t.Fatalf("autosave count = %d, want %d", autosaveCount, 2)
	}
}

func seedUser(t *testing.T, pool *pgxpool.Pool, email string) string {
	t.Helper()

	var userID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO users (email) VALUES ($1) RETURNING id`, email,
	).Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	return userID
}

func seedLocality(t *testing.T, pool *pgxpool.Pool, userID, name string) string {
	t.Helper()

	var localityID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO localities (user_id, source, name, graph)
		 VALUES ($1, 'manual', $2, '{}'::jsonb)
		 RETURNING id`,
		userID, name,
	).Scan(&localityID); err != nil {
		t.Fatalf("insert locality: %v", err)
	}
	return localityID
}

func fetchSaveIDByName(t *testing.T, pool *pgxpool.Pool, userID, name string) string {
	t.Helper()

	var saveID string
	if err := pool.QueryRow(context.Background(),
		`SELECT id FROM saves WHERE user_id = $1 AND name = $2 ORDER BY created_at DESC LIMIT 1`,
		userID, name,
	).Scan(&saveID); err != nil {
		t.Fatalf("lookup save %q: %v", name, err)
	}
	return saveID
}

func assertJSONEqual(t *testing.T, got, want json.RawMessage) {
	t.Helper()

	var gotValue any
	if err := json.Unmarshal(got, &gotValue); err != nil {
		t.Fatalf("unmarshal got JSON %s: %v", got, err)
	}

	var wantValue any
	if err := json.Unmarshal(want, &wantValue); err != nil {
		t.Fatalf("unmarshal want JSON %s: %v", want, err)
	}

	gotJSON, err := json.Marshal(gotValue)
	if err != nil {
		t.Fatalf("marshal got JSON: %v", err)
	}

	wantJSON, err := json.Marshal(wantValue)
	if err != nil {
		t.Fatalf("marshal want JSON: %v", err)
	}

	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("JSON = %s, want %s", gotJSON, wantJSON)
	}
}
