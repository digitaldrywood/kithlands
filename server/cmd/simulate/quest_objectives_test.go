package main

import (
	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"testing"
)

func TestObjectiveTravelBudgetAndAction(t *testing.T) {
	gs := api.GameState{Phase: "world", Quests: []api.QuestState{{ID: "fetch", Objectives: &generator.ObjectiveProgress{}, Actions: []generator.QuestAction{{Type: "goto", Location: "a"}, {Type: "get", Location: "a"}, {Type: "goto", Location: "b"}, {Type: "give", Location: "b"}}}}}
	first := questTravelLeg(&gs)
	outbound := questLegRolls(&gs, 9)
	req, ok := objectiveWorldAction(&gs)
	if !ok || req.Type != "quest_advance" || req.NodeID != "a" {
		t.Fatal(req)
	}
	gs.Quests[0].Objectives.Step = 1
	gs.QuestVisitNodeID = "a"
	if questTravelLeg(&gs) != first {
		t.Fatal("collection created travel budget")
	}
	req, ok = objectiveWorldAction(&gs)
	if !ok || req.Type != "quest_action" || req.QuestID != "fetch" || req.ObjectiveIndex != 1 {
		t.Fatal(req)
	}
	gs.Quests[0].Objectives.Step = 2
	if questTravelLeg(&gs) == first {
		t.Fatal("return journey was omitted")
	}
	if outbound+questLegRolls(&gs, 9) != 9 {
		t.Fatal("per-quest encounter budget changed")
	}
	gs.Quests[0].Objectives.Step = 3
	req, _ = objectiveWorldAction(&gs)
	if req.Type != "quest_advance" || req.NodeID != "b" {
		t.Fatal("remote handoff skipped arrival")
	}
}
