package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func newSeededGameWithParty(t *testing.T, seed int64, party []api.PartyMemberReq) *api.Game {
	t.Helper()
	gd := gamedata.Load("../../shared")
	gm := api.NewGameManager(gd, "../../shared")
	game, err := gm.CreateGame(api.NewGameRequest{
		TownName:    "Cadott",
		People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party:       party,
		Difficulty:  "normal",
		RNGSeed:     seed,
	})
	if err != nil {
		t.Fatalf("create seeded game: %v", err)
	}
	return game
}

func combatActionDamage(state *api.GameState, kind string) int {
	for _, action := range state.CombatActions {
		if action.Kind == kind {
			return action.Damage
		}
	}
	return 0
}

func TestDefaultRowsSurfaceInPartyState(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Ayla", ClassID: "warrior"},
		{Name: "Mira", ClassID: "mender"},
		{Name: "Cato", ClassID: "cinder"},
		{Name: "Nia", ClassID: "rogue"},
	})

	state := game.State()
	want := []string{"front", "back", "back", "front"}
	for i, row := range want {
		if got := state.Party[i].Row; got != row {
			t.Fatalf("party[%d] row = %q, want %q", i, got, row)
		}
	}
}

func TestBackRowPartyMemberTakesLessPhysicalDamage(t *testing.T) {
	front := newSeededGameWithParty(t, 77, []api.PartyMemberReq{{Name: "Tank", ClassID: "warrior"}})
	back := newSeededGameWithParty(t, 77, []api.PartyMemberReq{{Name: "Tank", ClassID: "warrior"}})
	// Isolate row mitigation from the randomized starter armor roll.
	if err := front.UnequipItem(0, "body"); err != nil {
		t.Fatal(err)
	}
	if err := back.UnequipItem(0, "body"); err != nil {
		t.Fatal(err)
	}

	api.SetPartyRowForTest(front, 0, character.RowFront)
	api.SetPartyRowForTest(back, 0, character.RowBack)
	api.EnterCombatForTest(front, []string{"goblin"}, 1)
	api.EnterCombatForTest(back, []string{"goblin"}, 1)

	frontState, err := front.ProcessAction(api.GameActionRequest{Type: "wait"})
	if err != nil {
		t.Fatalf("front ProcessAction: %v", err)
	}
	backState, err := back.ProcessAction(api.GameActionRequest{Type: "wait"})
	if err != nil {
		t.Fatalf("back ProcessAction: %v", err)
	}

	frontDmg := combatActionDamage(frontState, "attack")
	backDmg := combatActionDamage(backState, "attack")
	if frontDmg <= 0 || backDmg <= 0 {
		t.Fatalf("expected enemy attacks, got front=%d back=%d", frontDmg, backDmg)
	}
	if backDmg >= frontDmg {
		t.Fatalf("back-row damage = %d, want less than front-row damage %d", backDmg, frontDmg)
	}
}

func TestMagicIgnoresRows(t *testing.T) {
	front := newSeededGameWithParty(t, 91, []api.PartyMemberReq{
		{Name: "Spark", ClassID: "cinder"},
		{Name: "Tank", ClassID: "warrior"},
	})
	back := newSeededGameWithParty(t, 91, []api.PartyMemberReq{
		{Name: "Spark", ClassID: "cinder"},
		{Name: "Tank", ClassID: "warrior"},
	})

	api.SetPartyRowForTest(front, 0, character.RowFront)
	api.SetPartyRowForTest(back, 0, character.RowBack)
	enterCombat(t, front)
	enterCombat(t, back)

	targetID := front.State().Enemies[0].ID
	frontState, err := front.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "spark", TargetID: targetID},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("front spell cast: %v", err)
	}
	backState, err := back.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "spark", TargetID: targetID},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("back spell cast: %v", err)
	}

	frontDmg := combatActionDamage(frontState, "spell")
	backDmg := combatActionDamage(backState, "spell")
	if frontDmg != backDmg {
		t.Fatalf("magic damage changed with row: front=%d back=%d", frontDmg, backDmg)
	}
}

func TestCombatItemsIgnoreRows(t *testing.T) {
	front := newSeededGameWithParty(t, 123, []api.PartyMemberReq{{Name: "Tank", ClassID: "warrior"}})
	back := newSeededGameWithParty(t, 123, []api.PartyMemberReq{{Name: "Tank", ClassID: "warrior"}})

	api.SetPartyRowForTest(front, 0, character.RowFront)
	api.SetPartyRowForTest(back, 0, character.RowBack)
	enterCombat(t, front)
	enterCombat(t, back)
	api.DamagePartyForTest(front, 0, 10)
	api.DamagePartyForTest(back, 0, 10)

	frontState, err := front.ProcessAction(api.GameActionRequest{
		Type:    "attack",
		Actions: []api.MemberActionReq{{Slot: 0, Type: "item", ItemID: "potion", TargetID: 0}},
	})
	if err != nil {
		t.Fatalf("front item use: %v", err)
	}
	backState, err := back.ProcessAction(api.GameActionRequest{
		Type:    "attack",
		Actions: []api.MemberActionReq{{Slot: 0, Type: "item", ItemID: "potion", TargetID: 0}},
	})
	if err != nil {
		t.Fatalf("back item use: %v", err)
	}

	frontHeal := combatActionDamage(frontState, "item")
	backHeal := combatActionDamage(backState, "item")
	if frontHeal != backHeal {
		t.Fatalf("item heal changed with row: front=%d back=%d", frontHeal, backHeal)
	}
}
