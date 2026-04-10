package generator

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// SideQuestEntry matches the schema of shared/content/side_quests.json.
// Only the fields the generator actually uses are deserialized.
type SideQuestEntry struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Act        int    `json:"act"`
	Rarity     string `json:"rarity"`
	Template   string `json:"template"`
	Hidden     bool   `json:"hidden"`
	SoftPrereq string `json:"soft_prereq,omitempty"` // node ID that reveals the quest
}

// LoadSideQuestPool reads the side quest pool JSON from the given shared dir.
// Path convention: <sharedDir>/content/side_quests.json.
// Side quests with templates this generator doesn't support (e.g. Q08 Ritual)
// are filtered out so v1 never tries to instantiate them.
func LoadSideQuestPool(sharedDir string) ([]SideQuestEntry, error) {
	path := filepath.Join(sharedDir, "content", "side_quests.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading side quest pool: %w", err)
	}
	var all []SideQuestEntry
	if err := json.Unmarshal(data, &all); err != nil {
		return nil, fmt.Errorf("parsing side quest pool: %w", err)
	}
	supported := make([]SideQuestEntry, 0, len(all))
	for _, e := range all {
		if QuestTemplateByID(e.Template) == nil {
			continue
		}
		supported = append(supported, e)
	}
	return supported, nil
}

// rarityWeight returns a pick weight. Common > uncommon > rare so surprises
// stay surprising without disappearing.
func rarityWeight(rarity string) int {
	switch rarity {
	case "common":
		return 5
	case "uncommon":
		return 3
	case "rare":
		return 1
	default:
		return 2
	}
}

// selectSideQuests picks up to `count` side quests eligible for the given act
// using rarity-weighted sampling without replacement. Returns fewer than
// `count` if the filtered pool is smaller.
func selectSideQuests(pool []SideQuestEntry, act, count int, rng *rand.Rand) []SideQuestEntry {
	if count <= 0 || len(pool) == 0 {
		return nil
	}
	candidates := make([]SideQuestEntry, 0, len(pool))
	for _, e := range pool {
		if e.Act == act {
			candidates = append(candidates, e)
		}
	}
	if len(candidates) == 0 {
		return nil
	}

	picked := make([]SideQuestEntry, 0, count)
	for len(picked) < count && len(candidates) > 0 {
		totalWeight := 0
		for _, c := range candidates {
			totalWeight += rarityWeight(c.Rarity)
		}
		roll := rng.IntN(totalWeight)
		cum := 0
		idx := 0
		for i, c := range candidates {
			cum += rarityWeight(c.Rarity)
			if roll < cum {
				idx = i
				break
			}
		}
		picked = append(picked, candidates[idx])
		candidates = append(candidates[:idx], candidates[idx+1:]...)
	}
	return picked
}

// instantiateSideQuest converts a pool entry into a concrete Quest.
// Falls back to the main instantiator for slot filling but overrides the
// displayed name with the curated side-quest name and flags it as a side quest.
func instantiateSideQuest(entry SideQuestEntry, walk *locality.WalkResult, loc *locality.Locality, idx int, rng *rand.Rand) Quest {
	tmpl := QuestTemplateByID(entry.Template)
	if tmpl == nil {
		return Quest{}
	}
	q := instantiateQuest(*tmpl, walk, loc, entry.Act, idx, rng)
	q.ID = fmt.Sprintf("side_%s_%d", entry.ID, idx)
	q.Name = fmt.Sprintf("%s (%s)", entry.Name, q.TargetName)
	q.IsSideQuest = true
	q.Hidden = entry.Hidden
	// Resolve dynamic soft prereq markers to actual node IDs.
	switch entry.SoftPrereq {
	case "_far_node":
		if len(walk.Far) > 0 {
			q.SoftPrereq = walk.Far[rng.IntN(len(walk.Far))].ID
		}
	case "_medium_node":
		if len(walk.Medium) > 0 {
			q.SoftPrereq = walk.Medium[rng.IntN(len(walk.Medium))].ID
		}
	default:
		q.SoftPrereq = entry.SoftPrereq
	}
	return q
}
