package api

import (
	"net/http"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// NPCDialogueResponse is returned by the NPC talk endpoint.
type NPCDialogueResponse struct {
	NPCName string   `json:"npc_name"`
	Sprite  string   `json:"sprite"`
	Lines   []string `json:"lines"`
}

func (s *Server) handleNPCTalk(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	nodeID := r.PathValue("nodeId")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	resp := game.GetNPCDialogue(nodeID)
	if resp == nil {
		httpError(w, "npc not found", http.StatusNotFound)
		return
	}

	jsonResp(w, resp)
}

// GetNPCDialogue returns dialogue for the NPC at the given node.
func (g *Game) GetNPCDialogue(nodeID string) *NPCDialogueResponse {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.loc == nil {
		return nil
	}

	node := g.loc.NodeByID(nodeID)
	if node == nil {
		return nil
	}

	return buildDialogue(node, g.loc.Name)
}

func buildDialogue(node *locality.Node, townName string) *NPCDialogueResponse {
	tags := node.Tags
	tagSet := make(map[string]bool, len(tags))
	for _, t := range tags {
		tagSet[t] = true
	}

	switch {
	case tagSet["shop"] || tagSet["commerce"] && !tagSet["rest"]:
		return &NPCDialogueResponse{
			NPCName: "Merchant",
			Sprite:  "npc_merchant",
			Lines: []string{
				"Welcome to " + node.Name + "!",
				"We have the finest goods in " + townName + ".",
				"Browse our wares -- you'll find weapons, armor, and supplies.",
				"Come back any time, adventurer!",
			},
		}

	case tagSet["rest"]:
		return &NPCDialogueResponse{
			NPCName: "Innkeeper",
			Sprite:  "npc_innkeeper",
			Lines: []string{
				"Welcome to " + node.Name + ", weary traveler.",
				"A warm bed and hot meal await you here.",
				"Rest well -- the road ahead is long.",
			},
		}

	case tagSet["temple"] || tagSet["revive"]:
		return &NPCDialogueResponse{
			NPCName: "Priestess",
			Sprite:  "npc_priestess",
			Lines: []string{
				"Blessings upon you, child of light.",
				"The temple watches over " + townName + ".",
				"May your wounds be healed and your spirit renewed.",
			},
		}

	case node.Kind == locality.NodePerson:
		name := node.Name
		if node.Personality != "" {
			return &NPCDialogueResponse{
				NPCName: name,
				Sprite:  "npc_elder",
				Lines: []string{
					"Greetings! I'm " + name + ".",
					node.Personality,
					"Good luck on your journey through " + townName + "!",
				},
			}
		}
		return &NPCDialogueResponse{
			NPCName: name,
			Sprite:  "npc_elder",
			Lines: []string{
				"Greetings! I'm " + name + ".",
				"Things have been strange around " + townName + " lately...",
				"Be careful out there, adventurer.",
			},
		}

	default:
		return &NPCDialogueResponse{
			NPCName: "Guard",
			Sprite:  "npc_guard",
			Lines: []string{
				"Welcome to " + node.Name + ".",
				"Keep your wits about you in " + townName + ".",
				"Safe travels, adventurer.",
			},
		}
	}
}
