//go:build integration

package api

import (
	"context"
	"encoding/json"
	"github.com/digitaldrywood/kithlands/internal/auth"
	"github.com/digitaldrywood/kithlands/internal/save"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/testutil"
)

func TestSaveLocalityUpdatesStoredRoadsAndWaterways(t *testing.T) {
	ctx := context.Background()
	pool := testutil.NewIntegrationPool(t)
	var userID string
	if err := pool.QueryRow(ctx, "INSERT INTO users(email) VALUES ('river-save@example.com') RETURNING id").Scan(&userID); err != nil {
		t.Fatal(err)
	}
	game := newTownTestGame(t)
	server := &Server{db: pool}
	server.saveLocality(ctx, game, userID)
	game.loc.RoadSegments = []locality.Road{{Class: "primary", Points: []struct{ X, Y float64 }{{0, .5}, {1, .5}}}}
	game.loc.WaterwaySegments = []locality.Waterway{{Kind: "river", Points: []struct{ X, Y float64 }{{.5, 0}, {.5, 1}}}}
	server.saveLocality(ctx, game, userID)
	loaded, err := server.loadLocality(ctx, game.loc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(loaded.Roads(), game.loc.Roads()) || !reflect.DeepEqual(loaded.Waterways(), game.loc.Waterways()) {
		t.Fatal("existing locality lost updated road/waterway geometry")
	}
	want := locality.GenerateTileMap(game.loc, game.walk.Spawn.ID, game.walk)
	got := locality.GenerateTileMap(loaded, game.walk.Spawn.ID, game.walk)
	if !reflect.DeepEqual(want.Tiles, got.Tiles) {
		t.Fatal("database round trip changed terrain or crossings")
	}
}

// Opt-in browser fixture: seed a unique account in the wrapper's isolated DB.
// Browser tests then use the normal load and movement APIs, without map mocks.
func TestSeedRiverBrowserWorld(t *testing.T) {
	output := os.Getenv("KITHLANDS_RIVER_PROOF_PATH")
	if output == "" {
		t.Skip("browser fixture only")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	authService := auth.NewService(pool)
	token, err := authService.RegisterOrLogin(ctx, "river-"+uuid.NewString()+"@kithlands.dev")
	if err != nil {
		t.Fatal(err)
	}
	user, err := authService.ValidateToken(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	game := newTownTestGame(t)
	game.loc.RoadSegments = []locality.Road{{Class: "primary", Points: []struct{ X, Y float64 }{{0, .75}, {1, .75}}}}
	for _, x := range []float64{.25, .5, .75} {
		game.loc.WaterwaySegments = append(game.loc.WaterwaySegments, locality.Waterway{Kind: "stream", Points: []struct{ X, Y float64 }{{x, 0}, {x - .08, .35}, {x + .07, .6}, {x, 1}}})
	}
	game.loc.WaterwaySegments = append(game.loc.WaterwaySegments, locality.Waterway{Kind: "river", Points: []struct{ X, Y float64 }{{0, .4}, {.5, .55}, {1, .45}}})
	before := locality.GenerateTileMapBeforeFootbridges(game.loc, game.walk.Spawn.ID, game.walk)
	game.tileMap = locality.GenerateTileMap(game.loc, game.walk.Spawn.ID, game.walk)
	var crossing map[string]any
search:
	for y, row := range game.tileMap.Tiles {
		for x, tile := range row {
			if tile != int(locality.TileBridge) || before.Tiles[y][x] != int(locality.TileRiver) {
				continue
			}
			for _, d := range [][2]int{{1, 0}, {0, 1}} {
				from := WorldPosition{X: x - d[0], Y: y - d[1]}
				if validateWorldCheckpointPosition(game.tileMap, game.loc, game.worldTraversal(), from, game.walk.Spawn.ID) != nil || game.tileMap.Tiles[from.Y][from.X] == int(locality.TileBridge) {
					continue
				}
				steps := 1
				for game.tileMap.Tiles[y+d[1]*steps][x+d[0]*steps] == int(locality.TileBridge) {
					steps++
				}
				to := WorldPosition{X: x + d[0]*steps, Y: y + d[1]*steps}
				if validateWorldCheckpointPosition(game.tileMap, game.loc, game.worldTraversal(), to, game.walk.Spawn.ID) != nil {
					continue
				}
				game.worldCheckpoint = &WorldCheckpoint{X: from.X, Y: from.Y, WorldNodeID: game.walk.Spawn.ID, MapSignature: worldMapSignature(game.tileMap)}
				crossing = map[string]any{"x": from.X, "y": from.Y, "dx": d[0], "dy": d[1], "steps": steps + 1}
				break search
			}
		}
	}
	if crossing == nil {
		t.Fatal("no usable river crossing")
	}
	server := &Server{db: pool}
	server.saveLocality(ctx, game, user.ID)
	state, err := game.ToSaveState("River crossing regression", user.ID)
	if err != nil {
		t.Fatal(err)
	}
	service := save.NewService(pool)
	if err := service.Create(ctx, state); err != nil {
		t.Fatal(err)
	}
	saves, err := service.ListByUser(ctx, user.ID)
	if err != nil || len(saves) != 1 {
		t.Fatalf("fixture save: %v", err)
	}
	data, err := json.Marshal(map[string]any{"token": token, "saveID": saves[0].ID, "before": before, "after": game.tileMap, "crossing": crossing})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(output, data, 0600); err != nil {
		t.Fatal(err)
	}
}
