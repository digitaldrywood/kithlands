package api

// HTTP handlers for the dev-only feature-trigger API. These routes are
// registered by RegisterRoutes only when KITHLANDS_DEBUG=1 is set in the
// environment, so production builds never expose them. They are still
// behind the auth middleware — a leaked env var alone is not enough to
// reach them.

import (
	"encoding/json"
	"net/http"
	"os"
)

// DebugEnabled reports whether the debug routes should be registered.
// Exposed so tests can flip it without touching os.Setenv for every run.
func DebugEnabled() bool {
	return os.Getenv("KITHLANDS_DEBUG") == "1"
}

func (s *Server) registerDebugRoutes(mux *http.ServeMux) {
	mux.Handle("POST /api/debug/game/{id}/force-encounter-start", s.auth.Middleware(http.HandlerFunc(s.handleDebugForceEncounterStart)))
	mux.Handle("POST /api/debug/game/{id}/force-encounter", s.auth.Middleware(http.HandlerFunc(s.handleDebugForceEncounter)))
	mux.Handle("POST /api/debug/game/{id}/force-victory", s.auth.Middleware(http.HandlerFunc(s.handleDebugForceVictory)))
	mux.Handle("POST /api/debug/game/{id}/give-item", s.auth.Middleware(http.HandlerFunc(s.handleDebugGiveItem)))
	mux.Handle("POST /api/debug/game/{id}/set-gold", s.auth.Middleware(http.HandlerFunc(s.handleDebugSetGold)))
	mux.Handle("POST /api/debug/game/{id}/heal-party", s.auth.Middleware(http.HandlerFunc(s.handleDebugHealParty)))
	mux.Handle("POST /api/debug/game/{id}/set-party-levels", s.auth.Middleware(http.HandlerFunc(s.handleDebugSetPartyLevels)))
	mux.Handle("POST /api/debug/game/{id}/set-party-vitals", s.auth.Middleware(http.HandlerFunc(s.handleDebugSetPartyVitals)))
	mux.Handle("POST /api/debug/game/{id}/warp-quest", s.auth.Middleware(http.HandlerFunc(s.handleDebugWarpQuest)))
}

func (s *Server) handleDebugForceEncounterStart(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req struct {
		Start string `json:"start"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.DebugForceEncounterStart(req.Start); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleDebugForceEncounter(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req struct {
		MonsterIDs []string `json:"monster_ids"`
		Level      int      `json:"level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.DebugForceEncounter(req.MonsterIDs, req.Level); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleDebugForceVictory(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	if err := game.DebugForceVictory(); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleDebugGiveItem(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req struct {
		ItemID string `json:"item_id"`
		Qty    int    `json:"qty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.DebugGiveItem(req.ItemID, req.Qty); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleDebugSetGold(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req struct {
		Gold int `json:"gold"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.DebugSetGold(req.Gold); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleDebugHealParty(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	game.DebugHealParty()
	jsonResp(w, game.State())
}

func (s *Server) handleDebugSetPartyVitals(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req struct {
		Updates []DebugPartyVitalsUpdate `json:"updates"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.DebugSetPartyVitals(req.Updates); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleDebugSetPartyLevels(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req struct {
		Updates []DebugPartyLevelUpdate `json:"updates"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.DebugSetPartyLevels(req.Updates); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleDebugWarpQuest(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req struct {
		QuestIdx int `json:"quest_idx"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.DebugWarpQuest(req.QuestIdx); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

// handleGetItems is a non-debug read-only catalog endpoint. It's declared
// here because the debug panel is its primary consumer, but it stays
// registered unconditionally so production UIs can use it too.
func (s *Server) handleGetItems(w http.ResponseWriter, r *http.Request) {
	jsonResp(w, s.gd.Items)
}
