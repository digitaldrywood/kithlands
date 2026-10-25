package api

import (
	"reflect"
	"testing"
)

func startingSpellGame(t *testing.T) *Game {
	t.Helper()
	gm := NewGameManager(loadSharedForTest(t), "../../shared")
	game, err := gm.CreateGame(NewGameRequest{TownName: "Cadott", Places: []string{"Store"}, BigBuilding: "Town Hall",
		Party: []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}, {Name: "Shade", ClassID: "rogue"}, {Name: "Willow", ClassID: "mender"}}, Difficulty: "normal", RNGSeed: 42})
	if err != nil {
		t.Fatal(err)
	}
	return game
}

func TestFreshPartyCanBuyAnUnlearnedStartingTownSpell(t *testing.T) {
	game := startingSpellGame(t)
	if game.inv.Gold != 100 {
		t.Fatal("fixture must use real starting money")
	}
	if got := game.spellBooks["Sparks"].KnownSpells[1]; !reflect.DeepEqual(got, []string{"spark"}) {
		t.Fatalf("Cinder starts with %v", got)
	}
	if got := game.spellBooks["Willow"].KnownSpells[1]; !reflect.DeepEqual(got, []string{"cure"}) {
		t.Fatalf("Mender starts with %v", got)
	}
	node := enterStockTestShop(t, game)
	offers, err := game.GetShopItems(node)
	if err != nil {
		t.Fatal(err)
	}
	frost := findStockTestOffer(t, offers, "frost")
	if frost.Price != 100 {
		t.Fatalf("opening spell price = %d", frost.Price)
	}
	if err := game.LearnSpell(node, frost.StockID, "Hero"); err == nil {
		t.Fatal("Warrior learned black magic")
	}
	if game.inv.Gold != 100 {
		t.Fatal("invalid learner spent gold")
	}
	if err := game.LearnSpell(node, frost.StockID, "Sparks"); err != nil {
		t.Fatal(err)
	}
	if game.inv.Gold != 0 || !reflect.DeepEqual(game.spellBooks["Sparks"].KnownSpells[1], []string{"spark", "frost"}) {
		t.Fatal("purchase did not debit its real cost and teach Frost")
	}
	if err := game.LearnSpell(node, frost.StockID, "Sparks"); err == nil {
		t.Fatal("duplicate learning accepted")
	}
	if game.inv.Gold != 0 || len(game.spellBooks["Sparks"].KnownSpells[1]) != 2 {
		t.Fatal("duplicate request mutated state")
	}
}

func TestExistingFullSpellBooksSurviveTheStarterChange(t *testing.T) {
	game := startingSpellGame(t)
	for name, ids := range map[string][]string{"Sparks": {"frost", "sleep"}, "Willow": {"light", "bless"}} {
		for _, id := range ids {
			if err := game.spellBooks[name].LearnSpell(id, 1, 3); err != nil {
				t.Fatal(err)
			}
		}
	}
	saved, err := game.ToSaveState("existing full books", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Sparks", "Willow"} {
		if !reflect.DeepEqual(restored.spellBooks[name], game.spellBooks[name]) {
			t.Fatalf("%s lost learned spells during load", name)
		}
	}
}
