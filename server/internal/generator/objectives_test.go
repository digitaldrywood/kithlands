package generator

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

func objectiveDefinitions(t *testing.T) map[string]ObjectiveDefinition {
	t.Helper()
	data, err := os.ReadFile("../../../shared/quest_objectives.json")
	if err != nil {
		t.Fatal(err)
	}
	var defs map[string]ObjectiveDefinition
	if err := json.Unmarshal(data, &defs); err != nil {
		t.Fatal(err)
	}
	if err := ValidateObjectiveDefinitions(defs); err != nil {
		t.Fatal(err)
	}
	return defs
}

func TestPrepareObjectivesReachableDistinctAndCorrectSlots(t *testing.T) {
	defs := objectiveDefinitions(t)
	loc := testLocality(t)
	loc.Nodes = append(loc.Nodes, locality.Node{ID: "disconnected", Kind: locality.NodePlace})
	walk := locality.Walk(loc, "spawn")
	quests := []Quest{}
	for i, id := range []string{"Q01", "Q02", "Q03", "Q01", "Q02"} {
		quests = append(quests, Quest{TemplateID: id, TargetNodeID: "disconnected", ID: string(rune('a' + i))})
	}
	PrepareObjectives(quests, loc, "spawn", defs)
	seen := map[string]bool{}
	for _, q := range quests {
		if q.Objectives == nil {
			t.Fatal("no objectives")
		}
		if q.TargetNodeID == q.GiverNodeID || seen[q.TargetNodeID] {
			t.Fatal("repeated or same-site destination despite alternatives")
		}
		seen[q.TargetNodeID] = true
		for i, a := range q.Actions {
			if _, ok := walk.DistanceMap[a.Location]; !ok {
				t.Fatalf("unreachable action: %+v", a)
			}
			expected := q.TargetNodeID
			if (q.TemplateID == "Q02" && i < 2) || (q.TemplateID != "Q02" && i >= 2) {
				expected = q.GiverNodeID
			}
			if a.Location != expected {
				t.Fatalf("wrong slot for %s action %d", q.TemplateID, i)
			}
		}
	}
}

func TestPrepareObjectivesPreservesSavedAndExcluded(t *testing.T) {
	defs := objectiveDefinitions(t)
	quests := []Quest{{ID: "saved", TemplateID: "Q01", Objectives: &ObjectiveProgress{Step: 2, Item: "owned"}}, {TemplateID: "Q12"}, {TemplateID: "Q01", IsPromotion: true}, {TemplateID: "Q01", Completed: true}, {TemplateID: "Q02", IsSideQuest: true}}
	before, _ := json.Marshal(quests)
	PrepareObjectives(quests, testLocality(t), "spawn", defs)
	after, _ := json.Marshal(quests)
	if string(before) != string(after) {
		t.Fatal("changed saved or excluded plan")
	}
}
