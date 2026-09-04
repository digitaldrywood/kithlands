package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/digitaldrywood/kithlands/internal/inventory"
)

type SocketGemRequest struct {
	InstanceID string `json:"instance_id"`
	Socket     int    `json:"socket"`
	GemID      string `json:"gem_id"`
	Token      string `json:"token"`
}

type GemChangeRequest struct {
	Action     string `json:"action"`
	InstanceID string `json:"instance_id"`
	Socket     int    `json:"socket"`
	GemID      string `json:"gem_id,omitempty"`
	Token      string `json:"token,omitempty"`
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
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		httpError(w, "expected one request", http.StatusBadRequest)
		return
	}
	if err := game.SocketGem(req); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleGemChange(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req GemChangeRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		httpError(w, "expected one request", http.StatusBadRequest)
		return
	}
	if err := game.ApplyGemChange(req); err != nil {
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
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		httpError(w, "expected one request", http.StatusBadRequest)
		return
	}
	if err := game.CraftGem(req); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (g *Game) SocketGem(req SocketGemRequest) error {
	return g.ApplyGemChange(GemChangeRequest{
		Action: inventory.GemActionSocket, InstanceID: req.InstanceID, Socket: req.Socket,
		GemID: req.GemID, Token: req.Token,
	})
}

func (g *Game) ApplyGemChange(req GemChangeRequest) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if req.InstanceID == "" {
		return fmt.Errorf("instance_id is required")
	}
	if req.Token == "" {
		return fmt.Errorf("this gem preview is stale; review the Workshop change again before applying")
	}
	preview, working := g.planGemChangeLocked(req)
	if preview.Token != req.Token {
		return fmt.Errorf("this gem preview is stale; review the Workshop change again before applying")
	}
	if !preview.Allowed || working == nil {
		return fmt.Errorf("cannot apply gem change: %s", preview.BlockReason)
	}
	g.inv = working
	return nil
}

func (g *Game) CraftGem(req CraftGemRequest) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.checkGemMutationLocked(); err != nil {
		return err
	}
	if req.RecipeID == "" {
		return fmt.Errorf("recipe_id is required")
	}
	return g.inv.CraftGem(req.RecipeID, g.maxPartyLevel(), g.gd)
}

func (g *Game) checkGemMutationLocked() error {
	if err := g.checkEquipmentMutationLocked(); err != nil {
		return fmt.Errorf("gems can only be changed outside battle")
	}
	return nil
}
