package generator

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

const (
	BuildingQuestAvailable     = "available"
	BuildingQuestAccepted      = "accepted"
	BuildingQuestReadyToTurnIn = "ready_to_turn_in"
	BuildingQuestCompleted     = "completed"
)

// BuildingSideQuestEntry is the shared content schema for building-local side
// quests that are handed out by interior proprietors.
type BuildingSideQuestEntry struct {
	ID           string `json:"id"`
	BuildingType string `json:"building_type"`
	Name         string `json:"name"`
	Template     string `json:"template"`
	Act          int    `json:"act"`
	ItemHint     string `json:"item_hint,omitempty"`
	XPReward     int    `json:"xp_reward"`
	GoldReward   int    `json:"gold_reward"`
}

// BuildingSideQuest is one generated per-building quest instance tracked in a
// save. It reuses the existing generator.Quest shape for description,
// completion, target selection, and rewards, but has an independent status
// machine from the linear main quest campaign.
type BuildingSideQuest struct {
	Quest
	BuildingType   string `json:"building_type"`
	SourceNodeID   string `json:"source_node_id"`
	SourceNodeName string `json:"source_node_name"`
	Status         string `json:"status"`
}

// LoadBuildingSideQuestPool reads shared/content/building_side_quests.json.
func LoadBuildingSideQuestPool(sharedDir string) ([]BuildingSideQuestEntry, error) {
	path := filepath.Join(sharedDir, "content", "building_side_quests.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading building side quest pool: %w", err)
	}

	var entries []BuildingSideQuestEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("parsing building side quest pool: %w", err)
	}

	filtered := make([]BuildingSideQuestEntry, 0, len(entries))
	for _, entry := range entries {
		if QuestTemplateByID(entry.Template) == nil {
			continue
		}
		filtered = append(filtered, entry)
	}
	return filtered, nil
}

// GenerateBuildingSideQuests assigns one deterministic quest to each enterable
// building node using the current building-type pool, falling back to the
// "default" pool for future building categories that do not yet have bespoke
// content.
func GenerateBuildingSideQuests(loc *locality.Locality, walk *locality.WalkResult, rng *rand.Rand, pool []BuildingSideQuestEntry) map[string]BuildingSideQuest {
	if loc == nil || walk == nil || len(pool) == 0 {
		return nil
	}

	quests := make(map[string]BuildingSideQuest)
	byType := make(map[string][]BuildingSideQuestEntry)
	for _, entry := range pool {
		byType[entry.BuildingType] = append(byType[entry.BuildingType], entry)
	}

	idx := 0
	for i := range loc.Nodes {
		node := &loc.Nodes[i]
		if node.Kind == locality.NodeNatural || node.Kind == locality.NodePerson {
			continue
		}

		buildingType := locality.BuildingTypeFromTags(node.Tags)
		choices := byType[buildingType]
		if len(choices) == 0 {
			choices = byType["default"]
		}
		if len(choices) == 0 {
			continue
		}

		target := pickBuildingQuestTarget(walk, node.ID, rng)
		if target == nil {
			continue
		}

		entry := choices[rng.IntN(len(choices))]
		quests[node.ID] = instantiateBuildingSideQuest(entry, node, target, idx, rng)
		idx++
	}

	return quests
}

func instantiateBuildingSideQuest(entry BuildingSideQuestEntry, giver, target *locality.Node, idx int, rng *rand.Rand) BuildingSideQuest {
	tmpl := QuestTemplateByID(entry.Template)
	if tmpl == nil {
		return BuildingSideQuest{}
	}

	itemHint := entry.ItemHint
	if itemHint == "" {
		itemHint = itemHintForTemplate(entry.Template, rng)
	}

	giverName := buildingQuestGiverName(entry.BuildingType, giver.Name)

	actions := buildActions(*tmpl, target.ID, target.Name, giver.ID, giverName, itemHint)
	desc, completion := fallbackDialogue(entry.Template, giverName, target.Name, itemHint, rng)

	return BuildingSideQuest{
		Quest: Quest{
			ID:           fmt.Sprintf("building_%s_%d", entry.ID, idx),
			TemplateID:   entry.Template,
			Name:         entry.Name,
			Description:  desc,
			Completion:   completion,
			GiverNodeID:  giver.ID,
			GiverName:    giverName,
			TargetNodeID: target.ID,
			TargetName:   target.Name,
			Actions:      actions,
			Reward: QuestReward{
				XP:   entry.XPReward,
				Gold: entry.GoldReward,
			},
			Act:         entry.Act,
			IsSideQuest: true,
		},
		BuildingType:   entry.BuildingType,
		SourceNodeID:   giver.ID,
		SourceNodeName: giver.Name,
		Status:         BuildingQuestAvailable,
	}
}

func buildingQuestGiverName(buildingType, fallback string) string {
	switch buildingType {
	case "inn":
		return "Innkeeper"
	case "shop":
		return "Merchant"
	case "temple":
		return "Priestess"
	case "house":
		return "Elder"
	default:
		return fallback
	}
}

func pickBuildingQuestTarget(walk *locality.WalkResult, giverNodeID string, rng *rand.Rand) *locality.Node {
	for _, tier := range [][]*locality.Node{walk.Close, walk.Medium, walk.Far} {
		candidates := make([]*locality.Node, 0, len(tier))
		for _, node := range filterEnterableNodes(tier) {
			if node.ID == giverNodeID {
				continue
			}
			candidates = append(candidates, node)
		}
		if len(candidates) > 0 {
			return candidates[rng.IntN(len(candidates))]
		}
	}
	return nil
}
