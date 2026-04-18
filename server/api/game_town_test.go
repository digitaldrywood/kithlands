package api

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func newTownTestGame(t *testing.T) *Game {
	t.Helper()
	gd := gamedata.Load("../../shared")
	gm := NewGameManager(gd, "../../shared")
	game, err := gm.CreateGame(NewGameRequest{
		TownName:    "Cadott",
		People:      []WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party: []PartyMemberReq{
			{Name: "Hero", ClassID: "warrior"},
			{Name: "Sparks", ClassID: "cinder"},
		},
		Difficulty: "normal",
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	return game
}

func TestPickHiddenItemReward_Tier1(t *testing.T) {
	tags := map[string]bool{"shop": true, "commerce": true}
	// Collect several items and verify they're all valid tier-1 rewards
	validItems := map[string]bool{
		"potion": true, "antidote": true, "ether": true,
	}
	for seed := uint64(0); seed < 20; seed++ {
		id, gold := pickHiddenItemReward(tags, 0, seed)
		if gold > 0 {
			if gold != 50 {
				t.Errorf("seed %d: tier 1 gold=%d, want 50", seed, gold)
			}
			continue
		}
		if !validItems[id] {
			t.Errorf("seed %d: tier 1 item=%q not in valid set", seed, id)
		}
	}
}

func TestPickHiddenItemReward_Tier2(t *testing.T) {
	tags := map[string]bool{"rest": true}
	validItems := map[string]bool{
		"hi_potion": true, "ether": true, "phoenix_down": true, "antidote": true,
	}
	for seed := uint64(0); seed < 20; seed++ {
		id, gold := pickHiddenItemReward(tags, 4, seed)
		if gold > 0 {
			if gold != 150 {
				t.Errorf("seed %d: tier 2 gold=%d, want 150", seed, gold)
			}
			continue
		}
		if !validItems[id] {
			t.Errorf("seed %d: tier 2 item=%q not in valid set", seed, id)
		}
	}
}

func TestPickHiddenItemReward_Tier3(t *testing.T) {
	tags := map[string]bool{"temple": true, "revive": true}
	validItems := map[string]bool{
		"hi_potion": true, "hi_ether": true, "x_ether": true, "phoenix_down": true,
	}
	for seed := uint64(0); seed < 20; seed++ {
		id, gold := pickHiddenItemReward(tags, 7, seed)
		if gold > 0 {
			if gold != 300 {
				t.Errorf("seed %d: tier 3 gold=%d, want 300", seed, gold)
			}
			continue
		}
		if !validItems[id] {
			t.Errorf("seed %d: tier 3 item=%q not in valid set", seed, id)
		}
	}
}

func TestPickHiddenItemReward_Deterministic(t *testing.T) {
	tags := map[string]bool{"shop": true}
	id1, g1 := pickHiddenItemReward(tags, 0, 42)
	id2, g2 := pickHiddenItemReward(tags, 0, 42)
	if id1 != id2 || g1 != g2 {
		t.Errorf("not deterministic: (%q,%d) != (%q,%d)", id1, g1, id2, g2)
	}
}

func TestRestAtTown_RestoresLivingPartyMembers(t *testing.T) {
	for _, tags := range [][]string{{"house"}, {"safehouse"}} {
		t.Run(tags[0], func(t *testing.T) {
			game := newTownTestGame(t)

			DamagePartyForTest(game, 0, PartyMaxHPForTest(game, 0)-1)
			DamagePartyMPForTest(game, 1, PartyMaxMPForTest(game, 1))
			KillPartyMemberForTest(game, 1)

			msg, err := game.restAtTown(tags)
			if err != nil {
				t.Fatalf("restAtTown: %v", err)
			}
			if msg != "HP and spells restored!" {
				t.Fatalf("message = %q, want HP and spells restored!", msg)
			}
			if got, want := PartyHPForTest(game, 0), PartyMaxHPForTest(game, 0); got != want {
				t.Fatalf("hero HP after rest = %d, want %d", got, want)
			}
			if got, want := PartyMPForTest(game, 0), PartyMaxMPForTest(game, 0); got != want {
				t.Fatalf("hero MP after rest = %d, want %d", got, want)
			}
			if hp := PartyHPForTest(game, 1); hp != 0 {
				t.Fatalf("dead member HP after rest = %d, want 0", hp)
			}
			if mp := PartyMPForTest(game, 1); mp != 0 {
				t.Fatalf("dead member MP after rest = %d, want 0", mp)
			}
			if status := PartyStatusForTest(game, 1); status != character.StatusDeath {
				t.Fatalf("dead member status after rest = %q, want %q", status, character.StatusDeath)
			}
		})
	}
}

func TestRestAtTown_RejectsNonRestNodes(t *testing.T) {
	game := newTownTestGame(t)

	if _, err := game.restAtTown([]string{"commerce"}); err == nil {
		t.Fatal("expected non-rest node to be rejected")
	}
}

func TestHashStr(t *testing.T) {
	// Same string should always produce same hash
	h1 := hashStr("test_node_123")
	h2 := hashStr("test_node_123")
	if h1 != h2 {
		t.Errorf("hashStr not deterministic: %d != %d", h1, h2)
	}

	// Different strings should (very likely) produce different hashes
	h3 := hashStr("test_node_456")
	if h1 == h3 {
		t.Errorf("hashStr collision: %q and %q both produce %d", "test_node_123", "test_node_456", h1)
	}
}

func TestNewGameStateIncludesAuthoredInteriorTemplates(t *testing.T) {
	game := newTownTestGame(t)
	state := game.State()
	if state.TileMap == nil {
		t.Fatal("expected tilemap in game state")
	}

	foundTemplate := false
	for _, spawn := range state.TileMap.Spawns {
		switch spawn.BuildingType {
		case "inn", "shop", "temple", "house":
			if spawn.Interior == nil {
				t.Fatalf("spawn %q (%s) missing authored interior template", spawn.Name, spawn.BuildingType)
			}
			if spawn.Interior.BuildingType != spawn.BuildingType {
				t.Fatalf("spawn %q got mismatched template type %q", spawn.Name, spawn.Interior.BuildingType)
			}
			foundTemplate = true
		}
	}

	if !foundTemplate {
		t.Fatal("expected at least one authored building spawn")
	}
}
