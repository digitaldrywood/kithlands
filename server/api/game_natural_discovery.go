package api

import (
	"fmt"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

type naturalDiscoveryAssignment struct {
	node      *locality.Node
	discovery *gamedata.NaturalDiscovery
}

// naturalDiscoveryAssignments distributes definitions and natural nodes in a
// stable round robin. The larger collection determines the assignment count:
// one wizard wilderness node therefore hosts every authored definition, while
// an OSM locality with many natural nodes makes every node interactive.
func (g *Game) naturalDiscoveryAssignments() []naturalDiscoveryAssignment {
	if g == nil || g.gd == nil || g.loc == nil || len(g.gd.NaturalDiscoveries) == 0 {
		return nil
	}

	var nodes []*locality.Node
	for i := range g.loc.Nodes {
		if g.loc.Nodes[i].Kind == locality.NodeNatural {
			nodes = append(nodes, &g.loc.Nodes[i])
		}
	}
	if len(nodes) == 0 {
		return nil
	}

	count := len(nodes)
	if len(g.gd.NaturalDiscoveries) > count {
		count = len(g.gd.NaturalDiscoveries)
	}
	assignments := make([]naturalDiscoveryAssignment, 0, count)
	for i := 0; i < count; i++ {
		assignments = append(assignments, naturalDiscoveryAssignment{
			node:      nodes[i%len(nodes)],
			discovery: &g.gd.NaturalDiscoveries[i%len(g.gd.NaturalDiscoveries)],
		})
	}
	return assignments
}

func naturalDiscoveryStateKey(nodeID, discoveryID string) string {
	return nodeID + "::" + discoveryID
}

func (g *Game) fillNaturalDiscoveryState(state *GameState) {
	for _, assignment := range g.naturalDiscoveryAssignments() {
		key := naturalDiscoveryStateKey(assignment.node.ID, assignment.discovery.ID)
		state.NaturalDiscoveries = append(state.NaturalDiscoveries, NaturalDiscoveryState{
			NodeID:      assignment.node.ID,
			DiscoveryID: assignment.discovery.ID,
			Kind:        assignment.discovery.Kind,
			Title:       assignment.discovery.Title,
			Prompt:      assignment.discovery.Prompt,
			Claimed:     g.naturalDiscoveryClaimed[key],
			Revealed:    g.naturalDiscoveryRevealed[key],
		})
	}
}

func (g *Game) processNaturalDiscovery(nodeID string) (*GameState, error) {
	node := g.loc.NodeByID(nodeID)
	if node == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("natural discovery node %q not found", nodeID)
	}
	if node.Kind != locality.NodeNatural {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("node %q is not a natural discovery", nodeID)
	}

	var atNode []naturalDiscoveryAssignment
	for _, assignment := range g.naturalDiscoveryAssignments() {
		if assignment.node.ID == nodeID {
			atNode = append(atNode, assignment)
		}
	}
	if len(atNode) == 0 {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("node %q has no natural discovery", nodeID)
	}

	if g.naturalDiscoveryClaimed == nil {
		g.naturalDiscoveryClaimed = make(map[string]bool)
	}
	if g.naturalDiscoveryRevealed == nil {
		g.naturalDiscoveryRevealed = make(map[string]bool)
	}

	assignment := atNode[len(atNode)-1]
	allClaimed := true
	for _, candidate := range atNode {
		key := naturalDiscoveryStateKey(nodeID, candidate.discovery.ID)
		if !g.naturalDiscoveryClaimed[key] {
			assignment = candidate
			allClaimed = false
			break
		}
	}

	discovery := assignment.discovery
	key := naturalDiscoveryStateKey(nodeID, discovery.ID)
	revealedQuests := g.recordNodeVisit(nodeID)
	if allClaimed {
		g.message = appendNaturalDiscoveryMessage(g.message, discovery.ExhaustedMessage)
		state := g.stateUnlocked()
		return &state, nil
	}

	g.naturalDiscoveryRevealed[key] = true
	if discovery.RequiresKeyItem != "" && !g.inv.HasKeyItem(discovery.RequiresKeyItem) {
		g.message = appendNaturalDiscoveryMessage(g.message, discovery.LockedMessage)
		for _, questName := range revealedQuests {
			g.message = appendNaturalDiscoveryMessage(g.message, naturalQuestRevealMessage(discovery, questName))
		}
		state := g.stateUnlocked()
		return &state, nil
	}

	if discovery.ConsumeKeyItem {
		g.inv.RemoveKeyItem(discovery.RequiresKeyItem)
	}
	for _, reward := range discovery.Rewards {
		switch reward.Kind {
		case "gold":
			g.inv.Gold += reward.Amount
		case "consumable":
			g.inv.Consumables[reward.ItemID] += reward.Amount
		case "key_item":
			g.inv.AddKeyItem(reward.ItemID)
		}
	}
	if discovery.RevealHiddenQuest {
		// A matching soft prerequisite was already revealed by recordNodeVisit.
		// Wizard localities may have no far tier, leaving the authored hidden
		// quest without a concrete prerequisite; only a successfully opened
		// passage may use this deterministic campaign-order fallback.
		if len(revealedQuests) == 0 {
			revealedQuests = append(revealedQuests, g.revealFirstHiddenQuest()...)
		}
	}
	g.naturalDiscoveryClaimed[key] = true
	g.message = appendNaturalDiscoveryMessage(g.message, discovery.SuccessMessage)
	for _, questName := range revealedQuests {
		g.message = appendNaturalDiscoveryMessage(g.message, naturalQuestRevealMessage(discovery, questName))
	}

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) revealFirstHiddenQuest() []string {
	for i := range g.quests {
		if g.quests[i].Hidden {
			g.quests[i].Hidden = false
			return []string{g.quests[i].Name}
		}
	}
	return nil
}

func appendNaturalDiscoveryMessage(current, next string) string {
	current = strings.TrimSpace(current)
	next = strings.TrimSpace(next)
	if current == "" {
		return next
	}
	if next == "" {
		return current
	}
	return current + "\n" + next
}

func naturalQuestRevealMessage(discovery *gamedata.NaturalDiscovery, questName string) string {
	return strings.ReplaceAll(discovery.QuestRevealMessage, "{quest_name}", questName)
}
