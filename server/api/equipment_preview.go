package api

import (
	"encoding/json"
	"net/http"
)

type EquipmentPreviewRequest struct {
	Slot          int    `json:"slot"`
	EquipmentSlot string `json:"equipment_slot"`
	ItemID        string `json:"item_id"`
	Type          string `json:"type"`
}

type EquipmentPreviewState struct {
	Before map[string]int `json:"before"`
	After  map[string]int `json:"after"`
	Deltas map[string]int `json:"deltas"`
	// PartyAfter also describes the donor when an equipped instance is moved.
	PartyAfter []map[string]int `json:"party_after"`
}

// PreviewEquipment runs the real equip validation on a disposable inventory.
// Neither ownership nor character growth/resources can change during preview.
func (g *Game) PreviewEquipment(req EquipmentPreviewRequest) (EquipmentPreviewState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	proposed := &Game{party: g.party, inv: g.inv.Clone(), gd: g.gd, phase: g.phase}
	if err := proposed.EquipItemAt(req.Slot, req.EquipmentSlot, req.ItemID, req.Type); err != nil {
		return EquipmentPreviewState{}, err
	}
	before := g.inv.ResolveEffectiveStats(g.party[req.Slot], req.Slot, g.gd).Values()
	after := proposed.inv.ResolveEffectiveStats(g.party[req.Slot], req.Slot, g.gd).Values()
	preview := EquipmentPreviewState{Before: before, After: after, Deltas: statDeltas(before, after)}
	for i, c := range g.party {
		preview.PartyAfter = append(preview.PartyAfter, proposed.inv.ResolveEffectiveStats(c, i, g.gd).Values())
	}
	return preview, nil
}

func (s *Server) handlePreviewEquipment(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req EquipmentPreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	preview, err := game.PreviewEquipment(req)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, preview)
}
