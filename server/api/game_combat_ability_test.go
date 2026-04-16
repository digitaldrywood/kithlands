package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// Helper: create a game directly (no HTTP) with a fixed party composition.
func newGameWithParty(t *testing.T, party []api.PartyMemberReq) *api.Game {
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
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	return game
}

// Drive the game into combat and return the state so the test can issue
// ability actions against whatever formation was spawned.
func enterCombat(t *testing.T, game *api.Game) *api.GameState {
	t.Helper()
	// The "default" world action triggers an encounter.
	state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
	if err != nil {
		t.Fatalf("encounter: %v", err)
	}
	if state.Phase != "combat" {
		t.Fatalf("phase after encounter: %q, want combat", state.Phase)
	}
	api.SetEncounterStartForTest(game, combat.EncounterStartNormal)
	return state
}

func TestPartyStateSurfacesClassAbilities(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Bruiser", ClassID: "brawler"},
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Jack", ClassID: "wayfarer"},
		{Name: "Tank", ClassID: "warrior"},
	})
	state := game.State()

	wantAbilities := map[string][]string{
		"brawler":  {"focus", "counter"},
		"rogue":    {"steal", "backstab"},
		"wayfarer": {"inspire"},
		"warrior":  nil,
	}
	for _, pm := range state.Party {
		want := wantAbilities[pm.ClassID]
		if len(want) == 0 {
			if len(pm.Abilities) != 0 {
				t.Errorf("%s (%s): unexpected abilities %v", pm.Name, pm.ClassID, pm.Abilities)
			}
			continue
		}
		if len(pm.Abilities) != len(want) {
			t.Errorf("%s (%s): abilities=%v want=%v", pm.Name, pm.ClassID, pm.Abilities, want)
			continue
		}
		for i, a := range want {
			if pm.Abilities[i] != a {
				t.Errorf("%s (%s): abilities[%d]=%q want %q", pm.Name, pm.ClassID, i, pm.Abilities[i], a)
			}
		}
	}

	// Non-promoted characters should display the base class id as sprite and
	// base name. Promoted=false.
	for _, pm := range state.Party {
		if pm.Promoted {
			t.Errorf("%s should not be promoted at start", pm.Name)
		}
		if pm.SpriteID != pm.ClassID {
			t.Errorf("%s sprite_id=%q, want %q", pm.Name, pm.SpriteID, pm.ClassID)
		}
	}
}

func TestBrawlerFocusLogsAnAbilityLine(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Bruiser", ClassID: "brawler"},
		{Name: "Tank", ClassID: "warrior"},
	})
	enterCombat(t, game)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "ability", AbilityID: "focus"},
			{Slot: 1, Type: "attack"},
		},
	})
	if err != nil {
		t.Fatalf("ability action: %v", err)
	}

	sawFocusLog := false
	for _, line := range state.CombatLog {
		if contains(line, "Bruiser focuses") {
			sawFocusLog = true
			break
		}
	}
	if !sawFocusLog {
		t.Errorf("combat log missing focus entry; got %v", state.CombatLog)
	}
}

func TestWayfarerInspireLogsAnAbilityLine(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Jack", ClassID: "wayfarer"},
		{Name: "Tank", ClassID: "warrior"},
	})
	enterCombat(t, game)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "ability", AbilityID: "inspire"},
			{Slot: 1, Type: "attack"},
		},
	})
	if err != nil {
		t.Fatalf("ability action: %v", err)
	}

	sawInspire := false
	for _, line := range state.CombatLog {
		if contains(line, "inspires the party") {
			sawInspire = true
			break
		}
	}
	if !sawInspire {
		t.Errorf("combat log missing inspire entry; got %v", state.CombatLog)
	}
}

func TestRogueStealEmitsLogLine(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Tank", ClassID: "warrior"},
	})
	enterCombat(t, game)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "ability", AbilityID: "steal"},
			{Slot: 1, Type: "attack"},
		},
	})
	if err != nil {
		t.Fatalf("ability action: %v", err)
	}

	sawSteal := false
	for _, line := range state.CombatLog {
		if contains(line, "Sneak steals") || contains(line, "Sneak tries to steal") {
			sawSteal = true
			break
		}
	}
	if !sawSteal {
		t.Errorf("combat log missing steal entry; got %v", state.CombatLog)
	}
}
