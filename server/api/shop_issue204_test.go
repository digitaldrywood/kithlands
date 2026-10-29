package api

import (
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func newShopSpellGame(t *testing.T, party []PartyMemberReq) *Game {
	t.Helper()
	gm := NewGameManager(loadSharedForTest(t), "../../shared")
	game, err := gm.CreateGame(NewGameRequest{
		TownName:    "Cadott",
		People:      []WizardPersonReq{{Name: "Coach Bell", Relation: "friendly"}},
		Places:      []string{"Store", "Library"},
		BigBuilding: "Town Hall",
		Party:       party,
		Difficulty:  "normal",
		SpawnNodeID: "shop",
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	entryNodeID := game.State().SettlementEntryNodeID
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID: "enter-settlement", WorldNodeID: entryNodeID,
	}); err != nil {
		t.Fatalf("enter settlement: %v", err)
	}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "general-store-door"}); err != nil {
		t.Fatalf("enter shop: %v", err)
	}
	return game
}

func loadSharedForTest(t *testing.T) *gamedata.GameData {
	t.Helper()
	return gamedata.Load("../../shared")
}

func setPartyLevel(t *testing.T, game *Game, slot, level int) {
	t.Helper()
	game.mu.Lock()
	defer game.mu.Unlock()
	if slot < 0 || slot >= len(game.party) {
		t.Fatalf("invalid slot %d", slot)
	}
	game.party[slot].Level = level
}

func setGold(t *testing.T, game *Game, gold int) {
	t.Helper()
	game.mu.Lock()
	defer game.mu.Unlock()
	game.inv.Gold = gold
}

func findShopSpell(items []ShopItemState, id string) *ShopItemState {
	for i := range items {
		if items[i].ID == id {
			return &items[i]
		}
	}
	return nil
}

func shopTestOffer(t *testing.T, game *Game, itemID string) ShopItemState {
	t.Helper()
	nodeID := game.State().CurrentLocation.MapID
	items, err := game.GetShopItems(nodeID)
	if err != nil {
		t.Fatalf("get shop items: %v", err)
	}
	for _, item := range items {
		if item.ID == itemID {
			return item
		}
	}
	t.Fatalf("shop offer %q not found", itemID)
	return ShopItemState{}
}

func TestLearnSpellRejectsPartyMemberBelowRequiredLevel(t *testing.T) {
	game := newShopSpellGame(t, []PartyMemberReq{
		{Name: "Bruno", ClassID: "warrior"},
		{Name: "Nia", ClassID: "mender"},
	})
	setPartyLevel(t, game, 0, 7)
	setGold(t, game, 500)

	heal := shopTestOffer(t, game, "heal")
	before := game.State()
	err := game.LearnSpell("cadott-general-store", heal.StockID, "Nia")
	if err == nil {
		t.Fatal("expected level gate error, got nil")
	}
	if !strings.Contains(err.Error(), "level too low") {
		t.Fatalf("expected level gate error, got %v", err)
	}
	after := game.State()
	if after.Gold != before.Gold || len(after.Party[1].Spells) != len(before.Party[1].Spells) {
		t.Fatal("rejected spell learning changed gold or known spells")
	}
}

func TestGetShopItemsIncludesSpellLearnerReasons(t *testing.T) {
	game := newShopSpellGame(t, []PartyMemberReq{
		{Name: "Bruno", ClassID: "warrior"},
		{Name: "Nia", ClassID: "mender"},
		{Name: "Mira", ClassID: "mender"},
		{Name: "Tess", ClassID: "mender"},
	})
	setPartyLevel(t, game, 0, 7)
	setPartyLevel(t, game, 1, 1)
	setPartyLevel(t, game, 2, 4)
	setPartyLevel(t, game, 3, 4)
	TeachSpellForTest(game, 2, "heal", 2)

	items, err := game.GetShopItems("cadott-general-store")
	if err != nil {
		t.Fatalf("get shop items: %v", err)
	}
	heal := findShopSpell(items, "heal")
	if heal == nil {
		t.Fatal("shop missing heal")
	}

	want := []struct {
		name     string
		canLearn bool
		reason   string
	}{
		{name: "Bruno", canLearn: false, reason: "wrong class"},
		{name: "Nia", canLearn: false, reason: "level too low"},
		{name: "Mira", canLearn: false, reason: "already known"},
		{name: "Tess", canLearn: true, reason: ""},
	}

	if len(heal.Learners) != len(want) {
		t.Fatalf("learners length = %d, want %d", len(heal.Learners), len(want))
	}

	for i, wantLearner := range want {
		got := heal.Learners[i]
		if got.Name != wantLearner.name || got.CanLearn != wantLearner.canLearn || got.Reason != wantLearner.reason {
			t.Fatalf("learner[%d] = %+v, want %+v", i, got, wantLearner)
		}
	}
}

func TestGetShopItemsIncludesEquipmentCompareStats(t *testing.T) {
	game := newShopSpellGame(t, []PartyMemberReq{
		{Name: "Ayla", ClassID: "warrior"},
		{Name: "Mira", ClassID: "mender"},
	})

	items, err := game.GetShopItems("cadott-general-store")
	if err != nil {
		t.Fatalf("get shop items: %v", err)
	}
	var weapon *ShopItemState
	var armor *ShopItemState
	for i := range items {
		switch items[i].ID {
		case "hand_axe":
			weapon = &items[i]
		case "cloth_robe":
			armor = &items[i]
		}
	}

	if weapon == nil {
		t.Fatal("shop missing hand_axe")
	}
	if weapon.Power != 8 || weapon.HitPct != -5 || weapon.CritPct != 0 || weapon.Element != "none" {
		t.Fatalf("weapon compare stats = %+v", *weapon)
	}
	if len(weapon.ClassIDs) == 0 || weapon.ClassIDs[0] != "warrior" {
		t.Fatalf("weapon class_ids = %v, want warrior-first list", weapon.ClassIDs)
	}
	for _, classID := range weapon.ClassIDs {
		if classID == "mender" {
			t.Fatalf("hand_axe should not be equippable by mender: %v", weapon.ClassIDs)
		}
	}

	if armor == nil {
		t.Fatal("shop missing cloth_robe")
	}
	if armor.Absorb != 2 || armor.MagicDefense != 2 || armor.EvadePenalty != 0 {
		t.Fatalf("armor compare stats = %+v", *armor)
	}
	if len(armor.ClassIDs) == 0 {
		t.Fatalf("armor class_ids missing: %+v", *armor)
	}
}

func TestShopSpellLearningCharacterLevelBoundaries(t *testing.T) {
	for _, tc := range []struct {
		spell string
		level int
	}{
		{spell: "ember", level: 3},
		{spell: "fireball", level: 5},
	} {
		t.Run(tc.spell, func(t *testing.T) {
			game := newShopSpellGame(t, []PartyMemberReq{
				{Name: "Hero", ClassID: "warrior"},
				{Name: "Sparks", ClassID: "cinder"},
			})
			setPartyLevel(t, game, 0, 20)
			setPartyLevel(t, game, 1, tc.level-1)
			setGold(t, game, 1000)
			offer := shopTestOffer(t, game, tc.spell)
			before := game.State()
			if err := game.LearnSpell("cadott-general-store", offer.StockID, "Sparks"); err == nil {
				t.Fatal("under-level character learned spell")
			}
			if after := game.State(); after.Gold != before.Gold || len(after.Party[1].Spells) != len(before.Party[1].Spells) {
				t.Fatal("rejection changed gold or spells")
			}
			setPartyLevel(t, game, 1, tc.level)
			if err := game.LearnSpell("cadott-general-store", offer.StockID, "Sparks"); err != nil {
				t.Fatalf("character at required level cannot learn: %v", err)
			}
			if after := game.State(); after.Gold != before.Gold-offer.Price || len(after.Party[1].Spells) != len(before.Party[1].Spells)+1 {
				t.Fatal("eligible learning did not charge exactly once and add one spell")
			}
		})
	}
}
