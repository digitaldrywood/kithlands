package api

import (
	"hash/fnv"
	"math/rand/v2"
	"net/http"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
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
// nodeID may include a sub-NPC suffix like "_npc1" to allow multiple NPCs in
// the same building to have distinct dialogue. The suffix is stripped for the
// node lookup but retained as the seed key so each NPC gets unique lines.
func (g *Game) GetNPCDialogue(nodeID string) *NPCDialogueResponse {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.loc == nil {
		return nil
	}

	// Support sub-NPC indices: "inn_npc1" → base "inn", seedID stays "inn_npc1".
	baseID := nodeID
	if idx := strings.LastIndex(nodeID, "_npc"); idx > 0 {
		suffix := nodeID[idx+4:]
		if len(suffix) > 0 && isDigits(suffix) {
			baseID = nodeID[:idx]
		}
	}

	node := g.loc.NodeByID(baseID)
	if node == nil {
		return nil
	}

	return buildDialogue(node, g.loc.Name, g.id, g.gd.Dialogue, nodeID)
}

// isDigits reports whether s consists entirely of ASCII decimal digits.
func isDigits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// pickLines selects n lines deterministically from the archetype pool using
// hash(gameID + nodeID) as seed. The same NPC always says the same things
// within a save, but different saves produce different selections.
func pickLines(archetype string, pool gamedata.DialoguePool, gameID, nodeID string, n int) []string {
	arch, ok := pool.Archetypes[archetype]
	if !ok || len(arch.Lines) == 0 {
		return nil
	}

	h := fnv.New64a()
	h.Write([]byte(gameID))
	h.Write([]byte(nodeID))
	seed := h.Sum64()

	rng := rand.New(rand.NewPCG(seed, 0))

	// Fisher-Yates shuffle on indices, pick first n.
	indices := make([]int, len(arch.Lines))
	for i := range indices {
		indices[i] = i
	}
	rng.Shuffle(len(indices), func(i, j int) {
		indices[i], indices[j] = indices[j], indices[i]
	})

	if n > len(indices) {
		n = len(indices)
	}
	lines := make([]string, n)
	for i := 0; i < n; i++ {
		lines[i] = arch.Lines[indices[i]].Text
	}
	return lines
}

// buildDialogue constructs an NPCDialogueResponse for the given node. seedID is
// used as the RNG seed key; it may differ from node.ID when a sub-NPC suffix
// like "_npc1" is present, ensuring distinct lines per NPC in the same building.
func buildDialogue(node *locality.Node, townName, gameID string, pool gamedata.DialoguePool, seedID string) *NPCDialogueResponse {
	tags := node.Tags
	tagSet := make(map[string]bool, len(tags))
	for _, t := range tags {
		tagSet[t] = true
	}

	switch {
	case tagSet["shop"] || tagSet["commerce"] && !tagSet["rest"]:
		lines := []string{"Welcome to " + node.Name + "!"}
		lines = append(lines, pickLines("merchant", pool, gameID, seedID, 2)...)
		return &NPCDialogueResponse{
			NPCName: "Merchant",
			Sprite:  "npc_merchant",
			Lines:   lines,
		}

	case tagSet["rest"]:
		lines := []string{"Welcome to " + node.Name + ", weary traveler."}
		lines = append(lines, pickLines("innkeeper", pool, gameID, seedID, 2)...)
		return &NPCDialogueResponse{
			NPCName: "Innkeeper",
			Sprite:  "npc_innkeeper",
			Lines:   lines,
		}

	case tagSet["temple"] || tagSet["revive"]:
		lines := []string{"Blessings upon you, child of light."}
		lines = append(lines, pickLines("priestess", pool, gameID, seedID, 2)...)
		return &NPCDialogueResponse{
			NPCName: "Priestess",
			Sprite:  "npc_priestess",
			Lines:   lines,
		}

	case tagSet["blacksmith"] || tagSet["forge"]:
		lines := []string{"Welcome to the forge."}
		lines = append(lines, pickLines("blacksmith", pool, gameID, seedID, 2)...)
		return &NPCDialogueResponse{
			NPCName: "Blacksmith",
			Sprite:  "npc_blacksmith",
			Lines:   lines,
		}

	case node.Kind == locality.NodePerson:
		name := node.Name
		lines := []string{"Greetings! I'm " + name + "."}
		if node.Personality != "" {
			lines = append(lines, node.Personality)
		}
		lines = append(lines, pickLines("elder", pool, gameID, seedID, 2)...)
		return &NPCDialogueResponse{
			NPCName: name,
			Sprite:  "npc_elder",
			Lines:   lines,
		}

	default:
		lines := []string{"Welcome to " + node.Name + "."}
		lines = append(lines, pickLines("guard", pool, gameID, seedID, 2)...)
		return &NPCDialogueResponse{
			NPCName: "Guard",
			Sprite:  "npc_guard",
			Lines:   lines,
		}
	}
}
