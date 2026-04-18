package api

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func newFormationTestGame(t *testing.T, party []PartyMemberReq) *Game {
	t.Helper()
	gd := gamedata.Load("../../shared")
	gm := NewGameManager(gd, "../../shared")
	game, err := gm.CreateGame(NewGameRequest{
		TownName:    "Cadott",
		People:      []WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School"},
		BigBuilding: "Town Hall",
		Party:       party,
		Difficulty:  "normal",
		RNGSeed:     42,
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	return game
}

func TestUpdateFormationAndSaveRoundTrip(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{
		{Name: "Ayla", ClassID: "warrior"},
		{Name: "Mira", ClassID: "mender"},
	})

	state, err := game.UpdateFormation([]FormationUpdate{
		{Slot: 0, Row: "back"},
		{Slot: 1, Row: "front"},
	})
	if err != nil {
		t.Fatalf("UpdateFormation: %v", err)
	}
	if got := state.Party[0].Row; got != "back" {
		t.Fatalf("updated state row[0] = %q, want back", got)
	}
	if got := state.Party[1].Row; got != "front" {
		t.Fatalf("updated state row[1] = %q, want front", got)
	}

	ss, err := game.ToSaveState("formation", "test-user")
	if err != nil {
		t.Fatalf("ToSaveState: %v", err)
	}
	loaded, err := FromSaveState(ss, game.gd, game.loc)
	if err != nil {
		t.Fatalf("FromSaveState: %v", err)
	}

	if got := string(loaded.party[0].Row); got != "back" {
		t.Fatalf("loaded party[0].row = %q, want back", got)
	}
	if got := string(loaded.party[1].Row); got != "front" {
		t.Fatalf("loaded party[1].row = %q, want front", got)
	}
}

func TestFromSaveStateMigratesLegacyRows(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{
		{Name: "Ayla", ClassID: "warrior"},
		{Name: "Mira", ClassID: "mender"},
	})

	ss, err := game.ToSaveState("legacy-rows", "test-user")
	if err != nil {
		t.Fatalf("ToSaveState: %v", err)
	}

	var party []map[string]any
	if err := json.Unmarshal(ss.Party, &party); err != nil {
		t.Fatalf("unmarshal party: %v", err)
	}
	for _, member := range party {
		delete(member, "row")
	}
	partyJSON, err := json.Marshal(party)
	if err != nil {
		t.Fatalf("marshal party: %v", err)
	}
	ss.Party = partyJSON

	loaded, err := FromSaveState(ss, game.gd, game.loc)
	if err != nil {
		t.Fatalf("FromSaveState: %v", err)
	}

	if got := string(loaded.party[0].Row); got != "front" {
		t.Fatalf("legacy warrior row = %q, want front", got)
	}
	if got := string(loaded.party[1].Row); got != "back" {
		t.Fatalf("legacy mender row = %q, want back", got)
	}
}

func TestUpdateFormationRejectsCombatPhase(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{
		{Name: "Ayla", ClassID: "warrior"},
	})

	if _, err := game.ProcessAction(GameActionRequest{Type: "encounter"}); err != nil {
		t.Fatalf("encounter: %v", err)
	}

	if _, err := game.UpdateFormation([]FormationUpdate{{Slot: 0, Row: "back"}}); err == nil {
		t.Fatal("UpdateFormation during combat unexpectedly succeeded")
	}
	if got := string(game.party[0].Row); got != "front" {
		t.Fatalf("party row changed during combat: got %q want front", got)
	}
}

func TestUpdateFormationIsAtomicOnValidationError(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{
		{Name: "Ayla", ClassID: "warrior"},
		{Name: "Mira", ClassID: "mender"},
	})

	if _, err := game.UpdateFormation([]FormationUpdate{
		{Slot: 0, Row: "back"},
		{Slot: 1, Row: "sideways"},
	}); err == nil {
		t.Fatal("UpdateFormation unexpectedly accepted an invalid row")
	}

	if got := string(game.party[0].Row); got != "front" {
		t.Fatalf("party[0] row mutated after failed update: got %q want front", got)
	}
	if got := string(game.party[1].Row); got != "back" {
		t.Fatalf("party[1] row mutated after failed update: got %q want back", got)
	}
}
