package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/digitaldrywood/kithlands/internal/character"
)

type FormationUpdate struct {
	Slot int    `json:"slot"`
	Row  string `json:"row"`
}

type FormationUpdateRequest struct {
	Updates []FormationUpdate `json:"updates"`
}

func (s *Server) handleUpdateFormation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	game := s.games.GetGame(id)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req FormationUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	state, err := game.UpdateFormation(req.Updates)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonResp(w, state)
}

func (g *Game) UpdateFormation(updates []FormationUpdate) (*GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.phase == "combat" {
		return nil, fmt.Errorf("formation cannot be changed during combat")
	}

	if len(updates) == 0 {
		state := g.stateUnlocked()
		return &state, nil
	}

	rows := make(map[int]character.Row, len(updates))
	for _, update := range updates {
		if update.Slot < 0 || update.Slot >= len(g.party) {
			return nil, fmt.Errorf("invalid formation slot %d", update.Slot)
		}
		row := character.NormalizeRow(update.Row)
		if row == "" {
			return nil, fmt.Errorf("invalid formation row %q", update.Row)
		}
		rows[update.Slot] = row
	}

	for slot, row := range rows {
		g.party[slot].Row = row
	}

	state := g.stateUnlocked()
	return &state, nil
}
