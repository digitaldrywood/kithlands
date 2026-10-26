package api

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

func TestPublicTrailMigrationPreservesPositionHarvestAndTimers(t *testing.T) {
	game := newTownTestGame(t)
	spawnID := game.walk.Spawn.ID
	oldMap := locality.GenerateTileMapBeforePublicTrails(game.loc, spawnID, game.walk)
	game.tileMap = oldMap
	game.resourcePlacementVersion = resourcePlacementLegacy
	game.resourceMap, game.resourceNodeCache = nil, nil
	nodes := game.State().Resources
	if len(nodes) == 0 {
		t.Fatal("legacy fixture has no resources")
	}
	node := nodes[0]
	game.setWorldCheckpointLocked(WorldPosition{X: node.X, Y: node.Y}, game.location.WorldNodeID)
	if err := game.Gather(node.ID); err != nil {
		t.Fatal(err)
	}
	deadline := game.inv.ResourceReadyAt[node.ID]
	if deadline == 0 {
		t.Fatal("harvest has no absolute deadline")
	}
	wantPosition := *game.worldCheckpoint
	saved, err := game.ToSaveState("before public trails", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	// Older saves have no placement-version field. Exercise that exact JSON
	// boundary rather than supplying the new compatibility flag ourselves.
	var world map[string]json.RawMessage
	if err := json.Unmarshal(saved.WorldState, &world); err != nil {
		t.Fatal(err)
	}
	delete(world, "resource_placement_version")
	saved.WorldState, err = json.Marshal(world)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	got := loaded.State()
	if got.WorldCheckpoint.X != wantPosition.X || got.WorldCheckpoint.Y != wantPosition.Y || got.WorldCheckpoint.WorldNodeID != wantPosition.WorldNodeID {
		t.Fatalf("migration moved checkpoint: %+v -> %+v", wantPosition, got.WorldCheckpoint)
	}
	if got.WorldCheckpoint.MapSignature == wantPosition.MapSignature {
		t.Fatal("fixture did not migrate the map")
	}
	if got.WorldCheckpoint.MapSignature != worldMapSignature(loaded.tileMap) {
		t.Fatal("checkpoint has wrong migrated signature")
	}
	if !reflect.DeepEqual(game.inv.Materials, loaded.inv.Materials) || !reflect.DeepEqual(game.inv.ResourceReadyAt, loaded.inv.ResourceReadyAt) || !reflect.DeepEqual(game.inv.GatheredResources, loaded.inv.GatheredResources) {
		t.Fatal("migration changed materials or harvest state")
	}
	beforeIDs := map[string]bool{}
	afterIDs := map[string]bool{}
	for _, n := range nodes {
		beforeIDs[n.ID] = true
	}
	found := false
	for _, n := range got.Resources {
		afterIDs[n.ID] = true
		if n.ID == node.ID {
			found = true
			if !n.Gathered || n.ReadyAt != deadline {
				t.Fatal("legacy harvest respawned or its deadline changed")
			}
		}
	}
	if !found || !reflect.DeepEqual(beforeIDs, afterIDs) {
		t.Fatalf("legacy resource identities changed: %v -> %v", beforeIDs, afterIDs)
	}
	if loaded.resourcePlacementVersion != resourcePlacementLegacy {
		t.Fatal("legacy anchor algorithm was not retained")
	}
	again, err := loaded.ToSaveState("with public trails", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	reloaded, err := FromSaveState(again, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(reloaded.State().WorldCheckpoint, got.WorldCheckpoint) || !reflect.DeepEqual(reloaded.inv.ResourceReadyAt, game.inv.ResourceReadyAt) || reloaded.resourcePlacementVersion != resourcePlacementLegacy {
		t.Fatal("second save/load changed position, placement version or deadlines")
	}
	// Only exact historical fingerprints are eligible for migration.
	var checkpoint WorldCheckpoint
	if err := json.Unmarshal(world["world_checkpoint"], &checkpoint); err != nil {
		t.Fatal(err)
	}
	checkpoint.MapSignature += "-corrupt"
	world["world_checkpoint"], err = json.Marshal(checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	saved.WorldState, err = json.Marshal(world)
	if err != nil {
		t.Fatal(err)
	}
	recovered, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.worldCheckpoint.X == wantPosition.X && recovered.worldCheckpoint.Y == wantPosition.Y {
		t.Fatal("arbitrary stale fingerprint retained its position")
	}
}

func TestNewPublicTrailGamesKeepCurrentResourcePlacementOnLoad(t *testing.T) {
	game := newTownTestGame(t)
	if game.resourcePlacementVersion != resourcePlacementTrails {
		t.Fatal("new adventure uses legacy resource anchors")
	}
	before := game.State().Resources
	saved, err := game.ToSaveState("new public trails", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.resourcePlacementVersion != resourcePlacementTrails || !reflect.DeepEqual(loaded.State().Resources, before) {
		t.Fatal("new adventure resource sites changed on load")
	}
}
