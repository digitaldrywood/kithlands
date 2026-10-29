package main

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
)

func TestCautiousQuestRetreatReachesTerminal(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	for _, seed := range []int64{8, 47} {
		res, err := RunOne(gd, "../../../shared", seed, &CautiousStrategy{}, DefaultRunOptions())
		if err != nil {
			t.Fatalf("seed %d: %v", seed, err)
		}
		if res.FinalPhase != "victory" && res.FinalPhase != "defeat" {
			t.Fatalf("seed %d: %s", seed, res.FinalPhase)
		}
	}
}

func TestEscortThreeJourneysKeepTravelBudget(t *testing.T) {
	gs := api.GameState{Quests: []api.QuestState{{Objectives: &generator.ObjectiveProgress{}, Actions: []generator.QuestAction{{Type: "goto"}, {Type: "learn"}, {Type: "goto"}, {Type: "escort"}, {Type: "goto"}, {Type: "report"}}}}}
	total := 0
	for _, step := range []int{0, 2, 4} {
		gs.Quests[0].Objectives.Step = step
		total += questLegRolls(&gs, 10)
	}
	if total != 10 {
		t.Fatalf("escort travel budget=%d, want 10", total)
	}
}
