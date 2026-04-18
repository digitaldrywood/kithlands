package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

type FormationUpdate struct {
	Slot int    `json:"slot"`
	Row  string `json:"row"`
}

type FormationUpdateRequest struct {
	Updates []FormationUpdate `json:"updates"`
	Reorder []int             `json:"reorder,omitempty"`
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

	state, err := game.UpdateFormation(req.Updates, req.Reorder)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonResp(w, state)
}

func validateFormationReorder(order []int, partySize int) error {
	if len(order) == 0 {
		return nil
	}
	if len(order) != partySize {
		return fmt.Errorf("reorder must list %d slots, got %d", partySize, len(order))
	}

	seen := make([]bool, partySize)
	for _, slot := range order {
		if slot < 0 || slot >= partySize {
			return fmt.Errorf("invalid formation reorder slot %d", slot)
		}
		if seen[slot] {
			return fmt.Errorf("duplicate formation reorder slot %d", slot)
		}
		seen[slot] = true
	}
	return nil
}

func reorderParty(party []*character.Character, order []int) []*character.Character {
	if len(order) == 0 {
		return party
	}
	reordered := make([]*character.Character, len(order))
	for slot, source := range order {
		reordered[slot] = party[source]
	}
	return reordered
}

func reorderEquipment(equipment [4]inventory.EquipmentSlots, order []int) [4]inventory.EquipmentSlots {
	if len(order) == 0 {
		return equipment
	}
	reordered := equipment
	for slot, source := range order {
		reordered[slot] = equipment[source]
	}
	return reordered
}

func (g *Game) UpdateFormation(updates []FormationUpdate, reorder []int) (*GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.phase == "combat" {
		return nil, fmt.Errorf("formation cannot be changed during combat")
	}

	if len(updates) == 0 && len(reorder) == 0 {
		state := g.stateUnlocked()
		return &state, nil
	}

	if err := validateFormationReorder(reorder, len(g.party)); err != nil {
		return nil, err
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

	if len(reorder) > 0 {
		g.party = reorderParty(g.party, reorder)
		if g.inv != nil {
			g.inv.Equipment = reorderEquipment(g.inv.Equipment, reorder)
		}
	}

	for slot, row := range rows {
		g.party[slot].Row = row
	}

	state := g.stateUnlocked()
	return &state, nil
}
