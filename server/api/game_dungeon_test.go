package api

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/dungeon"
)

func enterTestDungeon(t *testing.T, g *Game) GameState {
	t.Helper()
	s, err := g.ProcessDungeon(DungeonRequest{Type: "enter", NodeID: g.State().DungeonEntry.NodeID})
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
	useDungeonAction(t, g, "trail-bats")
	finishDungeonFixtureFight(t, g)
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
	if loaded.State().Gold != before.Gold {
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

// Deliberately forced victory fixture: proves flags/loot/navigation and save
// isolation, not combat balance or play duration. The seeded route simulation
// below exercises real combat separately.
func finishDungeonFixtureFight(t *testing.T, g *Game) {
	t.Helper()
	if g.phase != "combat" {
		t.Fatal("expected encounter")
	}
	for _, e := range g.enemies {
		e.CurrentHP = 0
	}
	if _, err := g.ProcessAction(GameActionRequest{Type: "attack"}); err != nil {
		t.Fatal(err)
	}
	if _, err := g.ProcessAction(GameActionRequest{Type: "advance"}); err != nil {
		t.Fatal(err)
	}
}

var completeMillRoute = []string{
	"trail-bats", "mill-door", "ledger", "grain-door", "grain-spider", "spare-handle", "grain-loft", "loft-beetle", "loft-grain", "grain-return",
	"drying-door", "drying-beetle", "supply-potions", "supply-ethers", "drying-wheel", "wheel-slime", "wheel-handle", "wheel-gallery", "gallery-bats", "sluice-lever", "gallery-roots", "root-spider", "roots-tailrace", "tailrace-bar", "tailrace-workshop", "workshop-rest", "maintenance-shortcut", "tailrace-trail", "heron-trail", "heron-secret", "heron-cache", "pool-return", "trail-shortcut", "tailrace-roots", "roots-gallery", "gallery-loft", "loft-secret", "loft-gallery", "gallery-roots", "roots-heart", "warden", "miller-keepsake", "heart-return", "roots-tailrace", "tailrace-trail", "trail-home",
}

func TestDungeonFullRouteSaveShortcutAndRepeatSafety(t *testing.T) {
	g := newTownTestGame(t)
	enterTestDungeon(t, g)
	for _, id := range completeMillRoute {
		before := g.State()
		s := useDungeonAction(t, g, id)
		if s.Phase == "combat" {
			if _, err := g.ToSaveState("midcombat", "test"); err == nil {
				t.Fatal("combat checkpoint accepted")
			}
			if _, err := g.ProcessDungeon(DungeonRequest{Type: "retreat"}); err == nil {
				t.Fatal("combat retreat bypass accepted")
			}
			finishDungeonFixtureFight(t, g)
		}
		if id == "wheel-handle" || id == "tailrace-bar" || id == "miller-keepsake" {
			ss, err := g.ToSaveState("midmill", "test")
			if err != nil {
				t.Fatal(err)
			}
			restored, err := FromSaveState(ss, g.gd, g.loc)
			if err != nil {
				t.Fatal(err)
			}
			g = restored
			if _, err := g.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: id}); err == nil {
				t.Fatalf("save replay accepted %s", id)
			}
		}
		if id == "trail-home" {
			returned := g.State()
			if returned.Gold != before.Gold+80 {
				t.Fatal("return payoff missing")
			}
			if len(returned.CombatLog) != 0 || !strings.Contains(returned.Message, "80 gold") {
				t.Fatal("return payoff obscured by stale battle results")
			}
		}
	}
	if !g.dungeon.PayoffClaimed || len(g.dungeon.Visited) != 12 {
		t.Fatalf("incomplete expedition: %+v", g.dungeon)
	}
	if g.inv.Gems["ward_gem"] != 1 || g.inv.Gems["ember_gem"] != 1 {
		t.Fatalf("missing gem rewards: %+v", g.inv.Gems)
	}
	gold := g.inv.Gold
	enterTestDungeon(t, g)
	for _, id := range []string{"trail-shortcut", "tailrace-roots", "roots-heart"} {
		useDungeonAction(t, g, id)
	}
	for _, id := range []string{"warden", "miller-keepsake"} {
		a := g.dungeonDefinition().Room(g.dungeon.RoomID).Action(id)
		walkDungeonTo(t, g, a.Position)
		if _, err := g.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: id}); err == nil {
			t.Fatalf("reentry replay accepted %s", id)
		}
	}
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "retreat"}); err != nil {
		t.Fatal(err)
	}
	if g.inv.Gold != gold || g.inv.Gems["ember_gem"] != 1 {
		t.Fatal("repeat entry duplicated rewards")
	}
}

func TestDungeonDefeatAndFleeKeepEncounterUncleared(t *testing.T) {
	g := newTownTestGame(t)
	enterTestDungeon(t, g)
	useDungeonAction(t, g, "trail-bats")
	for _, c := range g.party {
		c.CurrentHP = 0
	}
	state, err := g.ProcessAction(GameActionRequest{Type: "attack"})
	if err != nil {
		t.Fatal(err)
	}
	if state.Phase != "world" || g.dungeon.RoomID != g.dungeonDefinition().EntryRoom || g.dungeon.Flags["trail-bats-cleared"] {
		t.Fatal("defeat did not restore safe uncleared entry")
	}
	for _, c := range g.party {
		if !c.IsAlive() {
			t.Fatal("defeat recovery left dead party")
		}
	}
	useDungeonAction(t, g, "trail-bats")
	for i := 0; i < 100 && g.phase == "combat"; i++ {
		// Keep failure attempts harmless while exercising the real flee branch.
		for _, e := range g.enemies {
			e.STR = 0
		}
		if _, err := g.ProcessAction(GameActionRequest{Type: "flee"}); err != nil {
			t.Fatal(err)
		}
	}
	if g.phase == "combat" || g.dungeon.Flags["trail-bats-cleared"] || g.dungeon.EncounterID != "" {
		t.Fatal("flee incorrectly clears encounter")
	}
}

func dungeonCombatActions(s GameState) []MemberActionReq {
	target := s.Enemies[0].ID
	potions, ethers := s.Potions, s.Ethers
	var actions []MemberActionReq
	for i, p := range s.Party {
		if p.HP <= 0 {
			continue
		}
		a := MemberActionReq{Slot: i, Type: "attack", TargetID: target}
		lowest := i
		for j, other := range s.Party {
			if other.HP > 0 && other.HP*s.Party[lowest].MaxHP < s.Party[lowest].HP*other.MaxHP {
				lowest = j
			}
		}
		if s.Party[lowest].HP*3 < s.Party[lowest].MaxHP && potions > 0 {
			a.Type = "item"
			a.ItemID = "potion"
			a.TargetID = lowest
			potions--
		} else if p.ClassID == "cinder" && p.MP < 3 && ethers > 0 {
			a.Type = "item"
			a.ItemID = "ether"
			a.TargetID = i
			ethers--
		} else {
			for _, spell := range p.Spells {
				if spell.ID == "spark" && spell.Castable && spell.MPCost <= p.MP {
					a.Type = "spell"
					a.SpellID = spell.ID
					break
				}
			}
		}
		actions = append(actions, a)
	}
	return actions
}
func TestDungeonAuthoredRouteWithRealCombat(t *testing.T) {
	gd := newTownTestGame(t).gd
	for _, size := range []int{2, 4} {
		t.Run(fmt.Sprintf("party_%d", size), func(t *testing.T) {
			rounds, wins := 0, 0
			for seed := 1; seed <= 10; seed++ {
				party := []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}}
				if size == 4 {
					party = append(party, PartyMemberReq{Name: "Mercy", ClassID: "mender"}, PartyMemberReq{Name: "Shade", ClassID: "rogue"})
				}
				g, err := NewGameManager(gd, "").CreateGame(NewGameRequest{TownName: "Willow Creek", Places: []string{"Mill", "Inn"}, BigBuilding: "Hall", Party: party, Difficulty: "normal", RNGSeed: int64(seed)})
				if err != nil {
					t.Fatal(err)
				}
				enterTestDungeon(t, g)
				failed := false
				for _, id := range completeMillRoute {
					s := useDungeonAction(t, g, id)
					if s.Phase != "combat" {
						continue
					}
					for round := 0; round < 60 && g.phase == "combat"; round++ {
						next, err := g.ProcessAction(GameActionRequest{Type: "attack", Actions: dungeonCombatActions(s)})
						if err != nil {
							t.Fatal(err)
						}
						s = *next
						rounds++
					}
					if g.phase == "combat" {
						t.Fatal("battle exceeded round limit")
					}
					if g.dungeon.RoomID == gd.Dungeons[0].EntryRoom && !g.dungeon.Flags["trail-bats-cleared"] || g.message == g.dungeonText(gd.Dungeons[0].DefeatText) {
						failed = true
						break
					}
					if _, err := g.ProcessAction(GameActionRequest{Type: "advance"}); err != nil {
						t.Fatal(err)
					}
				}
				if !failed && g.dungeon.PayoffClaimed {
					wins++
				}
			}
			t.Logf("actual authored route: %d/10 wins; %d total combat rounds, no debug grants, rest only at authored workshop", wins, rounds)
			if wins < 8 {
				t.Fatalf("only %d/10 starter parties completed the authored outing", wins)
			}
		})
	}
}

func TestDungeonEntryRequiresAuthoritativeHomeOrigin(t *testing.T) {
	g := newTownTestGame(t)
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "enter"}); err == nil {
		t.Fatal("missing origin accepted")
	}
	home := g.State().DungeonEntry.NodeID
	g.location.WorldNodeID = "another-node"
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "enter", NodeID: home}); err == nil {
		t.Fatal("entry from different authoritative node accepted")
	}
}
func TestDungeonTopLevelItemTurnRecoversDefeat(t *testing.T) {
	g := newTownTestGame(t)
	enterTestDungeon(t, g)
	useDungeonAction(t, g, "trail-bats")
	g.inv.Consumables["antidote"] = 100
	for i, c := range g.party {
		c.CurrentHP = 0
		if i == 0 {
			c.CurrentHP = 1
		}
	}
	for _, e := range g.enemies {
		e.STR = 1000
		e.HitPct = 1000
	}
	for i := 0; i < 20 && g.phase == "combat"; i++ {
		if _, err := g.ProcessAction(GameActionRequest{Type: "item", ItemID: "antidote", TargetID: 0}); err != nil {
			t.Fatal(err)
		}
	}
	if g.phase != "world" || !g.party[0].IsAlive() || g.dungeon.Flags["trail-bats-cleared"] {
		t.Fatal("item defeat stranded party or cleared encounter")
	}
}
