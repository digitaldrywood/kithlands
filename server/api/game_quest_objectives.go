package api

import (
	"fmt"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

// validQuestVisit checks graph membership, not client tile proximity. Ordinary
// world movement remains client-rendered; a valid arrival records the current
// locality interaction context, never item ownership or quest completion.
func (g *Game) validQuestVisit(nodeID string) bool {
	if nodeID == "" || g.loc == nil || g.walk == nil || g.location.Kind != LocationWorld {
		return false
	}
	node := g.loc.NodeByID(nodeID)
	if node == nil || node.Kind == locality.NodeNatural {
		return false
	}
	_, reachable := g.walk.DistanceMap[nodeID]
	return reachable
}

func (g *Game) advanceObjectiveArrival(q *generator.Quest, nodeID string) bool {
	if !generator.UsesObjectives(q) || q.Objectives == nil {
		return false
	}
	if q.Completed || q.Objectives.Step < 0 || q.Objectives.Step >= len(q.Actions) {
		return true
	}
	step := q.Actions[q.Objectives.Step]
	if step.Type == generator.ActionGoto && step.Location == nodeID && g.questVisitNodeID == nodeID {
		q.Objectives.Step++
	}
	if q.Objectives.Step < len(q.Actions) {
		g.message = strings.TrimSpace(g.message + "\n" + q.Actions[q.Objectives.Step].Text)
	}
	return true
}

func (g *Game) processQuestObjective(req GameActionRequest) (*GameState, error) {
	if g.currentQ < 0 || g.currentQ >= len(g.quests) {
		return nil, fmt.Errorf("no active quest")
	}
	q := &g.quests[g.currentQ]
	if !generator.UsesObjectives(q) || q.Objectives == nil || q.Completed || req.QuestID != q.ID {
		return nil, fmt.Errorf("quest is not active")
	}
	progress := q.Objectives
	if req.ObjectiveIndex != progress.Step || progress.Step < 0 || progress.Step >= len(q.Actions) {
		return nil, fmt.Errorf("objective is no longer active")
	}
	step := q.Actions[progress.Step]
	if !g.validQuestVisit(req.NodeID) || req.NodeID != g.questVisitNodeID || req.NodeID != step.Location {
		return nil, fmt.Errorf("visit the objective location first")
	}
	switch step.Type {
	case generator.ActionGet:
		if progress.Item != "" {
			return nil, fmt.Errorf("quest item already collected")
		}
		progress.Item = step.Target
	case generator.ActionLearn:
		if progress.Clue != "" {
			return nil, fmt.Errorf("clue already recorded")
		}
		progress.Clue = step.Result
	case generator.ActionGive:
		if progress.Item == "" || progress.Item != step.Target {
			return nil, fmt.Errorf("the quest item is required")
		}
		progress.Item = ""
	case generator.ActionReport:
		if progress.Clue == "" {
			return nil, fmt.Errorf("inspect the clue before reporting")
		}
		progress.Clue = ""
	default:
		return nil, fmt.Errorf("travel to the objective before interacting")
	}
	progress.Step++
	g.message = step.Result
	if progress.Step == len(q.Actions) {
		g.completeOrdinaryQuest(q)
	}
	state := g.stateUnlocked()
	return &state, nil
}

// completeOrdinaryQuest shares the unchanged legacy reward behavior with the
// staged normal objectives. Callers must validate their completion condition.
func (g *Game) completeOrdinaryQuest(q *generator.Quest) {
	if q.Completed {
		return
	}
	q.Completed = true
	completedCopy := *q // capture for maybeTriggerPromotion below
	g.message = fmt.Sprintf("Quest complete: %s\n%s\n+%d XP, +%d gold",
		q.Name, q.Completion, q.Reward.XP, q.Reward.Gold)
	g.inv.Gold += q.Reward.Gold
	for _, c := range g.party {
		if c.IsAlive() {
			c.XP += q.Reward.XP
		}
	}
	g.checkLevelUps()
	g.restParty()
	g.currentQ++
	if tierName := g.checkTransportUnlocks(); tierName != "" {
		g.message += fmt.Sprintf("\nTransport upgraded: %s!", tierName)
	}
	if g.currentQ >= len(g.quests) {
		g.phase = "victory"
		g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
	} else {
		g.phase = "quest_complete"
		g.maybeTriggerPromotion(&completedCopy)
	}
}

// savedQuestSpawn recovers the original connected component for old saves
// which incorrectly persisted the first locality node as every custom spawn.
// New saves retain the real spawn. Legacy recovery chooses only an existing
// saved normal-quest anchor; it never adds edges or disables reachability.
func savedQuestSpawn(saved string, loc *locality.Locality, quests []generator.Quest, current int) string {
	if loc.NodeByID(saved) == nil {
		saved = loc.Nodes[0].ID
	}
	if saved != loc.Nodes[0].ID {
		return saved
	}
	walk := locality.Walk(loc, saved)
	for i := max(0, current); i < len(quests); i++ {
		q := &quests[i]
		if !generator.UsesObjectives(q) || q.Completed {
			continue
		}
		anchor := q.TargetNodeID
		if q.Objectives != nil && q.Objectives.Step >= 0 && q.Objectives.Step < len(q.Actions) {
			anchor = q.Actions[q.Objectives.Step].Location
		}
		if loc.NodeByID(anchor) != nil {
			if _, reachable := walk.DistanceMap[anchor]; !reachable {
				return anchor
			}
		}
	}
	return saved
}
