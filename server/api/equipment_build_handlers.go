package api

import (
	"encoding/json"
	"net/http"
)

type equipmentBuildRequest struct {
	Slot            int    `json:"slot"`
	ID              string `json:"build_id"`
	Name            string `json:"name"`
	Token           string `json:"token"`
	ConfirmTransfer bool   `json:"confirm_transfer"`
}

func (s *Server) handleEquipmentBuild(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req equipmentBuildRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	var err error
	switch r.PathValue("action") {
	case "save":
		err = game.SaveEquipmentBuild(req.Slot, req.ID, req.Name)
	case "delete":
		err = game.DeleteEquipmentBuild(req.Slot, req.ID)
	case "apply":
		err = game.ApplyEquipmentBuild(req.Slot, req.ID, req.Token, req.ConfirmTransfer)
	case "preview":
		var preview EquipmentBuildPreview
		preview, err = game.PreviewEquipmentBuild(req.Slot, req.ID)
		if err == nil {
			jsonResp(w, preview)
			return
		}
	default:
		httpError(w, "unknown build action", http.StatusNotFound)
		return
	}
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}
