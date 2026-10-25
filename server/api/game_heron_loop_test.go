package api

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestDungeonPreviewMatchesResolvedRoster(t *testing.T) {
	for _, size := range []int{2, 4} {
		t.Run(fmt.Sprintf("party_%d", size), func(t *testing.T) {
			party := []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}}
			if size == 4 {
				party = append(party, PartyMemberReq{Name: "Mercy", ClassID: "mender"}, PartyMemberReq{Name: "Shade", ClassID: "rogue"})
			}
			g, err := NewGameManager(loadSharedForTest(t), "").CreateGame(NewGameRequest{TownName: "Willow Creek", Places: []string{"Mill Road"}, BigBuilding: "Hall", Party: party, Difficulty: "normal", RNGSeed: 1})
			if err != nil {
				t.Fatal(err)
			}
			s := enterTestDungeon(t, g)
			var preview *DungeonEncounterPreview
			for _, a := range s.Dungeon.Actions {
				if a.ID == "trail-bats" {
					preview = a.Encounter
				}
			}
			if preview == nil || preview.Level != 1 || preview.Optional {
				t.Fatalf("missing honest entrance preview: %+v", preview)
			}
			useDungeonAction(t, g, "trail-bats")
			if len(preview.Enemies) != len(g.enemies) {
				t.Fatal("preview roster size changed at engagement")
			}
			for i, e := range g.enemies {
				if preview.Enemies[i].MonsterID != e.MonsterID || preview.Enemies[i].Tactics == "" {
					t.Fatal("preview differs from resolved encounter")
				}
			}
		})
	}
}

func TestHeronLoopPersistenceCraftingAndRest(t *testing.T) {
	g := newTownTestGame(t)
	enterTestDungeon(t, g)
	useDungeonAction(t, g, "heron-trail")
	pool := g.dungeonDefinition().Room("heron-pool")
	cache := pool.Action("pool-smithing-cache")
	walkDungeonTo(t, g, cache.Position)
	before := g.inv.Clone()
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: cache.ID}); err == nil || !reflect.DeepEqual(before, g.inv.Clone()) {
		t.Fatal("guarded cache granted materials")
	}
	useDungeonAction(t, g, "pool-bramblehog")
	// This fixture isolates persistence and claim safety. Real combat is tested below.
	finishDungeonFixtureFight(t, g)
	useDungeonAction(t, g, "pool-smithing-cache")
	if g.inv.Materials["ember_ore"] != 8 || g.inv.Materials["hardwood"] != 2 || g.inv.Materials["bronze_pommel"] != 1 {
		t.Fatal("wrong trail supplies")
	}
	if err := g.CraftFieldRecipe("forge_trail_sword"); err != nil {
		t.Fatal(err)
	}
	if g.inv.Materials["ember_ore"] != 3 || g.inv.Materials["hardwood"] != 1 || g.inv.Materials["bronze_pommel"] != 0 {
		t.Fatal("wrong precision blade cost")
	}
	if countEquipmentBase(g, "trail_sword") != 1 {
		t.Fatal("missing crafted blade")
	}
	if err := g.CraftFieldRecipe("forge_trail_sword"); err == nil {
		t.Fatal("reused consumed pommel")
	}
	saved, err := g.ToSaveState("Heron loop", "test")
	if err != nil {
		t.Fatal(err)
	}
	g, err = FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	before = g.inv.Clone()
	walkDungeonTo(t, g, cache.Position)
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "interact", ActionID: cache.ID}); err == nil || !reflect.DeepEqual(before, g.inv.Clone()) {
		t.Fatal("save replay duplicated supplies")
	}
	g.party[0].CurrentHP = 1
	useDungeonAction(t, g, "pool-rest")
	if !strings.Contains(g.State().Dungeon.Description, "quiet after your victory") {
		t.Fatal("cleared bank retained pre-fight description")
	}
	if g.party[0].CurrentHP != g.party[0].MaxHP {
		t.Fatal("cleared bank did not restore party")
	}
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "retreat"}); err != nil {
		t.Fatal(err)
	}
	enterTestDungeon(t, g)
	useDungeonAction(t, g, "heron-trail")
	for _, a := range g.State().Dungeon.Actions {
		if a.ID == "pool-bramblehog" && (!a.Completed || a.Encounter != nil) {
			t.Fatal("cleared threat returned after retreat")
		}
	}
	iron, trail := g.gd.EquipmentBaseByID("iron_sword"), g.gd.EquipmentBaseByID("trail_sword")
	if trail.Stats["power"] >= iron.Stats["power"] || trail.Stats["hit_pct"] <= iron.Stats["hit_pct"] {
		t.Fatal("blade is not a power/accuracy tradeoff")
	}
	// Craft-only content must never become a free vendor offer at later levels.
	for _, p := range g.party {
		p.Level = 8
	}
	stock, err := g.ensureShopStockLocked("heron-test-shop")
	if err != nil {
		t.Fatal(err)
	}
	for _, offer := range stock.Entries {
		if offer.ItemID == "trail_sword" {
			t.Fatal("craft-only blade appeared in shop")
		}
	}
}

func TestHeronLoopFreshPartyBalance(t *testing.T) {
	gd := newTownTestGame(t).gd
	for _, size := range []int{2, 4} {
		wins, rounds := 0, 0
		for seed := 1; seed <= 20; seed++ {
			party := []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}}
			if size == 4 {
				party = append(party, PartyMemberReq{Name: "Mercy", ClassID: "mender"}, PartyMemberReq{Name: "Shade", ClassID: "rogue"})
			}
			g, err := NewGameManager(gd, "").CreateGame(NewGameRequest{TownName: "Willow Creek", Places: []string{"Mill Road", "Pine Ridge"}, BigBuilding: "Hall", Party: party, Difficulty: "normal", RNGSeed: int64(seed)})
			if err != nil {
				t.Fatal(err)
			}
			enterTestDungeon(t, g)
			useDungeonAction(t, g, "heron-trail")
			state := useDungeonAction(t, g, "pool-bramblehog")
			for r := 0; r < 30 && g.phase == "combat"; r++ {
				next, err := g.ProcessAction(GameActionRequest{Type: "attack", Actions: shrineCombatActions(state)})
				if err != nil {
					t.Fatal(err)
				}
				state = *next
				rounds++
			}
			if g.phase == "quest_complete" {
				wins++
			}
		}
		t.Logf("fresh level-1 party %d vs level-2 threat: %d/20 wins, %d total rounds, no grants", size, wins, rounds)
		if wins < 18 {
			t.Fatalf("optional starter encounter too punishing: %d/20", wins)
		}
	}
}

func TestHeronDefeatKeepsRewardAndRestLocked(t *testing.T) {
	g := newTownTestGame(t)
	enterTestDungeon(t, g)
	useDungeonAction(t, g, "heron-trail")
	useDungeonAction(t, g, "pool-bramblehog")
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "retreat"}); err == nil {
		t.Fatal("retreat bypassed active combat")
	}
	for _, member := range g.party {
		member.CurrentHP = 0
	}
	next, err := g.ProcessAction(GameActionRequest{Type: "attack"})
	if err != nil {
		t.Fatal(err)
	}
	if next.Dungeon == nil || !next.Dungeon.RecoveredFromDefeat || g.dungeon.Flags["pool-bank-cleared"] {
		t.Fatal("defeat cleared the guarded bank")
	}
	useDungeonAction(t, g, "heron-trail")
	for _, action := range g.State().Dungeon.Actions {
		if (action.ID == "pool-rest" || action.ID == "pool-smithing-cache") && action.Available {
			t.Fatal("defeat unlocked benefit")
		}
	}
	if g.inv.Materials["bronze_pommel"] != 0 {
		t.Fatal("defeat granted the rare component")
	}
}
