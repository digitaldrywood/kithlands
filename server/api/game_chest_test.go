package api

import (
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/interiors"
)

func newChestTestGame(t *testing.T) (*Game, *GameManager) {
	t.Helper()

	gd := gamedata.Load("../../shared")
	gm := NewGameManager(gd, "../../shared")
	game, err := gm.CreateGame(NewGameRequest{
		TownName:    "Chest Town",
		People:      []WizardPersonReq{{Name: "Aria", Relation: "friend"}},
		Places:      []string{"Library", "Forge", "Chapel"},
		BigBuilding: "Town Hall",
		Party: []PartyMemberReq{
			{Name: "Hero", ClassID: "warrior"},
			{Name: "Mira", ClassID: "mender"},
		},
		Difficulty: "normal",
		RNGSeed:    42,
	})
	if err != nil {
		t.Fatalf("CreateGame: %v", err)
	}
	return game, gm
}

func assignInteriorTemplate(t *testing.T, game *Game, gm *GameManager, buildingType, templateID string) string {
	t.Helper()

	var template *interiors.Template
	for _, candidate := range gm.interiorTemplates.Templates {
		if candidate.ID == templateID {
			template = candidate
			break
		}
	}
	if template == nil {
		t.Fatalf("template %q not found", templateID)
	}

	for i := range game.tileMap.Spawns {
		if game.tileMap.Spawns[i].BuildingType != buildingType {
			continue
		}
		game.tileMap.Spawns[i].Interior = template
		return game.tileMap.Spawns[i].NodeID
	}
	t.Fatalf("no spawn found for building type %q", buildingType)
	return ""
}

func TestOpenChestAwardsConsumableAndPersistsFlag(t *testing.T) {
	game, gm := newChestTestGame(t)
	nodeID := assignInteriorTemplate(t, game, gm, "inn", "inn_riverrest_secret_1f")

	state, err := game.openChest(nodeID, "riverrest_guest_cache")
	if err != nil {
		t.Fatalf("openChest: %v", err)
	}
	if got := game.inv.Consumables["potion"]; got != 7 {
		t.Fatalf("potion count = %d, want 7", got)
	}
	if !game.triggeredFlags[chestOpenFlag(nodeID, "riverrest_guest_cache")] {
		t.Fatal("expected chest-open flag to persist")
	}
	if state.Message != "Received 2x Potion!" {
		t.Fatalf("message = %q", state.Message)
	}

	_, err = game.openChest(nodeID, "riverrest_guest_cache")
	if err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("second open err = %v, want empty error", err)
	}
}

func TestOpenChestHonorsLockFlags(t *testing.T) {
	game, gm := newChestTestGame(t)
	nodeID := assignInteriorTemplate(t, game, gm, "house", "house_widow_keep_1f")

	if _, err := game.openChest(nodeID, "widow_keepsake_box"); err == nil || !strings.Contains(err.Error(), "locked") {
		t.Fatalf("locked chest err = %v, want locked", err)
	}

	game.triggeredFlags["abandoned_cache_found"] = true
	state, err := game.openChest(nodeID, "widow_keepsake_box")
	if err != nil {
		t.Fatalf("locked chest after flag: %v", err)
	}
	if !game.inv.HasKeyItem("sun_seal") {
		t.Fatal("expected sun_seal key item after opening chest")
	}
	if state.Message != "Received Sun Seal!" {
		t.Fatalf("message = %q", state.Message)
	}
}

func TestOpenChestResolvesConditionalVariants(t *testing.T) {
	t.Run("default variant", func(t *testing.T) {
		game, gm := newChestTestGame(t)
		nodeID := assignInteriorTemplate(t, game, gm, "temple", "temple_sunhall_1f")

		if _, err := game.openChest(nodeID, "sunhall_offering_chest"); err != nil {
			t.Fatalf("openChest: %v", err)
		}
		if got := game.inv.Consumables["ether"]; got != 1 {
			t.Fatalf("ether count = %d, want 1", got)
		}
	})

	t.Run("flagged variant", func(t *testing.T) {
		game, gm := newChestTestGame(t)
		nodeID := assignInteriorTemplate(t, game, gm, "temple", "temple_sunhall_1f")
		game.triggeredFlags["abandoned_cache_found"] = true

		state, err := game.openChest(nodeID, "sunhall_offering_chest")
		if err != nil {
			t.Fatalf("openChest: %v", err)
		}
		if got := game.inv.Consumables["hi_ether"]; got != 1 {
			t.Fatalf("hi_ether count = %d, want 1", got)
		}
		if state.Message != "Received Hi-Ether!" {
			t.Fatalf("message = %q", state.Message)
		}
	})
}

func TestMonsterBoxChestRequiresVictoryThenClaim(t *testing.T) {
	game, gm := newChestTestGame(t)
	nodeID := assignInteriorTemplate(t, game, gm, "temple", "temple_crypt_2f")

	state, err := game.openChest(nodeID, "crypt_reliquary")
	if err != nil {
		t.Fatalf("openChest: %v", err)
	}
	if state.Phase != "combat" {
		t.Fatalf("phase after mimic open = %q, want combat", state.Phase)
	}
	if game.pendingChestClaim == nil {
		t.Fatal("expected pending chest claim after mimic open")
	}
	if game.triggeredFlags[chestOpenFlag(nodeID, "crypt_reliquary")] {
		t.Fatal("mimic chest should not be marked opened before claim")
	}

	ForceVictoryForTest(game)
	if game.phase != "quest_complete" {
		t.Fatalf("phase after mimic victory = %q, want quest_complete", game.phase)
	}
	if game.pendingChestClaim == nil {
		t.Fatal("pending chest claim cleared before claim")
	}

	claimed, err := game.claimChest(nodeID, "crypt_reliquary")
	if err != nil {
		t.Fatalf("claimChest: %v", err)
	}
	if game.pendingChestClaim != nil {
		t.Fatal("pending chest claim not cleared")
	}
	if !game.triggeredFlags[chestOpenFlag(nodeID, "crypt_reliquary")] {
		t.Fatal("mimic chest should be opened after claim")
	}
	if got := game.inv.Consumables["phoenix_down"]; got != 2 {
		t.Fatalf("phoenix_down count = %d, want 2", got)
	}
	if claimed.Message != "Received 2x Phoenix Down!" {
		t.Fatalf("message = %q", claimed.Message)
	}
	if len(claimed.CombatLog) == 0 || claimed.CombatLog[len(claimed.CombatLog)-1] != "Received 2x Phoenix Down!" {
		t.Fatalf("combat log missing chest reward: %+v", claimed.CombatLog)
	}
}
