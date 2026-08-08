package api

import (
	"encoding/json"
	"net/http"
)

type equipmentRecommendationRequest struct {
	Slot int    `json:"slot"`
	Goal string `json:"goal"`
}

func (s *Server) handleRecommendEquipment(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req equipmentRecommendationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	recommendation, err := game.RecommendEquipment(req.Slot, req.Goal)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, recommendation)
}

func (s *Server) handleApplyRecommendedEquipment(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req equipmentRecommendationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.ApplyRecommendedEquipment(req.Slot, req.Goal); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}
