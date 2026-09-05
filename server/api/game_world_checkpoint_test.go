package api

import (
	"encoding/json"
	"errors"
	"math/rand/v2"
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

func TestWorldArrivalUpdatesExactCheckpointAtomically(t *testing.T) {
	game := newTownTestGame(t)
	start := game.State().CurrentLocation.WorldNodeID
	neighbors := game.loc.Neighbors(start)
	if len(neighbors) == 0 {
		t.Fatal("fixture has no adjacent world node")
	}
	target := neighbors[0]
	position := findWorldArrivalPosition(t, game, target, nil)
	initial := cloneWorldCheckpoint(game.worldCheckpoint)

	invalid := WorldPosition{X: -1, Y: position.Y}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID:  "arrive-world-node",
		WorldNodeID:   target,
		WorldPosition: &invalid,
	}); !errors.Is(err, ErrInvalidWorldCheckpoint) {
		t.Fatalf("invalid arrival error = %v, want ErrInvalidWorldCheckpoint", err)
	}
	if game.location.WorldNodeID != start || !reflect.DeepEqual(game.worldCheckpoint, initial) {
		t.Fatalf("invalid arrival mutated state: location=%+v checkpoint=%+v", game.location, game.worldCheckpoint)
	}

	state, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID:  "arrive-world-node",
		WorldNodeID:   target,
		WorldPosition: &position,
	})
	if err != nil {
		t.Fatalf("exact adjacent arrival: %v", err)
	}
	if state.CurrentLocation.WorldNodeID != target || state.WorldCheckpoint.X != position.X || state.WorldCheckpoint.Y != position.Y || state.WorldCheckpoint.WorldNodeID != target {
		t.Fatalf("exact arrival state = location %+v checkpoint %+v", state.CurrentLocation, state.WorldCheckpoint)
	}

	ordinary := findWorldCheckpointPosition(t, game, target, func(candidate WorldPosition, _ locality.TileType) bool {
		return candidate != position
	})
	state, err = game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID:  "arrive-world-node",
		WorldNodeID:   target,
		WorldPosition: &ordinary,
	})
	if err != nil {
		t.Fatalf("same-node exact checkpoint: %v", err)
	}
	if state.WorldCheckpoint.X != ordinary.X || state.WorldCheckpoint.Y != ordinary.Y {
		t.Fatalf("ordinary checkpoint = %+v, want %+v", state.WorldCheckpoint, ordinary)
	}
}

func TestWorldCheckpointSettlementEntryAndInnSave(t *testing.T) {
	game := newTownTestGame(t)
	nodeID := game.State().SettlementEntryNodeID
	position := findWorldArrivalPosition(t, game, nodeID, func(candidate WorldPosition, _ locality.TileType) bool {
		return candidate.X != game.tileMap.PlayerX || candidate.Y != game.tileMap.PlayerY
	})
	state, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID:  "enter-settlement",
		WorldNodeID:   nodeID,
		WorldPosition: &position,
	})
	if err != nil {
		t.Fatalf("enter settlement with checkpoint: %v", err)
	}
	want := cloneWorldCheckpoint(state.WorldCheckpoint)
	if want.X != position.X || want.Y != position.Y || state.CurrentLocation.Kind != LocationSettlement {
		t.Fatalf("settlement entry = location %+v checkpoint %+v", state.CurrentLocation, want)
	}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "inn-door"}); err != nil {
		t.Fatalf("enter inn: %v", err)
	}
	saved, err := game.ToSaveState("inn", "test-user")
	if err != nil {
		t.Fatalf("inn save: %v", err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatalf("load inn save: %v", err)
	}
	if got := loaded.State().WorldCheckpoint; !reflect.DeepEqual(got, want) {
		t.Fatalf("loaded inn checkpoint = %+v, want %+v", got, want)
	}
}

func TestWorldCheckpointSurvivesBattleReturn(t *testing.T) {
	game := newTownTestGame(t)
	nodeID := game.location.WorldNodeID
	position := findWorldCheckpointPosition(t, game, nodeID, func(candidate WorldPosition, _ locality.TileType) bool {
		return candidate.X != game.tileMap.PlayerX || candidate.Y != game.tileMap.PlayerY
	})
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "arrive-world-node", WorldNodeID: nodeID, WorldPosition: &position}); err != nil {
		t.Fatalf("checkpoint before battle: %v", err)
	}
	want := cloneWorldCheckpoint(game.worldCheckpoint)
	if err := game.spawnScriptedBoss("slime"); err != nil {
		t.Fatalf("start battle: %v", err)
	}
	game.enemies[0].STR = 0
	game.rng = rand.New(rand.NewPCG(1, 0))
	for attempt := 0; attempt < 100 && game.phase == "combat"; attempt++ {
		if _, err := game.ProcessAction(GameActionRequest{Type: "flee"}); err != nil {
			t.Fatalf("flee battle: %v", err)
		}
	}
	if game.phase != "world" {
		t.Fatal("battle fixture did not return to the world")
	}
	if got := game.State().WorldCheckpoint; !reflect.DeepEqual(got, want) {
		t.Fatalf("battle return checkpoint = %+v, want %+v", got, want)
	}
}

func TestRemoteDungeonSaveRestoreExitAndMoveKeepsWorldCheckpoint(t *testing.T) {
	game := newTownTestGame(t)
	entry := dungeonEntryByID(t, game, "forgotten-shrine")
	arriveAtWorldNode(t, game, entry.NodeID)
	position := findWorldArrivalPosition(t, game, entry.NodeID, nil)
	state, err := game.ProcessDungeon(DungeonRequest{Type: "enter", NodeID: entry.NodeID, WorldPosition: &position})
	if err != nil {
		t.Fatalf("enter remote dungeon: %v", err)
	}
	want := cloneWorldCheckpoint(state.WorldCheckpoint)
	if state.CurrentLocation.Kind != LocationDungeon || want.X != position.X || want.Y != position.Y {
		t.Fatalf("remote dungeon entry = location %+v checkpoint %+v", state.CurrentLocation, want)
	}
	saved, err := game.ToSaveState("forgotten shrine", "test-user")
	if err != nil {
		t.Fatalf("save remote dungeon: %v", err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatalf("load remote dungeon: %v", err)
	}
	if loaded.State().CurrentLocation.Kind != LocationDungeon || !reflect.DeepEqual(loaded.State().WorldCheckpoint, want) {
		t.Fatalf("loaded remote dungeon = location %+v checkpoint %+v", loaded.State().CurrentLocation, loaded.State().WorldCheckpoint)
	}
	state, err = loaded.ProcessDungeon(DungeonRequest{Type: "retreat"})
	if err != nil {
		t.Fatalf("exit loaded remote dungeon: %v", err)
	}
	if state.CurrentLocation.Kind != LocationWorld || !reflect.DeepEqual(state.WorldCheckpoint, want) {
		t.Fatalf("remote dungeon exit = location %+v checkpoint %+v", state.CurrentLocation, state.WorldCheckpoint)
	}
	next := findWorldCheckpointPosition(t, loaded, entry.NodeID, func(candidate WorldPosition, _ locality.TileType) bool {
		return candidate.X != want.X || candidate.Y != want.Y
	})
	state, err = loaded.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "arrive-world-node", WorldNodeID: entry.NodeID, WorldPosition: &next})
	if err != nil {
		t.Fatalf("move after loaded dungeon exit: %v", err)
	}
	if state.WorldCheckpoint.X != next.X || state.WorldCheckpoint.Y != next.Y {
		t.Fatalf("post-exit checkpoint = %+v, want %+v", state.WorldCheckpoint, next)
	}
}

func TestRemoteDungeonRecoveryKeepsOriginAlignedWithWorldCheckpoint(t *testing.T) {
	game := newTownTestGame(t)
	entry := dungeonEntryByID(t, game, "forgotten-shrine")
	arriveAtWorldNode(t, game, entry.NodeID)
	position := findWorldArrivalPosition(t, game, entry.NodeID, nil)
	if _, err := game.ProcessDungeon(DungeonRequest{Type: "enter", NodeID: entry.NodeID, WorldPosition: &position}); err != nil {
		t.Fatalf("enter remote dungeon: %v", err)
	}
	saved, err := game.ToSaveState("forgotten shrine recovery", "test-user")
	if err != nil {
		t.Fatalf("save remote dungeon: %v", err)
	}

	tests := []struct {
		name       string
		raw        string
		origin     *LocationState
		wantNodeID string
	}{
		{name: "legacy missing checkpoint", raw: "", wantNodeID: entry.NodeID},
		{name: "malformed checkpoint", raw: `"not-an-object"`, wantNodeID: entry.NodeID},
		{name: "stale unknown checkpoint", raw: checkpointJSON(t, WorldCheckpoint{X: -10, Y: -10, WorldNodeID: "missing", MapSignature: "stale"}), wantNodeID: entry.NodeID},
		{name: "invalid dungeon origin", raw: "", origin: &LocationState{Kind: LocationWorld, WorldNodeID: "missing"}, wantNodeID: entry.NodeID},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := copySaveWithCheckpoint(t, saved, test.raw)
			if test.origin != nil {
				candidate = copySaveWithDungeonOrigin(t, candidate, "forgotten-shrine", *test.origin)
			}
			loaded, err := FromSaveState(candidate, game.gd, game.loc)
			if err != nil {
				t.Fatalf("load remote dungeon: %v", err)
			}
			checkpoint := cloneWorldCheckpoint(loaded.State().WorldCheckpoint)
			if checkpoint == nil || checkpoint.WorldNodeID != test.wantNodeID {
				t.Fatalf("recovered checkpoint = %+v, want node %q", checkpoint, test.wantNodeID)
			}
			if loaded.State().CurrentLocation.Kind != LocationDungeon || loaded.State().CurrentLocation.WorldNodeID != checkpoint.WorldNodeID {
				t.Fatalf("loaded location = %+v, checkpoint = %+v", loaded.State().CurrentLocation, checkpoint)
			}
			if loaded.dungeon.Origin.Kind != LocationWorld || loaded.dungeon.Origin.WorldNodeID != checkpoint.WorldNodeID {
				t.Fatalf("reconciled origin = %+v, checkpoint = %+v", loaded.dungeon.Origin, checkpoint)
			}

			state, err := loaded.ProcessDungeon(DungeonRequest{Type: "retreat"})
			if err != nil {
				t.Fatalf("retreat recovered dungeon: %v", err)
			}
			if state.CurrentLocation.Kind != LocationWorld || state.CurrentLocation.WorldNodeID != checkpoint.WorldNodeID || !reflect.DeepEqual(state.WorldCheckpoint, checkpoint) {
				t.Fatalf("retreat state = location %+v checkpoint %+v, want %+v", state.CurrentLocation, state.WorldCheckpoint, checkpoint)
			}
		})
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

func findWorldArrivalPosition(t *testing.T, game *Game, nodeID string, match func(WorldPosition, locality.TileType) bool) WorldPosition {
	t.Helper()
	return findWorldTile(t, game.tileMap, func(position WorldPosition, tile locality.TileType) bool {
		return (match == nil || match(position, tile)) && validateWorldArrivalPosition(game.tileMap, game.loc, game.worldTraversal(), position, nodeID) == nil
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

func copySaveWithDungeonOrigin(t *testing.T, saved *savepkg.SaveState, dungeonID string, origin LocationState) *savepkg.SaveState {
	t.Helper()
	clone := *saved
	var world map[string]json.RawMessage
	if err := json.Unmarshal(saved.WorldState, &world); err != nil {
		t.Fatalf("unmarshal saved world state: %v", err)
	}
	var dungeons map[string]*DungeonProgress
	if err := json.Unmarshal(world["dungeons"], &dungeons); err != nil {
		t.Fatalf("unmarshal saved dungeons: %v", err)
	}
	progress := dungeons[dungeonID]
	if progress == nil {
		t.Fatalf("saved dungeon %q is missing", dungeonID)
	}
	progress.Origin = origin
	dungeonsJSON, err := json.Marshal(dungeons)
	if err != nil {
		t.Fatalf("marshal saved dungeons: %v", err)
	}
	world["dungeons"] = dungeonsJSON
	encoded, err := json.Marshal(world)
	if err != nil {
		t.Fatalf("marshal saved world state: %v", err)
	}
	clone.WorldState = encoded
	return &clone
}

func TestWorldCheckpointAcceptsLandmarkGround(t *testing.T) {
	game := newTownTestGame(t)
	checked := 0
	for y, row := range game.tileMap.Tiles {
		for x, tile := range row {
			if locality.TileType(tile) != locality.TileBuilding {
				continue
			}
			position := WorldPosition{X: x, Y: y}
			spawn := nearestWorldSpawn(game.tileMap, position, 3)
			if spawn == nil {
				continue
			}
			checked++
			if err := validateWorldCheckpointPosition(game.tileMap, game.loc, worldTraversal{}, position, spawn.NodeID); err != nil {
				t.Errorf("landmark ground at (%d,%d) rejects a walking checkpoint: %v", x, y, err)
			}
		}
	}
	if checked == 0 {
		t.Fatal("fixture has no legacy building footprints near landmarks")
	}
}
