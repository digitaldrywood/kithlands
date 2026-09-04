package api

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
	savepkg "github.com/digitaldrywood/kithlands/internal/save"
)

func TestNewGameStartsWithServerWorldCheckpoint(t *testing.T) {
	game := newTownTestGame(t)
	state := game.State()
	checkpoint := state.WorldCheckpoint
	if checkpoint == nil {
		t.Fatal("new game has no world checkpoint")
	}
	if checkpoint.WorldNodeID != state.CurrentLocation.WorldNodeID {
		t.Fatalf("checkpoint node = %q, location node = %q", checkpoint.WorldNodeID, state.CurrentLocation.WorldNodeID)
	}
	if checkpoint.MapSignature == "" || checkpoint.MapSignature != worldMapSignature(state.TileMap) {
		t.Fatalf("checkpoint signature = %q, want server map signature", checkpoint.MapSignature)
	}
	if checkpoint.X != state.TileMap.PlayerX || checkpoint.Y != state.TileMap.PlayerY {
		t.Fatalf("checkpoint tile = (%d,%d), generated spawn = (%d,%d)", checkpoint.X, checkpoint.Y, state.TileMap.PlayerX, state.TileMap.PlayerY)
	}
	position := WorldPosition{X: checkpoint.X, Y: checkpoint.Y}
	if err := validateWorldCheckpointPosition(game.tileMap, game.loc, game.worldTraversal(), position, checkpoint.WorldNodeID); err != nil {
		t.Fatalf("new checkpoint is invalid: %v", err)
	}

	checkpoint.X++
	if game.State().WorldCheckpoint.X == checkpoint.X {
		t.Fatal("state response aliases the live checkpoint")
	}
}

func TestWorldCheckpointExactSaveRestore(t *testing.T) {
	game := newTownTestGame(t)
	initial := game.State().WorldCheckpoint
	position := findWorldCheckpointPosition(t, game, initial.WorldNodeID, func(position WorldPosition, _ locality.TileType) bool {
		return position.X != initial.X || position.Y != initial.Y
	})

	saved, err := game.ToSaveStateWithWorldPosition("exact", "test-user", &position)
	if err != nil {
		t.Fatalf("save exact position: %v", err)
	}
	var world struct {
		Checkpoint *WorldCheckpoint `json:"world_checkpoint"`
	}
	if err := json.Unmarshal(saved.WorldState, &world); err != nil {
		t.Fatalf("unmarshal world state: %v", err)
	}
	want := &WorldCheckpoint{
		X:            position.X,
		Y:            position.Y,
		WorldNodeID:  initial.WorldNodeID,
		MapSignature: worldMapSignature(game.tileMap),
	}
	if !reflect.DeepEqual(world.Checkpoint, want) {
		t.Fatalf("saved checkpoint = %+v, want %+v", world.Checkpoint, want)
	}

	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatalf("load exact position: %v", err)
	}
	if got := loaded.State().WorldCheckpoint; !reflect.DeepEqual(got, want) {
		t.Fatalf("loaded checkpoint = %+v, want %+v", got, want)
	}
	if got := loaded.State().CurrentLocation.WorldNodeID; got != want.WorldNodeID {
		t.Fatalf("loaded location node = %q, want %q", got, want.WorldNodeID)
	}
}

func TestWorldCheckpointRejectsInvalidUpdates(t *testing.T) {
	game := newTownTestGame(t)
	initial := cloneWorldCheckpoint(game.worldCheckpoint)
	unwalkable := findWorldTile(t, game.tileMap, func(_ WorldPosition, tile locality.TileType) bool {
		return !worldTileTraversable(tile, game.worldTraversal())
	})
	otherNode := ""
	var otherNodePosition WorldPosition
	for _, spawn := range game.tileMap.Spawns {
		if spawn.NodeID == game.location.WorldNodeID {
			continue
		}
		recovered := recoverWorldCheckpointNearNode(game.tileMap, game.loc, game.worldTraversal(), spawn.NodeID, worldMapSignature(game.tileMap))
		if recovered != nil {
			otherNode = spawn.NodeID
			otherNodePosition = WorldPosition{X: recovered.X, Y: recovered.Y}
			break
		}
	}
	if otherNode == "" {
		t.Fatal("fixture has no second recoverable node")
	}

	tests := []struct {
		name     string
		position WorldPosition
	}{
		{name: "negative x", position: WorldPosition{X: -1, Y: initial.Y}},
		{name: "past map height", position: WorldPosition{X: initial.X, Y: game.tileMap.Height}},
		{name: "blocked terrain", position: unwalkable},
		{name: "near another node", position: otherNodePosition},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := game.ToSaveStateWithWorldPosition("invalid", "test-user", &test.position)
			if !errors.Is(err, ErrInvalidWorldCheckpoint) {
				t.Fatalf("error = %v, want ErrInvalidWorldCheckpoint", err)
			}
			if !reflect.DeepEqual(game.worldCheckpoint, initial) {
				t.Fatalf("invalid update mutated checkpoint to %+v", game.worldCheckpoint)
			}
		})
	}
}

func TestWorldCheckpointUsesCurrentTransport(t *testing.T) {
	game := newTownTestGame(t)
	water := findWorldTile(t, game.tileMap, func(position WorldPosition, tile locality.TileType) bool {
		return (tile == locality.TileWater || tile == locality.TileLake || tile == locality.TileRiver) &&
			nearestWorldSpawn(game.tileMap, position, 3) == nil
	})
	if _, err := game.ToSaveStateWithWorldPosition("foot", "test-user", &water); !errors.Is(err, ErrInvalidWorldCheckpoint) {
		t.Fatalf("foot save on water error = %v, want ErrInvalidWorldCheckpoint", err)
	}

	game.trans.CurrentTier = "T3"
	game.trans.Unlocked["T3"] = true
	if _, err := game.ToSaveStateWithWorldPosition("boat", "test-user", &water); err != nil {
		t.Fatalf("boat save on water: %v", err)
	}
	if got := game.State().WorldCheckpoint; got.X != water.X || got.Y != water.Y {
		t.Fatalf("boat checkpoint = %+v, want %+v", got, water)
	}
}

func TestWorldCheckpointSurvivesInnAutosave(t *testing.T) {
	game := newTownTestGame(t)
	checkpoint := cloneWorldCheckpoint(game.worldCheckpoint)
	entryNodeID := game.State().SettlementEntryNodeID
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-settlement", WorldNodeID: entryNodeID}); err != nil {
		t.Fatalf("enter settlement: %v", err)
	}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "inn-door"}); err != nil {
		t.Fatalf("enter inn: %v", err)
	}

	saved, err := game.ToSaveState("inn autosave", "test-user")
	if err != nil {
		t.Fatalf("save from inn: %v", err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatalf("load inn autosave: %v", err)
	}
	if got := loaded.State().WorldCheckpoint; !reflect.DeepEqual(got, checkpoint) {
		t.Fatalf("loaded checkpoint = %+v, want %+v", got, checkpoint)
	}
}

func TestWorldCheckpointLoadRecovery(t *testing.T) {
	base := newTownTestGame(t)
	saved, err := base.ToSaveState("recovery", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	remoteNodeID := ""
	for _, spawn := range base.tileMap.Spawns {
		if spawn.NodeID != base.walk.Spawn.ID {
			remoteNodeID = spawn.NodeID
			break
		}
	}
	if remoteNodeID == "" {
		t.Fatal("fixture has no remote node")
	}
	remoteCheckpoint := recoverWorldCheckpointNearNode(base.tileMap, base.loc, base.worldTraversal(), remoteNodeID, worldMapSignature(base.tileMap))
	if remoteCheckpoint == nil {
		t.Fatal("fixture remote node has no recoverable checkpoint")
	}

	tests := []struct {
		name           string
		raw            string
		wantNodeID     string
		wantCurrentSig bool
	}{
		{name: "legacy missing", raw: "", wantNodeID: base.walk.Spawn.ID, wantCurrentSig: true},
		{name: "malformed", raw: `"not-an-object"`, wantNodeID: base.walk.Spawn.ID, wantCurrentSig: true},
		{name: "malformed coordinate", raw: `{"x":"bad","y":4,"world_node_id":"central","map_signature":"stale"}`, wantNodeID: base.walk.Spawn.ID, wantCurrentSig: true},
		{name: "unknown node", raw: `{"x":4,"y":4,"world_node_id":"missing","map_signature":"stale"}`, wantNodeID: base.walk.Spawn.ID, wantCurrentSig: true},
		{name: "coordinate belongs to another node", raw: checkpointJSON(t, WorldCheckpoint{X: remoteCheckpoint.X, Y: remoteCheckpoint.Y, WorldNodeID: base.walk.Spawn.ID, MapSignature: worldMapSignature(base.tileMap)}), wantNodeID: base.walk.Spawn.ID, wantCurrentSig: true},
		{name: "stale map near valid node", raw: checkpointJSON(t, WorldCheckpoint{X: -10, Y: -10, WorldNodeID: remoteNodeID, MapSignature: "stale"}), wantNodeID: remoteNodeID, wantCurrentSig: true},
		{name: "invalid exact tile", raw: checkpointJSON(t, WorldCheckpoint{X: -10, Y: -10, WorldNodeID: remoteNodeID, MapSignature: worldMapSignature(base.tileMap)}), wantNodeID: remoteNodeID, wantCurrentSig: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := copySaveWithCheckpoint(t, saved, test.raw)
			loaded, err := FromSaveState(candidate, base.gd, base.loc)
			if err != nil {
				t.Fatalf("load: %v", err)
			}
			got := loaded.State().WorldCheckpoint
			if got == nil || got.WorldNodeID != test.wantNodeID {
				t.Fatalf("checkpoint = %+v, want node %q", got, test.wantNodeID)
			}
			if test.wantCurrentSig && got.MapSignature != worldMapSignature(loaded.tileMap) {
				t.Fatalf("signature = %q, want current map", got.MapSignature)
			}
			if err := validateWorldCheckpointPosition(loaded.tileMap, loaded.loc, loaded.worldTraversal(), WorldPosition{X: got.X, Y: got.Y}, got.WorldNodeID); err != nil {
				t.Fatalf("recovered checkpoint invalid: %v", err)
			}
			if loaded.State().CurrentLocation.WorldNodeID != test.wantNodeID {
				t.Fatalf("current location = %+v", loaded.State().CurrentLocation)
			}
		})
	}
}

func TestWorldMapSignatureTracksMapContent(t *testing.T) {
	game := newTownTestGame(t)
	original := worldMapSignature(game.tileMap)
	if original == "" || original != worldMapSignature(game.tileMap) {
		t.Fatal("map signature is empty or unstable")
	}
	clone := *game.tileMap
	clone.Tiles = make([][]int, len(game.tileMap.Tiles))
	for y := range game.tileMap.Tiles {
		clone.Tiles[y] = append([]int(nil), game.tileMap.Tiles[y]...)
	}
	clone.Tiles[clone.PlayerY][clone.PlayerX] = int(locality.TileRock)
	if got := worldMapSignature(&clone); got == original {
		t.Fatal("map content change did not change signature")
	}
}

func findWorldCheckpointPosition(t *testing.T, game *Game, nodeID string, match func(WorldPosition, locality.TileType) bool) WorldPosition {
	t.Helper()
	return findWorldTile(t, game.tileMap, func(position WorldPosition, tile locality.TileType) bool {
		return match(position, tile) && validateWorldCheckpointPosition(game.tileMap, game.loc, game.worldTraversal(), position, nodeID) == nil
	})
}

func findWorldTile(t *testing.T, tileMap *locality.TileMap, match func(WorldPosition, locality.TileType) bool) WorldPosition {
	t.Helper()
	for y, row := range tileMap.Tiles {
		for x, value := range row {
			position := WorldPosition{X: x, Y: y}
			if match(position, locality.TileType(value)) {
				return position
			}
		}
	}
	t.Fatal("fixture has no matching world tile")
	return WorldPosition{}
}

func checkpointJSON(t *testing.T, checkpoint WorldCheckpoint) string {
	t.Helper()
	raw, err := json.Marshal(checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func copySaveWithCheckpoint(t *testing.T, saved *savepkg.SaveState, raw string) *savepkg.SaveState {
	t.Helper()
	clone := *saved
	var world map[string]json.RawMessage
	if err := json.Unmarshal(saved.WorldState, &world); err != nil {
		t.Fatalf("unmarshal saved world state: %v", err)
	}
	if raw == "" {
		delete(world, "world_checkpoint")
	} else {
		world["world_checkpoint"] = json.RawMessage(raw)
	}
	encoded, err := json.Marshal(world)
	if err != nil {
		t.Fatalf("marshal saved world state: %v", err)
	}
	clone.WorldState = encoded
	return &clone
}
