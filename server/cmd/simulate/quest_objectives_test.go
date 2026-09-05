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

func TestQuestTravelBudgetUsesTransportMultiplier(t *testing.T) {
	gs := api.GameState{
		CurrentQ:  0,
		Transport: api.TransportInfo{CurrentTier: "T4", EncounterMult: 0.25},
		Quests: []api.QuestState{{
			Objectives: &generator.ObjectiveProgress{},
			Actions: []generator.QuestAction{
				{Type: "goto"}, {Type: "get"}, {Type: "goto"}, {Type: "give"},
			},
		}},
	}
	outbound := questLegRolls(&gs, 8)
	gs.Quests[0].Objectives.Step = 2
	returning := questLegRolls(&gs, 8)
	if outbound+returning != 2 {
		t.Fatalf("T4 quest budget = %d, want 2", outbound+returning)
	}
	gs.Transport = api.TransportInfo{CurrentTier: "T5", EncounterMult: 0}
	if got := questLegRolls(&gs, 8); got != 0 {
		t.Fatalf("T5 quest budget = %d, want 0", got)
	}
}
