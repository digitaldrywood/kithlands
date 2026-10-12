package api

import (
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/dungeon"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

func enterTestDungeon(t *testing.T, g *Game) GameState {
	t.Helper()
	entry := g.State().DungeonEntry
	arriveAtWorldNode(t, g, entry.NodeID)
	s, err := g.ProcessDungeon(DungeonRequest{Type: "enter", NodeID: entry.NodeID})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func dungeonEntryByID(t *testing.T, g *Game, id string) DungeonEntryState {
	t.Helper()
	for _, entry := range g.State().DungeonEntries {
		if entry.ID == id {
			return entry
		}
	}
	t.Fatalf("missing dungeon entry %s", id)
	return DungeonEntryState{}
}

func enterDungeonByID(t *testing.T, g *Game, id string) GameState {
	t.Helper()
	entry := dungeonEntryByID(t, g, id)
	arriveAtWorldNode(t, g, entry.NodeID)
	state, err := g.ProcessDungeon(DungeonRequest{Type: "enter", NodeID: entry.NodeID})
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func arriveAtWorldNode(t *testing.T, g *Game, target string) {
	t.Helper()
	start := g.location.WorldNodeID
	if start == target {
		return
	}
	previous := map[string]string{start: start}
	queue := []string{start}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if current == target {
			break
		}
		for _, neighbor := range g.loc.Neighbors(current) {
			if _, seen := previous[neighbor]; seen {
				continue
			}
			previous[neighbor] = current
			queue = append(queue, neighbor)
		}
	}
	if _, ok := previous[target]; !ok {
		t.Fatalf("no locality route from %s to %s", start, target)
	}
	var reverse []string
	for node := target; node != start; node = previous[node] {
		reverse = append(reverse, node)
	}
	for i := len(reverse) - 1; i >= 0; i-- {
		if _, err := g.ProcessLocationTransition(LocationTransitionRequest{
			TransitionID: "arrive-world-node",
			WorldNodeID:  reverse[i],
		}); err != nil {
			t.Fatalf("arrive at world node %s: %v", reverse[i], err)
		}
	}
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
	entry := dungeonEntryByID(t, loaded, before.Dungeon.ID)
	if !entry.Started || entry.Objective != before.Dungeon.Objective || !reflect.DeepEqual(entry.Journal, before.Dungeon.Journal) {
		t.Fatalf("journal summary differs from restored adventure: %+v", entry)
	}
	entry.Journal[0] = "mutated client view"
	if loaded.State().Dungeon.Journal[0] == entry.Journal[0] {
		t.Fatal("journal summary aliases authoritative progress")
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

func TestDungeonCatalogRoutesByWorldNode(t *testing.T) {
	g := newTownTestGame(t)
	state := g.State()
	if len(state.DungeonEntries) != 2 {
		t.Fatalf("got %d dungeon entries, want 2", len(state.DungeonEntries))
	}
	oldMill := dungeonEntryByID(t, g, "old-mill")
	shrine := dungeonEntryByID(t, g, "forgotten-shrine")
	if state.DungeonEntry == nil || state.DungeonEntry.ID != oldMill.ID || oldMill.NodeID != g.walk.Spawn.ID {
		t.Fatalf("legacy Old Mill entry moved: %+v", state.DungeonEntry)
	}
	if shrine.NodeID == oldMill.NodeID || g.walk.DistanceMap[shrine.NodeID] <= g.walk.DistanceMap[oldMill.NodeID] {
		t.Fatalf("Shrine is not bound to a farther world node: old=%+v shrine=%+v", oldMill, shrine)
	}
	if len(shrine.RouteNodeIDs) == 0 || shrine.RouteNodeIDs[len(shrine.RouteNodeIDs)-1] != shrine.NodeID {
		t.Fatalf("Shrine route does not reach its entry: %+v", shrine)
	}
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "enter", NodeID: "forged-node"}); err == nil {
		t.Fatal("invalid-node dungeon entry accepted")
	}
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "enter", NodeID: shrine.NodeID}); err == nil {
		t.Fatal("remote Shrine entry accepted before authoritative arrival")
	}
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID: "arrive-world-node",
		WorldNodeID:  shrine.NodeID,
	}); err == nil {
		t.Fatal("non-adjacent world arrival accepted")
	}
	entered := enterDungeonByID(t, g, "forgotten-shrine")
	if entered.ActiveDungeonID != "forgotten-shrine" || entered.Dungeon == nil || entered.Dungeon.ID != "forgotten-shrine" {
		t.Fatalf("wrong active adventure: %+v", entered)
	}
}

func TestFarDungeonEntryUsesFarthestNonBossNode(t *testing.T) {
	g := newTownTestGame(t)
	def := g.dungeonDefinitionByID("forgotten-shrine")
	spawn := &locality.Node{ID: "spawn"}
	closeNode := &locality.Node{ID: "close"}
	mediumNear := &locality.Node{ID: "medium-near"}
	mediumFar := &locality.Node{ID: "medium-far"}
	bigBad := &locality.Node{ID: "boss"}
	g.walk = &locality.WalkResult{
		Spawn:       spawn,
		Close:       []*locality.Node{closeNode},
		Medium:      []*locality.Node{mediumNear, mediumFar, bigBad},
		BigBad:      bigBad,
		DistanceMap: map[string]int{"spawn": 0, "close": 1, "medium-near": 3, "medium-far": 4, "boss": 4},
	}
	if got := g.dungeonEntryNode(def); got == nil || got.ID != mediumFar.ID {
		t.Fatalf("no-Far entry = %+v, want farthest non-boss medium node", got)
	}

	g.walk = &locality.WalkResult{
		Spawn:       spawn,
		Close:       []*locality.Node{bigBad},
		BigBad:      bigBad,
		DistanceMap: map[string]int{"spawn": 0, "boss": 1},
	}
	if got := g.dungeonEntryNode(def); got != nil {
		t.Fatalf("small graph placed Shrine on reserved node: %+v", got)
	}
	state := g.State()
	if slices.ContainsFunc(state.DungeonEntries, func(entry DungeonEntryState) bool {
		return entry.ID == "forgotten-shrine"
	}) {
		t.Fatal("unavailable Shrine was published without a safe entry node")
	}
}

func TestDungeonProgressPersistsIndependentlyAcrossCatalog(t *testing.T) {
	g := newTownTestGame(t)
	enterDungeonByID(t, g, "old-mill")
	useDungeonAction(t, g, "split-oak")
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "retreat"}); err != nil {
		t.Fatal(err)
	}

	enterDungeonByID(t, g, "forgotten-shrine")
	useDungeonAction(t, g, "threshold-markers")
	saved, err := g.ToSaveState("two adventures", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.activeDungeonID != "forgotten-shrine" || len(loaded.dungeons) != 2 {
		t.Fatalf("catalog checkpoint not restored: active=%q progress=%+v", loaded.activeDungeonID, loaded.dungeons)
	}
	if !loaded.dungeons["old-mill"].Flags["oak-read"] || !loaded.dungeons["forgotten-shrine"].Flags["ridge-markers-read"] {
		t.Fatalf("independent flags not restored: %+v", loaded.dungeons)
	}
	if _, err := loaded.ProcessDungeon(DungeonRequest{Type: "retreat"}); err != nil {
		t.Fatal(err)
	}
	enterDungeonByID(t, loaded, "old-mill")
	if loaded.dungeon.Flags["ridge-markers-read"] || !loaded.dungeon.Flags["oak-read"] {
		t.Fatalf("adventure progress leaked across IDs: %+v", loaded.dungeon.Flags)
	}
}

func TestDungeonLegacySingleProgressMigratesIntoCatalog(t *testing.T) {
	g := newTownTestGame(t)
	enterDungeonByID(t, g, "old-mill")
	useDungeonAction(t, g, "split-oak")
	saved, err := g.ToSaveState("legacy mill", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	var world map[string]json.RawMessage
	if err := json.Unmarshal(saved.WorldState, &world); err != nil {
		t.Fatal(err)
	}
	legacy, err := json.Marshal(g.dungeon)
	if err != nil {
		t.Fatal(err)
	}
	world["dungeon"] = legacy
	delete(world, "dungeons")
	delete(world, "active_dungeon_id")
	saved.WorldState, err = json.Marshal(world)
	if err != nil {
		t.Fatal(err)
	}

	loaded, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.activeDungeonID != "old-mill" || loaded.dungeons["old-mill"] == nil || !loaded.dungeons["old-mill"].Flags["oak-read"] {
		t.Fatalf("legacy dungeon not migrated: active=%q progress=%+v", loaded.activeDungeonID, loaded.dungeons)
	}
}

func TestForgottenShrineAuthoredContract(t *testing.T) {
	g := newTownTestGame(t)
	def := g.dungeonDefinitionByID("forgotten-shrine")
	if def == nil || len(def.Rooms) != 6 {
		t.Fatalf("Forgotten Shrine room count: %+v", def)
	}
	encounters, switches, rests := 0, 0, 0
	for _, room := range def.Rooms {
		for _, action := range room.Actions {
			switch action.Kind {
			case "encounter":
				encounters++
			case "switch":
				switches++
			case "rest":
				rests++
			}
		}
	}
	if encounters != 4 || switches != 2 || rests != 1 {
		t.Fatalf("Shrine contract got encounters=%d switches=%d rests=%d", encounters, switches, rests)
	}
	boss := def.Room("inner-sanctum").Action("sanctum-guardians")
	if boss == nil || boss.Encounter == nil || !boss.Encounter.Boss || len(boss.Encounter.Monsters) < 2 {
		t.Fatalf("boss is not a distinct existing-monster formation: %+v", boss)
	}
	reward := g.gd.EquipmentBaseByID("twin_sigil_amulet")
	wantClasses := []string{"warrior", "brawler", "rogue", "mender", "cinder", "wayfarer"}
	if reward == nil || reward.Tier != 3 || !slices.Equal(reward.Classes, wantClasses) {
		t.Fatalf("Shrine reward is not universal tier 3 gear: %+v", reward)
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

var completeShrineRoute = []string{
	"threshold-markers", "threshold-guardians", "threshold-nave", "pilgrim-rest",
	"nave-chapel", "chapel-sentinels", "bell-tuning-lever", "chapel-return", "pilgrim-rest",
	"nave-archive", "archive-wraiths", "moon-mirror", "archive-return", "pilgrim-rest",
	"nave-reliquary", "reliquary-moon-path", "reliquary-bell-path", "reliquary-sanctum",
	"sanctum-guardians", "twin-sigil-altar", "sanctum-return", "reliquary-return", "nave-threshold", "threshold-return",
}

func countEquipmentBase(g *Game, baseID string) int {
	count := 0
	for _, item := range g.inv.Instances {
		if item != nil && item.BaseID == baseID {
			count++
		}
	}
	return count
}

func TestForgottenShrineFullRouteDefeatRetryAndRepeatSafety(t *testing.T) {
	g := newTownTestGame(t)
	enterDungeonByID(t, g, "forgotten-shrine")
	preBoss := completeShrineRoute[:18]
	for _, id := range preBoss {
		state := useDungeonAction(t, g, id)
		if state.Phase == "combat" {
			finishDungeonFixtureFight(t, g)
		}
	}
	useDungeonAction(t, g, "sanctum-guardians")
	for _, member := range g.party {
		member.CurrentHP = 0
	}
	recovered, err := g.ProcessAction(GameActionRequest{Type: "attack"})
	if err != nil {
		t.Fatal(err)
	}
	if recovered.Dungeon == nil || !recovered.Dungeon.RecoveredFromDefeat || g.dungeon.Flags["sanctum-guardians-cleared"] {
		t.Fatalf("boss defeat did not preserve an uncleared retry: %+v", recovered.Dungeon)
	}
	for _, flag := range []string{"threshold-guardians-cleared", "bell-tuned", "moon-mirror-aligned"} {
		if !g.dungeon.Flags[flag] {
			t.Fatalf("boss defeat lost persistent flag %q", flag)
		}
	}

	for _, id := range []string{"threshold-nave", "nave-reliquary", "reliquary-sanctum", "sanctum-guardians"} {
		state := useDungeonAction(t, g, id)
		if state.Phase == "combat" {
			finishDungeonFixtureFight(t, g)
		}
	}
	for _, id := range []string{"twin-sigil-altar", "sanctum-return", "reliquary-return", "nave-threshold"} {
		useDungeonAction(t, g, id)
	}
	beforeReturnGold := g.inv.Gold
	useDungeonAction(t, g, "threshold-return")
	if !g.dungeons["forgotten-shrine"].PayoffClaimed || g.inv.Gold != beforeReturnGold+240 || countEquipmentBase(g, "twin_sigil_amulet") != 1 {
		t.Fatalf("Shrine completion reward missing: gold=%d items=%d progress=%+v", g.inv.Gold, countEquipmentBase(g, "twin_sigil_amulet"), g.dungeons["forgotten-shrine"])
	}

	enterDungeonByID(t, g, "forgotten-shrine")
	for _, id := range []string{"threshold-nave", "nave-reliquary", "reliquary-sanctum"} {
		useDungeonAction(t, g, id)
	}
	for _, id := range []string{"sanctum-guardians", "twin-sigil-altar"} {
		action := g.dungeonDefinition().Room(g.dungeon.RoomID).Action(id)
		walkDungeonTo(t, g, action.Position)
		if _, err := g.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: id}); err == nil {
			t.Fatalf("completed Shrine replayed %s", id)
		}
	}
	if countEquipmentBase(g, "twin_sigil_amulet") != 1 {
		t.Fatal("reentry duplicated the Twin-Sigil Amulet")
	}
}

func levelDungeonParty(t *testing.T, g *Game, target int) {
	t.Helper()
	for _, member := range g.party {
		class := g.gd.ClassByID(member.ClassID)
		for member.Level < target {
			member.XP = character.XPToNextLevel(member.Level, &g.gd.Stats.XPCurve)
			if err := character.LevelUp(member, class, &g.gd.Stats, g.rng); err != nil {
				t.Fatal(err)
			}
		}
	}
	g.inv.Consumables["potion"] = 12
	g.inv.Consumables["ether"] = 4
}

func shrineCombatActions(state GameState) []MemberActionReq {
	target := 0
	for _, enemy := range state.Enemies {
		if enemy.HP > 0 {
			target = enemy.ID
			break
		}
	}
	lowest := -1
	for i, member := range state.Party {
		if member.HP <= 0 {
			continue
		}
		if lowest < 0 || member.HP*state.Party[lowest].MaxHP < state.Party[lowest].HP*member.MaxHP {
			lowest = i
		}
	}
	potions, ethers := state.Potions, state.Ethers
	actions := make([]MemberActionReq, 0, len(state.Party))
	for i, member := range state.Party {
		if member.HP <= 0 {
			continue
		}
		action := MemberActionReq{Slot: i, Type: "attack", TargetID: target}
		if lowest >= 0 && state.Party[lowest].HP*2 < state.Party[lowest].MaxHP && member.ClassID == "mender" {
			for _, spell := range member.Spells {
				if spell.ID == "cure" && spell.Castable && spell.MPCost <= member.MP {
					action = MemberActionReq{Slot: i, Type: "spell", SpellID: "cure", TargetID: lowest, TargetMode: "single_ally"}
					break
				}
			}
		} else if lowest >= 0 && state.Party[lowest].HP*3 < state.Party[lowest].MaxHP && potions > 0 {
			action = MemberActionReq{Slot: i, Type: "item", ItemID: "potion", TargetID: lowest}
			potions--
		} else if member.ClassID == "cinder" && member.MP < 3 && ethers > 0 {
			action = MemberActionReq{Slot: i, Type: "item", ItemID: "ether", TargetID: i}
			ethers--
		} else {
			for _, spell := range member.Spells {
				if spell.ID == "spark" && spell.Castable && spell.MPCost <= member.MP {
					action = MemberActionReq{Slot: i, Type: "spell", SpellID: "spark", TargetID: target}
					break
				}
			}
		}
		actions = append(actions, action)
	}
	return actions
}

func TestForgottenShrineRouteBalance(t *testing.T) {
	gd := newTownTestGame(t).gd
	for _, size := range []int{2, 4} {
		t.Run(fmt.Sprintf("party_%d", size), func(t *testing.T) {
			wins, rounds := 0, 0
			defeats := make(map[string]int)
			for seed := 1; seed <= 10; seed++ {
				party := []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}}
				if size == 4 {
					party = append(party, PartyMemberReq{Name: "Mercy", ClassID: "mender"}, PartyMemberReq{Name: "Shade", ClassID: "rogue"})
				}
				g, err := NewGameManager(gd, "").CreateGame(NewGameRequest{TownName: "Willow Creek", Places: []string{"Shrine Road", "Pine Ridge"}, BigBuilding: "Hall", Party: party, Difficulty: "normal", RNGSeed: int64(seed)})
				if err != nil {
					t.Fatal(err)
				}
				levelDungeonParty(t, g, 6)
				enterDungeonByID(t, g, "forgotten-shrine")
				failed := false
				for _, id := range completeShrineRoute {
					state := useDungeonAction(t, g, id)
					if state.Phase != "combat" {
						continue
					}
					for round := 0; round < 80 && g.phase == "combat"; round++ {
						next, err := g.ProcessAction(GameActionRequest{Type: "attack", Actions: shrineCombatActions(state)})
						if err != nil {
							t.Fatal(err)
						}
						state = *next
						rounds++
					}
					if g.phase == "combat" {
						t.Fatal("Shrine battle exceeded round limit")
					}
					if state.Dungeon != nil && state.Dungeon.RecoveredFromDefeat {
						defeats[id]++
						failed = true
						break
					}
					if _, err := g.ProcessAction(GameActionRequest{Type: "advance"}); err != nil {
						t.Fatal(err)
					}
				}
				if !failed && g.dungeons["forgotten-shrine"].PayoffClaimed {
					wins++
				}
			}
			t.Logf("level-6 authored Shrine route: %d/10 wins; %d total combat rounds; defeats=%v; 12 potions, 4 ethers, and Nave rest only", wins, rounds, defeats)
			if wins < 8 {
				t.Fatalf("only %d/10 level-6 parties completed the Shrine route", wins)
			}
		})
	}
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
	if g.inv.Materials["mill_core"] != 1 {
		t.Fatal("missing mill crafting reward")
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
	if g.inv.Gold != gold || g.inv.Gems["ember_gem"] != 1 || g.inv.Materials["mill_core"] != 1 {
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
	if state.Phase != "world" || !state.Dungeon.RecoveredFromDefeat || g.dungeon.RoomID != g.dungeonDefinition().EntryRoom || g.dungeon.Flags["trail-bats-cleared"] {
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
	if g.phase == "combat" || g.dungeon.RecoveredFromDefeat || g.dungeon.Flags["trail-bats-cleared"] || g.dungeon.EncounterID != "" {
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
	g.location.Kind = LocationSettlement
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

func TestCompletedSaveGetsCraftingCoreOnce(t *testing.T) {
	g := newTownTestGame(t)
	enterTestDungeon(t, g)
	def := g.dungeonDefinition()
	g.dungeon.Flags[def.CompleteFlag] = true
	g.dungeon.PayoffClaimed = true // legacy save: no separate material claims
	saved, err := g.ToSaveState("legacy completed mill", "test")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if restored.inv.Materials["mill_core"] != 1 || restored.inv.Gold != g.inv.Gold {
		t.Fatal("incorrect legacy material-only reward")
	}
	restored.inv.Materials["mill_core"] = 0 // consumed by crafting
	saved, err = restored.ToSaveState("spent core", "test")
	if err != nil {
		t.Fatal(err)
	}
	restored, err = FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if restored.inv.Materials["mill_core"] != 0 {
		t.Fatal("save/load duplicated spent reward")
	}
}

func TestDungeonMaterialRewardFailureIsAtomic(t *testing.T) {
	g := newTownTestGame(t)
	g.inv.Normalize()
	original := g.inv
	before, err := json.Marshal(g.inv)
	if err != nil {
		t.Fatal(err)
	}
	seq := g.lootRollSeq
	for _, reward := range []dungeon.Reward{
		{Gold: 10, Materials: map[string]int{"unknown": 1}},
		{Gold: 10, Materials: map[string]int{"mill_core": -1}},
		{ItemID: "unknown", Count: 1, Gold: 10, Materials: map[string]int{"mill_core": 1}},
	} {
		if err := g.grantDungeonReward(reward); err == nil {
			t.Fatal("invalid reward accepted")
		}
		after, err := json.Marshal(g.inv)
		if err != nil {
			t.Fatal(err)
		}
		if original != g.inv || string(before) != string(after) || seq != g.lootRollSeq {
			t.Fatal("failed reward partially granted")
		}
	}
}
