package api

import (
	"fmt"
	"hash/fnv"
	"math/rand/v2"
	"net/http"
	"strconv"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

// NPCDialogueResponse is returned by the NPC talk endpoint.
type NPCDialogueResponse struct {
	NPCName string   `json:"npc_name"`
	Sprite  string   `json:"sprite"`
	Lines   []string `json:"lines"`
}

type NPCInteractResponse struct {
	Dialogue  *NPCDialogueResponse `json:"dialogue"`
	GameState *GameState           `json:"game_state,omitempty"`
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

func (s *Server) handleNPCInteract(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	nodeID := r.PathValue("nodeId")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	resp := game.InteractWithNPC(nodeID)
	if resp == nil || resp.Dialogue == nil {
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
	return g.getNPCDialogueUnlocked(nodeID)
}

// InteractWithNPC returns dialogue and applies any proprietor side-quest
// handoff or turn-in effects for the given NPC.
func (g *Game) InteractWithNPC(nodeID string) *NPCInteractResponse {
	g.mu.Lock()
	defer g.mu.Unlock()

	dialogue := g.getNPCDialogueUnlocked(nodeID)
	if dialogue == nil {
		return nil
	}

	baseID, roleIdx := normalizeNPCNodeID(nodeID)
	if roleIdx == 0 {
		if quest, ok := g.buildingSideQuests[baseID]; ok && quest.ID != "" {
			prevStatus := quest.Status
			updated := g.applyBuildingSideQuestInteraction(quest)
			g.buildingSideQuests[baseID] = updated
			dialogue.Lines = append(dialogue.Lines, questDialogueLines(prevStatus, updated)...)
		}
	}

	state := g.stateUnlocked()
	return &NPCInteractResponse{
		Dialogue:  dialogue,
		GameState: &state,
	}
}

func (g *Game) getNPCDialogueUnlocked(nodeID string) *NPCDialogueResponse {
	if g.loc == nil {
		return nil
	}

	baseID, roleIdx := normalizeNPCNodeID(nodeID)
	node := g.loc.NodeByID(baseID)
	if node == nil {
		if spawn, ok := g.settlementInteriors[baseID]; ok &&
			g.location.Kind == LocationInterior && g.location.MapID == baseID {
			node = &locality.Node{ID: spawn.NodeID, Name: spawn.Name, Kind: locality.NodePlace, Tags: spawn.Tags}
		}
	}
	if node == nil {
		return nil
	}

	return buildDialogue(node, g.loc.Name, g.rngSeed, g.gd.Dialogue, nodeID, roleIdx)
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

func atoiDigits(s string) int {
	n := 0
	for _, c := range s {
		n = n*10 + int(c-'0')
	}
	return n
}

func normalizeNPCNodeID(nodeID string) (baseID string, roleIdx int) {
	baseID = nodeID
	if idx := strings.LastIndex(nodeID, "_npc"); idx > 0 {
		suffix := nodeID[idx+4:]
		if len(suffix) > 0 && isDigits(suffix) {
			baseID = nodeID[:idx]
			return baseID, atoiDigits(suffix)
		}
	}
	return baseID, 0
}

// pickLines selects n lines deterministically from the archetype pool using
// hash(gameID + nodeID) as seed. The same NPC always says the same things
// within a save, but different saves produce different selections.
func pickLines(archetype string, pool gamedata.DialoguePool, saveSeed int64, nodeID string, n int) []string {
	arch, ok := pool.Archetypes[archetype]
	if !ok || len(arch.Lines) == 0 {
		return nil
	}

	h := fnv.New64a()
	h.Write([]byte(strconv.FormatInt(saveSeed, 10)))
	h.Write([]byte(nodeID))
	seed := h.Sum64()

	rng := rand.New(rand.NewPCG(seed, 0))

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

type npcRole struct {
	Name      string
	Sprite    string
	Archetype string
}

// buildDialogue constructs an NPCDialogueResponse for the given node. seedID is
// used as the RNG seed key; it may differ from node.ID when a sub-NPC suffix
// like "_npc1" is present, ensuring distinct lines per NPC in the same building.
func buildDialogue(node *locality.Node, townName string, saveSeed int64, pool gamedata.DialoguePool, seedID string, roleIdx int) *NPCDialogueResponse {
	role := npcRoleForNode(node, roleIdx)
	lines := []string{roleGreeting(role, node.Name, townName)}
	if node.Kind == locality.NodePerson && node.Personality != "" && roleIdx == 0 {
		lines = append(lines, node.Personality)
	}
	lines = append(lines, pickLines(role.Archetype, pool, saveSeed, seedID, 2)...)
	if len(lines) < 3 {
		lines = append(lines, pickLines("default", pool, saveSeed, seedID+"-default", 3-len(lines))...)
	}
	return &NPCDialogueResponse{
		NPCName: role.Name,
		Sprite:  role.Sprite,
		Lines:   lines,
	}
}

func npcRoleForNode(node *locality.Node, roleIdx int) npcRole {
	if node.Kind == locality.NodePerson {
		return npcRole{Name: node.Name, Sprite: "npc_elder", Archetype: "elder"}
	}

	buildingType := locality.BuildingTypeFromTags(node.Tags)
	var roles []npcRole
	switch buildingType {
	case "inn":
		roles = []npcRole{
			{Name: "Innkeeper", Sprite: "npc_innkeeper", Archetype: "innkeeper"},
			{Name: "Traveler", Sprite: "npc_guard", Archetype: "traveler"},
			{Name: "Guard", Sprite: "npc_guard", Archetype: "guard"},
			{Name: "Child", Sprite: "npc_elder", Archetype: "child"},
		}
	case "shop":
		roles = []npcRole{
			{Name: "Merchant", Sprite: "npc_merchant", Archetype: "merchant"},
			{Name: "Blacksmith", Sprite: "npc_blacksmith", Archetype: "blacksmith"},
			{Name: "Traveler", Sprite: "npc_guard", Archetype: "traveler"},
		}
	case "temple":
		roles = []npcRole{
			{Name: "Priestess", Sprite: "npc_priestess", Archetype: "priestess"},
			{Name: "Sage", Sprite: "npc_elder", Archetype: "sage"},
			{Name: "Elder", Sprite: "npc_elder", Archetype: "elder"},
			{Name: "Child", Sprite: "npc_elder", Archetype: "child"},
		}
	default:
		roles = []npcRole{
			{Name: "Elder", Sprite: "npc_elder", Archetype: "elder"},
			{Name: "Farmer", Sprite: "npc_elder", Archetype: "farmer"},
			{Name: "Child", Sprite: "npc_elder", Archetype: "child"},
		}
	}

	if roleIdx < 0 {
		roleIdx = 0
	}
	return roles[roleIdx%len(roles)]
}

func roleGreeting(role npcRole, nodeName, townName string) string {
	switch role.Archetype {
	case "merchant":
		return "Welcome to " + nodeName + "."
	case "innkeeper":
		return "Welcome to " + nodeName + ", weary traveler."
	case "priestess":
		return "Blessings upon you from " + nodeName + "."
	case "blacksmith":
		return "The forge at " + nodeName + " is hot today."
	case "traveler":
		return "I've only just arrived in " + townName + "."
	case "sage":
		return "The old lessons of " + townName + " are worth hearing."
	case "farmer":
		return "This town still runs on honest work."
	case "child":
		return "Everybody in " + townName + " knows a good rumor."
	case "elder":
		return "Welcome to " + townName + "."
	default:
		return fmt.Sprintf("%s keeps watch over %s.", role.Name, townName)
	}
}

func questDialogueLines(prevStatus string, q generator.BuildingSideQuest) []string {
	switch prevStatus {
	case generator.BuildingQuestAvailable:
		return []string{
			"Side quest: " + q.Name,
			q.Description,
			"Come back after you visit " + q.TargetName + ".",
		}
	case generator.BuildingQuestAccepted:
		return []string{
			"Side quest: " + q.Name,
			"Don't forget to visit " + q.TargetName + ".",
		}
	case generator.BuildingQuestReadyToTurnIn:
		return []string{
			"You're back from " + q.TargetName + "?",
			q.Completion,
			fmt.Sprintf("Reward: %d XP and %d gold.", q.Reward.XP, q.Reward.Gold),
		}
	default:
		return []string{"Thanks again for helping with " + q.Name + "."}
	}
}

func (g *Game) applyBuildingSideQuestInteraction(q generator.BuildingSideQuest) generator.BuildingSideQuest {
	switch q.Status {
	case generator.BuildingQuestAvailable:
		q.Status = generator.BuildingQuestAccepted
		g.message = "Side quest received: " + q.Name
	case generator.BuildingQuestAccepted:
		g.message = "Side quest active: " + q.Name
	case generator.BuildingQuestReadyToTurnIn:
		q.Status = generator.BuildingQuestCompleted
		q.Completed = true
		g.inv.Gold += q.Reward.Gold
		for _, c := range g.party {
			if c.IsAlive() {
				c.XP += q.Reward.XP
			}
		}
		g.checkLevelUps()
		g.message = fmt.Sprintf("Side quest complete: %s\n+%d XP, +%d gold", q.Name, q.Reward.XP, q.Reward.Gold)
	default:
		g.message = "Side quest complete: " + q.Name
	}
	return q
}
