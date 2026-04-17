package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// debugTestServer wires the debug handlers onto a mux directly. Production
// registration goes through s.auth.Middleware, but the existing test
// server pattern (game_test.go:testServer) skips auth for game logic tests,
// so we follow the same pattern here. The env-var gating is exercised
// separately by TestDebugRoutes_GatedByEnv below.
func debugTestServer(t *testing.T) (*api.Server, *httptest.Server) {
	t.Helper()
	gd := gamedata.Load("../../shared")
	srv := api.NewServer(nil, gd, "../../shared")
	mux := http.NewServeMux()

	getGame := func(r *http.Request) *api.Game {
		return srv.GetGameManager().GetGame(r.PathValue("id"))
	}

	writeErr := func(w http.ResponseWriter, msg string, code int) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
	}
	writeJSON := func(w http.ResponseWriter, v any) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(v)
	}

	// /api/game/new so tests can create a game.
	mux.HandleFunc("POST /api/game/new", func(w http.ResponseWriter, r *http.Request) {
		var req api.NewGameRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		game, err := srv.GetGameManager().CreateGame(req)
		if err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})

	// Debug routes — mirror registerDebugRoutes but without auth middleware
	// so the test can hit them directly.
	mux.HandleFunc("POST /api/debug/game/{id}/force-encounter-start", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		var req struct{ Start string }
		_ = json.NewDecoder(r.Body).Decode(&req)
		if err := game.DebugForceEncounterStart(req.Start); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})
	mux.HandleFunc("POST /api/debug/game/{id}/force-encounter", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		var req struct {
			MonsterIDs []string `json:"monster_ids"`
			Level      int      `json:"level"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if err := game.DebugForceEncounter(req.MonsterIDs, req.Level); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})
	mux.HandleFunc("POST /api/debug/game/{id}/force-victory", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		if err := game.DebugForceVictory(); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})
	mux.HandleFunc("POST /api/debug/game/{id}/give-item", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		var req struct {
			ItemID string `json:"item_id"`
			Qty    int    `json:"qty"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if err := game.DebugGiveItem(req.ItemID, req.Qty); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})
	mux.HandleFunc("POST /api/debug/game/{id}/set-gold", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		var req struct {
			Gold int `json:"gold"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if err := game.DebugSetGold(req.Gold); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})
	mux.HandleFunc("POST /api/debug/game/{id}/heal-party", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		game.DebugHealParty()
		writeJSON(w, game.State())
	})
	mux.HandleFunc("POST /api/debug/game/{id}/set-party-vitals", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		var req struct {
			Updates []api.DebugPartyVitalsUpdate `json:"updates"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if err := game.DebugSetPartyVitals(req.Updates); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})
	mux.HandleFunc("POST /api/debug/game/{id}/set-party-levels", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		var req struct {
			Updates []api.DebugPartyLevelUpdate `json:"updates"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if err := game.DebugSetPartyLevels(req.Updates); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})
	mux.HandleFunc("POST /api/debug/game/{id}/warp-quest", func(w http.ResponseWriter, r *http.Request) {
		game := getGame(r)
		if game == nil {
			writeErr(w, "not found", http.StatusNotFound)
			return
		}
		var req struct {
			QuestIdx int `json:"quest_idx"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if err := game.DebugWarpQuest(req.QuestIdx); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, game.State())
	})

	// Public items endpoint (unconditionally registered in router.go).
	mux.HandleFunc("GET /api/data/items", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, gd.Items)
	})

	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return srv, ts
}

// newGameViaHTTP mirrors the pattern used in game_test.go but without
// importing it. We post a minimal 2-member party and return the game ID.
func newGameViaHTTP(t *testing.T, ts *httptest.Server) string {
	t.Helper()
	body := []byte(`{"party":[{"name":"Bruno","class_id":"warrior"},{"name":"Nia","class_id":"warrior"}]}`)
	resp, err := http.Post(ts.URL+"/api/game/new", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("create game status %d: %s", resp.StatusCode, raw)
	}
	var state map[string]any
	_ = json.Unmarshal(raw, &state)
	id, _ := state["id"].(string)
	if id == "" {
		t.Fatalf("no game id in response: %s", raw)
	}
	return id
}

func postDebugJSON(t *testing.T, ts *httptest.Server, path, body string) (int, []byte) {
	t.Helper()
	resp, err := http.Post(ts.URL+path, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, raw
}

func TestDebug_ForceEncounter_ThenForceAmbush(t *testing.T) {
	srv, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)

	// Force an encounter first — DebugForceEncounterStart requires combat phase.
	status, body := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/force-encounter",
		`{"monster_ids":["slime"],"level":1}`)
	if status != http.StatusOK {
		t.Fatalf("force-encounter: status=%d body=%s", status, body)
	}

	status, body = postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/force-encounter-start",
		`{"start":"ambush"}`)
	if status != http.StatusOK {
		t.Fatalf("force-encounter-start: status=%d body=%s", status, body)
	}

	// Round-0 state should surface the ambush marker — same contract the
	// c9be154 regression pins, reached via the HTTP debug surface now.
	var state map[string]any
	_ = json.Unmarshal(body, &state)
	if got, _ := state["encounter_start"].(string); got != "ambush" {
		t.Errorf("encounter_start round 0 = %q, want %q", got, "ambush")
	}

	// Verify at the Game level too that combatRound was reset.
	game := srv.GetGameManager().GetGame(gameID)
	if got := api.CombatRoundForTest(game); got != 0 {
		t.Errorf("combatRound after force-encounter-start = %d, want 0", got)
	}
	if got := api.EncounterStartForTest(game); got != combat.EncounterStartAmbush {
		t.Errorf("encounterStart = %q, want ambush", got)
	}
}

func TestDebug_ForceEncounterStart_RejectsNonCombat(t *testing.T) {
	_, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)

	status, body := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/force-encounter-start",
		`{"start":"ambush"}`)
	if status != http.StatusBadRequest {
		t.Errorf("expected 400 in world phase, got %d (%s)", status, body)
	}
}

func TestDebug_ForceVictory_ResolvesEncounter(t *testing.T) {
	_, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)

	code, body := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/force-encounter",
		`{"monster_ids":["slime"],"level":8}`)
	if code != http.StatusOK {
		t.Fatalf("force-encounter: got %d (%s)", code, body)
	}

	code, body = postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/force-victory",
		`{}`)
	if code != http.StatusOK {
		t.Fatalf("force-victory: got %d (%s)", code, body)
	}

	var state map[string]any
	_ = json.Unmarshal(body, &state)
	if got, _ := state["phase"].(string); got == "combat" {
		t.Fatalf("phase after force-victory = %q, want non-combat", got)
	}
	log, _ := state["combat_log"].([]any)
	foundVictory := false
	for _, raw := range log {
		line, _ := raw.(string)
		if strings.Contains(line, "Victory!") {
			foundVictory = true
			break
		}
	}
	if !foundVictory {
		t.Fatalf("combat log missing victory line: %+v", log)
	}
}

func TestDebug_GiveItem_AddsConsumable(t *testing.T) {
	srv, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)
	game := srv.GetGameManager().GetGame(gameID)

	// Unknown item should 400.
	if code, _ := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/give-item",
		`{"item_id":"definitely_not_real","qty":3}`); code != http.StatusBadRequest {
		t.Errorf("unknown item: expected 400, got %d", code)
	}

	// Known item should add the requested quantity.
	code, _ := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/give-item",
		`{"item_id":"phoenix_down","qty":3}`)
	if code != http.StatusOK {
		t.Fatalf("give-item: got %d", code)
	}
	if !api.HasPhoenixDownForTest(game) {
		t.Errorf("phoenix_down not present in inventory after give-item")
	}
}

func TestDebug_SetGold_OverridesPartyGold(t *testing.T) {
	_, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)

	code, body := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/set-gold",
		`{"gold":450}`)
	if code != http.StatusOK {
		t.Fatalf("set-gold: got %d (%s)", code, body)
	}

	var state map[string]any
	_ = json.Unmarshal(body, &state)
	if got := int(state["gold"].(float64)); got != 450 {
		t.Fatalf("gold after set-gold = %d, want 450", got)
	}

	code, _ = postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/set-gold",
		`{"gold":-1}`)
	if code != http.StatusBadRequest {
		t.Fatalf("negative gold should 400, got %d", code)
	}
}

func TestDebug_SetPartyLevels_OverridesDisplayedLevels(t *testing.T) {
	_, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)

	code, body := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/set-party-levels",
		`{"updates":[{"slot":0,"level":4},{"slot":1,"level":7}]}`)
	if code != http.StatusOK {
		t.Fatalf("set-party-levels: got %d (%s)", code, body)
	}

	var state map[string]any
	_ = json.Unmarshal(body, &state)
	party, _ := state["party"].([]any)
	if got := int(party[0].(map[string]any)["level"].(float64)); got != 4 {
		t.Fatalf("party[0] level = %d, want 4", got)
	}
	if got := int(party[1].(map[string]any)["level"].(float64)); got != 7 {
		t.Fatalf("party[1] level = %d, want 7", got)
	}

	code, _ = postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/set-party-levels",
		`{"updates":[{"slot":0,"level":0}]}`)
	if code != http.StatusBadRequest {
		t.Fatalf("invalid level should 400, got %d", code)
	}
}

func TestDebug_HealParty_RestoresHPMP(t *testing.T) {
	srv, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)
	game := srv.GetGameManager().GetGame(gameID)

	// Drop the first member's HP and MP to known-low values.
	api.DamagePartyForTest(game, 0, 999)   // floors at 1
	api.DamagePartyMPForTest(game, 0, 999) // floors at 0

	if hp := api.PartyHPForTest(game, 0); hp != 1 {
		t.Fatalf("precondition HP=%d, want 1", hp)
	}

	code, _ := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/heal-party", `{}`)
	if code != http.StatusOK {
		t.Fatalf("heal-party: got %d", code)
	}
	if hp, max := api.PartyHPForTest(game, 0), api.PartyMaxHPForTest(game, 0); hp != max {
		t.Errorf("party HP after heal = %d/%d, want full", hp, max)
	}
	if mp, max := api.PartyMPForTest(game, 0), api.PartyMaxMPForTest(game, 0); mp != max {
		t.Errorf("party MP after heal = %d/%d, want full", mp, max)
	}
}

func TestDebug_HealParty_LeavesDeadMembersDead(t *testing.T) {
	srv, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)
	game := srv.GetGameManager().GetGame(gameID)

	api.KillPartyMemberForTest(game, 1)

	postDebugJSON(t, ts, "/api/debug/game/"+gameID+"/heal-party", `{}`)

	if status := api.PartyStatusForTest(game, 1); status != character.StatusDeath {
		t.Errorf("dead member status after heal-party = %q, want death", status)
	}
	if hp := api.PartyHPForTest(game, 1); hp != 0 {
		t.Errorf("dead member HP after heal-party = %d, want 0", hp)
	}
}

func TestDebug_SetPartyVitals_OverridesStats(t *testing.T) {
	srv, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)
	game := srv.GetGameManager().GetGame(gameID)

	code, body := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/set-party-vitals",
		`{"updates":[{"slot":0,"hp":3,"mp":0,"status":"poison"},{"slot":1,"hp":0}]}`)
	if code != http.StatusOK {
		t.Fatalf("set-party-vitals: got %d (%s)", code, body)
	}
	if hp := api.PartyHPForTest(game, 0); hp != 3 {
		t.Errorf("slot 0 HP = %d, want 3", hp)
	}
	if mp := api.PartyMPForTest(game, 0); mp != 0 {
		t.Errorf("slot 0 MP = %d, want 0", mp)
	}
	if status := api.PartyStatusForTest(game, 0); status != character.StatusPoison {
		t.Errorf("slot 0 status = %q, want poison", status)
	}
	if hp := api.PartyHPForTest(game, 1); hp != 0 {
		t.Errorf("slot 1 HP = %d, want 0", hp)
	}
	if status := api.PartyStatusForTest(game, 1); status != character.StatusDeath {
		t.Errorf("slot 1 status = %q, want death", status)
	}
}

func TestDebug_WarpQuest_ClampsOutOfRange(t *testing.T) {
	srv, ts := debugTestServer(t)
	gameID := newGameViaHTTP(t, ts)
	game := srv.GetGameManager().GetGame(gameID)

	code, _ := postDebugJSON(t, ts,
		"/api/debug/game/"+gameID+"/warp-quest",
		`{"quest_idx":9999}`)
	if code != http.StatusOK {
		t.Fatalf("warp-quest: got %d", code)
	}
	// After clamping, currentQ should be len(quests).
	if got := api.CurrentQuestForTest(game); got != api.QuestCountForTest(game) {
		t.Errorf("currentQ after warp to huge idx = %d, want %d (len)", got, api.QuestCountForTest(game))
	}
}

func TestDebugRoutes_GatedByEnv(t *testing.T) {
	// When KITHLANDS_DEBUG is unset, the debug routes must not be registered
	// even on the real RegisterRoutes path. We assert this by spinning up a
	// real Server + mux without setting the env var.
	t.Setenv("KITHLANDS_DEBUG", "")
	if api.DebugEnabled() {
		t.Fatal("DebugEnabled() true with unset env — helper regressed")
	}
	t.Setenv("KITHLANDS_DEBUG", "1")
	if !api.DebugEnabled() {
		t.Fatal("DebugEnabled() false with KITHLANDS_DEBUG=1")
	}
}

func TestGetItems_ReturnsConsumableList(t *testing.T) {
	_, ts := debugTestServer(t)
	resp, err := http.Get(ts.URL + "/api/data/items")
	if err != nil {
		t.Fatalf("GET /api/data/items: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var body struct {
		Consumables []struct {
			ID string `json:"id"`
		} `json:"consumables"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	// Sanity: at least potion and phoenix_down exist.
	seen := map[string]bool{}
	for _, c := range body.Consumables {
		seen[c.ID] = true
	}
	for _, want := range []string{"potion", "phoenix_down", "ether"} {
		if !seen[want] {
			t.Errorf("consumables missing %q", want)
		}
	}
}
