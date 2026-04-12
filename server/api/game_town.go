package api

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// handleTownCollect handles POST /api/game/{id}/town/collect.
// The client sends the node_id, a deterministic item_key, and the building
// tags so the server can pick a tier-appropriate reward. The key is recorded
// in collectedHiddenItems so the item cannot be picked up twice.
func (s *Server) handleTownCollect(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req struct {
		NodeID  string   `json:"node_id"`
		ItemKey string   `json:"item_key"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.NodeID == "" || req.ItemKey == "" {
		httpError(w, "node_id and item_key required", http.StatusBadRequest)
		return
	}

	msg, err := game.collectHiddenItem(req.ItemKey, req.Tags)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	state := game.State()
	state.Message = msg
	jsonResp(w, state)
}

// collectHiddenItem validates the key, picks a reward, adds it to inventory,
// and marks the key as collected. Returns a human-readable message.
func (g *Game) collectHiddenItem(itemKey string, tags []string) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.collectedHiddenItems[itemKey] {
		return "", fmt.Errorf("already collected")
	}

	tagSet := make(map[string]bool, len(tags))
	for _, t := range tags {
		tagSet[t] = true
	}

	itemID, gold := pickHiddenItemReward(tagSet, g.currentQ, hashStr(itemKey))
	g.collectedHiddenItems[itemKey] = true

	if gold > 0 {
		g.inv.Gold += gold
		return fmt.Sprintf("Found %d gold!", gold), nil
	}

	g.inv.Consumables[itemID]++
	name := itemID
	if c := g.findConsumable(itemID); c != nil {
		name = c.Name
	}
	return fmt.Sprintf("Found %s!", name), nil
}

// pickHiddenItemReward selects a consumable ID (or gold amount) based on the
// building type tags, the current quest index (tier), and a seed for
// deterministic variety across items within the same room.
func pickHiddenItemReward(tags map[string]bool, questIdx int, seed uint64) (itemID string, gold int) {
	type reward struct {
		id   string
		gold int
	}

	// Build a pool biased by room type and quest tier.
	var pool []reward

	switch {
	case questIdx >= 6: // tier 3
		pool = []reward{
			{id: "hi_potion"}, {id: "hi_ether"}, {id: "x_ether"},
			{id: "phoenix_down"}, {gold: 300},
		}
	case questIdx >= 3: // tier 2
		pool = []reward{
			{id: "hi_potion"}, {id: "ether"}, {id: "phoenix_down"},
			{id: "antidote"}, {gold: 150},
		}
	default: // tier 1
		pool = []reward{
			{id: "potion"}, {id: "potion"}, {id: "antidote"},
			{id: "ether"}, {gold: 50},
		}
	}

	// Room-type bias: push a thematic item to the front so it's more likely.
	switch {
	case tags["shop"] || tags["commerce"]:
		pool = append([]reward{{gold: pool[len(pool)-1].gold}}, pool...)
	case tags["rest"]:
		pool = append([]reward{{id: "ether"}}, pool...)
	case tags["temple"] || tags["revive"]:
		pool = append([]reward{{id: "phoenix_down"}}, pool...)
	}

	pick := pool[seed%uint64(len(pool))]
	return pick.id, pick.gold
}

// hashStr is a simple djb2 hash for deterministic selection.
func hashStr(s string) uint64 {
	var h uint64 = 5381
	for _, c := range s {
		h = h*33 + uint64(c)
	}
	return h
}
