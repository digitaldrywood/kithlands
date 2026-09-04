package api

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/dungeon"
)

func enterTestDungeon(t *testing.T, g *Game) GameState {
	t.Helper()
	s, err := g.ProcessDungeon(DungeonRequest{Type: "enter"})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// Walk through real cardinal server inputs, including collision checks.
func walkDungeonTo(t *testing.T, g *Game, goal dungeon.Point) {
	t.Helper()
	r := g.dungeonDefinition().Room(g.dungeon.RoomID)
	start := g.dungeon.Position
	prev := map[dungeon.Point]dungeon.Point{start: start}
	queue := []dungeon.Point{start}
	dirs := []dungeon.Point{{X: 1}, {X: -1}, {Y: 1}, {Y: -1}}
	for len(queue) > 0 {
		p := queue[0]
		queue = queue[1:]
		if p == goal {
			break
		}
		for _, d := range dirs {
			n := dungeon.Point{X: p.X + d.X, Y: p.Y + d.Y}
			if _, ok := prev[n]; !ok && r.Walkable(n) {
				prev[n] = p
				queue = append(queue, n)
			}
		}
	}
	if _, ok := prev[goal]; !ok {
		t.Fatalf("no walkable route in %s from %+v to %+v", r.ID, start, goal)
	}
	var path []dungeon.Point
	for p := goal; p != start; p = prev[p] {
		path = append(path, p)
	}
	for i := len(path) - 1; i >= 0; i-- {
		p := path[i]
		cur := g.dungeon.Position
		if _, err := g.ProcessDungeon(DungeonRequest{Type: "move", DX: p.X - cur.X, DY: p.Y - cur.Y}); err != nil {
			t.Fatal(err)
		}
	}
}
func useDungeonAction(t *testing.T, g *Game, id string) GameState {
	t.Helper()
	r := g.dungeonDefinition().Room(g.dungeon.RoomID)
	a := r.Action(id)
	if a == nil {
		t.Fatalf("missing action %s in %s", id, r.ID)
	}
	walkDungeonTo(t, g, a.Position)
	s, err := g.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: id})
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func TestDungeonEntranceRoomExitAndSave(t *testing.T) {
	g := newTownTestGame(t)
	original := g.State()
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: "ledger"}); err == nil {
		t.Fatal("remote interaction accepted")
	}
	enterTestDungeon(t, g)
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: "mill-door"}); err == nil {
		t.Fatal("remote door accepted")
	}
	for _, req := range []DungeonRequest{{Type: "move", DX: 10}, {Type: "move", DX: 1, DY: 1}, {Type: "interact", ActionID: "ledger"}, {Type: "enter"}} {
		if _, err := g.ProcessDungeon(req); err == nil {
			t.Fatalf("forged input accepted: %+v", req)
		}
	}
	useDungeonAction(t, g, "mill-door")
	useDungeonAction(t, g, "ledger")
	before := g.State()
	ss, err := g.ToSaveState("Mill checkpoint", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if got := loaded.State(); !reflect.DeepEqual(got.Dungeon, before.Dungeon) || got.CurrentLocation.Kind != LocationDungeon {
		t.Fatalf("checkpoint not restored: %+v", got.Dungeon)
	}
	if _, err := loaded.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: "ledger"}); err == nil {
		t.Fatal("reloaded flag replay accepted")
	}
	useDungeonAction(t, loaded, "receiving-exit")
	useDungeonAction(t, loaded, "trail-home")
	if loaded.inDungeon() || loaded.State().CurrentLocation.Kind != LocationWorld {
		t.Fatal("failed to leave dungeon")
	}
	if loaded.State().Gold != original.Gold {
		t.Fatal("unearned completion payoff")
	}
	enterTestDungeon(t, loaded)
	if !loaded.dungeon.Flags["ledger-read"] {
		t.Fatal("reentry lost progress")
	}
}
func TestDungeonStateDoesNotExposeMutableFlags(t *testing.T) {
	g := newTownTestGame(t)
	enterTestDungeon(t, g)
	s := g.State()
	s.Dungeon.Visited[0] = "forged"
	if g.dungeon.Visited[0] == "forged" {
		t.Fatal("visited aliases state")
	}
}
func TestDungeonLegacySaveAndInvalidCheckpoint(t *testing.T) {
	g := newTownTestGame(t)
	ss, err := g.ToSaveState("old", "test")
	if err != nil {
		t.Fatal(err)
	}
	var world map[string]json.RawMessage
	if err := json.Unmarshal(ss.WorldState, &world); err != nil {
		t.Fatal(err)
	}
	delete(world, "dungeon")
	ss.WorldState, err = json.Marshal(world)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.inDungeon() || loaded.State().CurrentLocation.Kind != LocationWorld {
		t.Fatal("legacy save changed location")
	}
	enterTestDungeon(t, g)
	g.dungeon.Position = dungeon.Point{X: 999, Y: 999}
	ss, err = g.ToSaveState("bad position", "test")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err = FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.dungeon.Position != loaded.dungeonDefinition().EntryPosition {
		t.Fatal("invalid checkpoint not recovered")
	}
}
func TestDungeonRejectsOtherWorldRewards(t *testing.T) {
	g := newTownTestGame(t)
	enterTestDungeon(t, g)
	for _, kind := range []string{"encounter", "quest_advance", "advance"} {
		if _, err := g.ProcessAction(GameActionRequest{Type: kind}); err == nil {
			t.Fatalf("dungeon accepted %s", kind)
		}
	}
	if _, err := g.restAtTown([]string{"rest"}); err == nil {
		t.Fatal("remote rest accepted")
	}
	if _, err := g.collectHiddenItem("forged", []string{"shop"}); err == nil {
		t.Fatal("remote reward accepted")
	}
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-settlement"}); err == nil {
		t.Fatal("forged location transition accepted")
	}
}
