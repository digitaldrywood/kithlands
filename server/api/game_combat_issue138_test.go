package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// TestIssue138_ProcessActionRecoversFromPanic verifies that a panic inside
// the action handler is converted into a typed error instead of propagating
// to Go's default HTTP 500 path (which writes an empty body). Before the
// fix, the client's fetch().json() threw "Unexpected end of JSON input" and
// the Battle scene locked up because it had no state to transition on.
//
// The test injects a nil party member to force makeCombatants to deref a
// nil pointer. Any future regression that removes the recover or changes
// the error sentinel will fail this test.
func TestIssue138_ProcessActionRecoversFromPanic(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	enterCombat(t, game)

	// Force a nil-deref on the next combat action by dropping a nil into
	// the party slice. makeCombatants will then try to read
	// g.party[0].ClassID and panic.
	api.NilPartyMemberForTest(game, 0)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 1, Type: "attack", TargetID: 100},
		},
	})
	if err == nil {
		t.Fatalf("expected error from recovered panic, got state=%+v", state)
	}
	if state != nil {
		t.Errorf("expected nil state on recovered panic, got %+v", state)
	}
	if !api.IsErrInternalAction(err) {
		t.Errorf("expected ErrInternalAction, got %v", err)
	}

}

// TestIssue138_HandlerReturns500JSONOnPanic exercises the full HTTP path
// end-to-end: panic → recover → handler maps to 500 with a JSON body. The
// pre-fix behavior (Go's default mux recover + empty body) would leave the
// client parser throwing "Unexpected end of JSON input" — exactly the
// symptom captured on issue #138.
func TestIssue138_HandlerReturns500JSONOnPanic(t *testing.T) {
	srv, ts := testServer(t)
	defer ts.Close()

	// Create a game via the HTTP API.
	createResp := post(t, ts.URL+"/api/game/new", map[string]any{
		"town_name":    "Panicville",
		"big_building": "Town Hall",
		"people": []map[string]string{
			{"name": "Bob", "relation": "friendly"},
		},
		"places": []string{"School", "Store"},
		"party": []map[string]string{
			{"name": "Hero", "class_id": "warrior"},
			{"name": "Mage", "class_id": "cinder"},
		},
	})
	gameID, _ := createResp["id"].(string)
	if gameID == "" {
		t.Fatalf("no game id in create response: %+v", createResp)
	}

	// Trigger an encounter to get into combat phase.
	encResp := post(t, ts.URL+"/api/game/"+gameID+"/action", map[string]any{
		"type": "encounter",
	})
	if phase, _ := encResp["phase"].(string); phase != "combat" {
		t.Fatalf("expected combat phase, got %+v", encResp)
	}

	// Reach into the in-process manager to force a nil-deref on the next
	// combat action. This is exactly the hook production code panics on,
	// simulated in a controlled way so the test doesn't depend on a
	// seed-specific reproduction.
	game := srv.GetGameManager().GetGame(gameID)
	if game == nil {
		t.Fatalf("game %s not in manager", gameID)
	}
	api.NilPartyMemberForTest(game, 0)

	body, _ := json.Marshal(map[string]any{
		"type": "combat_round",
		"actions": []map[string]any{
			{"slot": 1, "type": "attack", "target_id": 100},
		},
	})
	res, err := http.Post(ts.URL+"/api/game/"+gameID+"/action", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post action: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", res.StatusCode)
	}
	respBytes, _ := io.ReadAll(res.Body)
	if len(respBytes) == 0 {
		t.Fatalf("empty 500 body — issue #138 regression")
	}
	var decoded map[string]any
	if err := json.Unmarshal(respBytes, &decoded); err != nil {
		t.Fatalf("500 body is not JSON: %v (body=%q)", err, string(respBytes))
	}
	errMsg, _ := decoded["error"].(string)
	if !strings.Contains(strings.ToLower(errMsg), "internal") {
		t.Errorf("expected error field to describe an internal error, got %q", errMsg)
	}
}

// TestIssue138_ManyConsecutiveFightsSmoke spams encounter → combat → advance
// many times as a belt-and-suspenders check: if any future change introduces
// a new panic on the walking-encounter/mid-combat path, the recover wraps
// it in ErrInternalAction and this test fails loudly.
func TestIssue138_ManyConsecutiveFightsSmoke(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
		{Name: "Rogue", ClassID: "rogue"},
		{Name: "Healer", ClassID: "mender"},
	})

	const maxAttempts = 500
	fights := 0
	for attempt := 0; attempt < maxAttempts && fights < 25; attempt++ {
		state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
		if err != nil {
			t.Fatalf("attempt %d: encounter error: %v (internal=%v)",
				attempt, err, api.IsErrInternalAction(err))
		}
		if state.Phase != "combat" {
			continue
		}
		fights++

		for round := 0; round < 60 && state.Phase == "combat"; round++ {
			state, err = game.ProcessAction(api.GameActionRequest{
				Type:    "combat_round",
				Actions: smokeActions(state),
			})
			if err != nil {
				t.Fatalf("fight %d round %d: error: %v (internal=%v)",
					fights, round, err, api.IsErrInternalAction(err))
			}
		}
		if state.Phase == "combat" {
			t.Fatalf("fight %d: combat did not resolve", fights)
		}
		if state.Phase == "quest_complete" {
			_, err = game.ProcessAction(api.GameActionRequest{Type: "advance"})
			if err != nil {
				t.Fatalf("advance: %v", err)
			}
		}
		if state.Phase == "defeat" {
			return
		}
	}
	if fights < 10 {
		t.Fatalf("expected at least 10 fights, got %d", fights)
	}
}

func smokeActions(state *api.GameState) []api.MemberActionReq {
	target := 0
	for _, e := range state.Enemies {
		if e.HP > 0 {
			target = e.ID
			break
		}
	}
	var out []api.MemberActionReq
	for i, p := range state.Party {
		if p.HP <= 0 {
			continue
		}
		out = append(out, api.MemberActionReq{
			Slot:     i,
			Type:     "attack",
			TargetID: target,
		})
	}
	return out
}
