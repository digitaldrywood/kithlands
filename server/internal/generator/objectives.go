package generator

import (
	"fmt"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// ObjectiveProgress belongs to one quest. Its custody cannot be sold, dropped,
// transferred to another quest, or supplied by a client inventory payload.
type ObjectiveProgress struct {
	EncounterActive bool   `json:"-"` // Combat is transient; saved progress stays at the unresolved kill step.
	Step            int    `json:"step"`
	Item            string `json:"item,omitempty"`
	Clue            string `json:"clue,omitempty"`
	Recovery        string `json:"recovery,omitempty"`
}

type ObjectiveDefinition struct {
	Name        string              `json:"name"`
	Item        string              `json:"item"`
	Description string              `json:"description"`
	Completion  string              `json:"completion"`
	Steps       []ObjectiveStep     `json:"steps"`
	Encounter   *ObjectiveEncounter `json:"encounter,omitempty"`
}

type ObjectiveEncounter struct {
	Monsters          []string `json:"monsters"`
	FullPartyMonsters []string `json:"full_party_monsters"`
	Level             int      `json:"level"`
	Formation         string   `json:"formation"`
	Arrival           string   `json:"arrival"`
	Flee              string   `json:"flee"`
	Defeat            string   `json:"defeat"`
}

type ObjectiveStep struct {
	Type   ActionType `json:"type"`
	At     string     `json:"at"`
	Text   string     `json:"text"`
	Prompt string     `json:"prompt"`
	Result string     `json:"result"`
}

// UsesObjectives deliberately excludes promotion, finale, and surprise quests.
func UsesObjectives(q *Quest) bool {
	return q != nil && !q.IsPromotion && !q.IsSideQuest && (q.TemplateID == "Q01" || q.TemplateID == "Q02" || q.TemplateID == "Q03" || q.TemplateID == "Q04")
}

// ValidateObjectiveDefinitions keeps this a bounded objective-plan contract rather
// than accepting arbitrary scripts from content files.
func ValidateObjectiveDefinitions(defs map[string]ObjectiveDefinition) error {
	expected := map[string][]ActionType{
		"Q01": {ActionGoto, ActionGet, ActionGoto, ActionGive},
		"Q02": {ActionGoto, ActionGet, ActionGoto, ActionGive},
		"Q03": {ActionGoto, ActionLearn, ActionGoto, ActionReport},
		"Q04": {ActionGoto, ActionKill, ActionGoto, ActionReport},
	}
	for id, types := range expected {
		def, ok := defs[id]
		if !ok || len(def.Steps) != len(types) || def.Name == "" || def.Item == "" || def.Description == "" || def.Completion == "" {
			return fmt.Errorf("quest objectives: incomplete %s", id)
		}
		if id == "Q04" {
			e := def.Encounter
			if e == nil || len(e.Monsters) == 0 || len(e.FullPartyMonsters) == 0 || e.Level < 1 || e.Formation == "" || e.Arrival == "" || e.Flee == "" || e.Defeat == "" {
				return fmt.Errorf("quest objectives: incomplete %s encounter", id)
			}
		}
		for i, step := range def.Steps {
			at := "target"
			if (id == "Q02" && i < 2) || (id != "Q02" && i >= 2) {
				at = "giver"
			}
			if step.Type != types[i] || step.At != at || step.Text == "" || (step.Type != ActionGoto && (step.Prompt == "" || step.Result == "")) {
				return fmt.Errorf("quest objectives: invalid %s step %d", id, i)
			}
		}
	}
	return nil
}

// PrepareObjectives initializes new and legacy unfinished quests. Saved plans
// and completed quests are immutable. Targets come only from the reachable
// locality graph; least-used alternatives avoid repeatedly sending the player
// to a single site. Existing rewards, quest order and RNG are untouched.
func PrepareObjectives(quests []Quest, loc *locality.Locality, spawnID string, defs map[string]ObjectiveDefinition) {
	walk := locality.Walk(loc, spawnID)
	candidates := filterEnterableNodes(append(append(append([]*locality.Node{}, walk.Close...), walk.Medium...), walk.Far...))
	if len(candidates) == 0 && walk.Spawn != nil && walk.Spawn.Kind != locality.NodeNatural {
		candidates = append(candidates, walk.Spawn)
	}
	used := make(map[string]int)
	for i := range quests {
		q := &quests[i]
		if !UsesObjectives(q) {
			continue
		}
		if q.Completed || q.Objectives != nil {
			used[q.TargetNodeID]++
			continue
		}
		def, ok := defs[q.TemplateID]
		if !ok || len(candidates) == 0 {
			continue
		}
		giver := candidates[0]
		for _, n := range candidates {
			if n.Kind == locality.NodePerson {
				giver = n
				break
			}
		}
		// Prefer the generated target when equally used, but require a distinct
		// place from the giver whenever the graph provides one.
		var target *locality.Node
		for _, n := range candidates {
			if len(candidates) > 1 && n.ID == giver.ID {
				continue
			}
			if target == nil || used[n.ID] < used[target.ID] || (used[n.ID] == used[target.ID] && n.ID == q.TargetNodeID) {
				target = n
			}
		}
		if target == nil {
			target = giver
		}
		used[target.ID]++
		q.GiverNodeID, q.GiverName = giver.ID, giver.Name
		q.TargetNodeID, q.TargetName = target.ID, target.Name
		replace := strings.NewReplacer("{giver}", giver.Name, "{target}", target.Name, "{item}", def.Item)
		q.Name = fmt.Sprintf("%s: %s", def.Name, target.Name)
		q.Description, q.Completion = replace.Replace(def.Description), replace.Replace(def.Completion)
		q.Actions = nil
		for _, step := range def.Steps {
			node := target
			if step.At == "giver" {
				node = giver
			}
			q.Actions = append(q.Actions, QuestAction{Type: step.Type, Target: def.Item, Location: node.ID, Detail: node.Name, Text: replace.Replace(step.Text), Prompt: replace.Replace(step.Prompt), Result: replace.Replace(step.Result)})
		}
		q.Objectives = &ObjectiveProgress{}
	}
}
