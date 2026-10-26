//go:build integration

package api

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/auth"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/save"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestSeedLegacyTrailBrowserWorld writes an actual pre-trail save for native
// Continue/save/reload verification. It never clears a database or another user.
func TestSeedLegacyTrailBrowserWorld(t *testing.T) {
	output := os.Getenv("KITHLANDS_LEGACY_TRAIL_PROOF_PATH")
	if output == "" {
		t.Skip("browser fixture only")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	email := "legacy-trail-" + uuid.NewString() + "@kithlands.dev"
	service := auth.NewService(pool)
	token, err := service.RegisterOrLogin(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	user, err := service.ValidateToken(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	game := newTownTestGame(t)
	game.tileMap = locality.GenerateTileMapBeforePublicTrails(game.loc, game.walk.Spawn.ID, game.walk)
	game.resourcePlacementVersion = resourcePlacementLegacy
	game.resourceMap, game.resourceNodeCache = nil, nil
	nodes := game.State().Resources
	if len(nodes) == 0 {
		t.Fatal("legacy fixture has no resource sites")
	}
	node := nodes[0]
	game.setWorldCheckpointLocked(WorldPosition{X: node.X, Y: node.Y}, game.location.WorldNodeID)
	if err := game.Gather(node.ID); err != nil {
		t.Fatal(err)
	}
	before := game.State()
	server := &Server{db: pool}
	server.saveLocality(ctx, game, user.ID)
	saved, err := game.ToSaveState("Legacy trail migration", user.ID)
	if err != nil {
		t.Fatal(err)
	}
	var world map[string]json.RawMessage
	if err := json.Unmarshal(saved.WorldState, &world); err != nil {
		t.Fatal(err)
	}
	delete(world, "resource_placement_version")
	saved.WorldState, err = json.Marshal(world)
	if err != nil {
		t.Fatal(err)
	}
	if err := save.NewService(pool).Create(ctx, saved); err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(map[string]any{"email": email, "before": before, "harvestedID": node.ID, "deadline": game.inv.ResourceReadyAt[node.ID]})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(output, data, 0600); err != nil {
		t.Fatal(err)
	}
}
