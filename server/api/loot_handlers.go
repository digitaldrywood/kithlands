package api

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type SocketGemRequest struct {
	InstanceID string `json:"instance_id"`
	Socket     int    `json:"socket"`
	GemID      string `json:"gem_id"`
}

type CraftGemRequest struct {
	RecipeID string `json:"recipe_id"`
}

func (s *Server) handleSocketGem(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req SocketGemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.SocketGem(req); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleCraftGem(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req CraftGemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.CraftGem(req); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (g *Game) SocketGem(req SocketGemRequest) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if req.InstanceID == "" || req.GemID == "" {
		return fmt.Errorf("instance_id and gem_id are required")
	}
	return g.inv.SocketGem(req.InstanceID, req.Socket, req.GemID, g.maxPartyLevel(), g.gd)
}

func (g *Game) CraftGem(req CraftGemRequest) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if req.RecipeID == "" {
		return fmt.Errorf("recipe_id is required")
	}
	return g.inv.CraftGem(req.RecipeID, g.maxPartyLevel(), g.gd)
}
