package api

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/generator"
)

func objectiveTestGame(t *testing.T, template string) *Game {
	t.Helper()
	g := newTownTestGame(t)
	g.quests = []generator.Quest{{ID: "objective_test", TemplateID: template, Name: "Objective test", Reward: generator.QuestReward{Gold: 37, XP: 11}}, {ID: "next", TemplateID: "Q04"}}
	g.currentQ, g.phase = 0, "world"
	generator.PrepareObjectives(g.quests, g.loc, g.walk.Spawn.ID, g.gd.QuestObjectives)
	if g.quests[0].Objectives == nil {
		t.Fatal("missing generated plan")
	}
	return g
}

func objectiveAction(g *Game) GameActionRequest {
	q := g.quests[g.currentQ]
	return GameActionRequest{Type: "quest_action", QuestID: q.ID, ObjectiveIndex: q.Objectives.Step, NodeID: q.Actions[q.Objectives.Step].Location}
}

func TestQuestObjectivesActionsAndSaveResume(t *testing.T) {
	for _, template := range []string{"Q01", "Q02", "Q03"} {
		t.Run(template, func(t *testing.T) {
			g := objectiveTestGame(t, template)
			q := &g.quests[0]
			gold := g.inv.Gold
			// Neither a remote action nor a future handoff can bypass travel.
			if _, err := g.ProcessAction(objectiveAction(g)); err == nil {
				t.Fatal("accepted action before arrival")
			}
			first := q.Actions[0].Location
			future := GameActionRequest{Type: "quest_action", QuestID: q.ID, ObjectiveIndex: 3, NodeID: q.Actions[3].Location}
			if _, err := g.ProcessAction(future); err == nil {
				t.Fatal("accepted future handoff")
			}
			for i := 0; i < 3; i++ {
				if _, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: first}); err != nil {
					t.Fatal(err)
				}
			}
			if q.Objectives.Step != 1 || q.Completed || g.inv.Gold != gold {
				t.Fatal("repeated arrival progressed beyond travel")
			}
			// A read-only NPC conversation never collects the objective.
			g.GetNPCDialogue(first)
			if q.Objectives.Step != 1 {
				t.Fatal("dialogue read mutated progress")
			}
			req := objectiveAction(g)
			bad := req
			bad.NodeID = q.Actions[3].Location
			if bad.NodeID != first {
				if _, err := g.ProcessAction(bad); err == nil {
					t.Fatal("accepted remote interaction")
				}
			}
			if _, err := g.ProcessAction(req); err != nil {
				t.Fatal(err)
			}
			if _, err := g.ProcessAction(req); err == nil {
				t.Fatal("accepted replay")
			}
			if template == "Q03" {
				if q.Objectives.Clue == "" || q.Objectives.Item != "" {
					t.Fatal("missing clue custody")
				}
			} else if q.Objectives.Item == "" {
				t.Fatal("missing parcel custody")
			}
			// Save uses the normal JSON save conversion, then reload resets arrival
			// context while preserving the owned item/clue and objective cursor.
			ss, err := g.ToSaveState("Mid quest", "test")
			if err != nil {
				t.Fatal(err)
			}
			savedProgress := *q.Objectives
			g, err = FromSaveState(ss, g.gd, g.loc)
			if err != nil {
				t.Fatal(err)
			}
			q = &g.quests[0]
			if *q.Objectives != savedProgress {
				t.Fatalf("progress changed on load: %+v", q.Objectives)
			}
			if g.questVisitNodeID != "" {
				t.Fatal("load retained stale interior visit")
			}
			destination := q.Actions[2].Location
			if _, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: destination}); err != nil {
				t.Fatal(err)
			}
			req = objectiveAction(g)
			// Prove handoff requires server-held custody, even at the right place.
			held := *q.Objectives
			q.Objectives.Item, q.Objectives.Clue = "", ""
			if _, err := g.ProcessAction(req); err == nil {
				t.Fatal("accepted missing custody")
			}
			*q.Objectives = held
			if _, err := g.ProcessAction(req); err != nil {
				t.Fatal(err)
			}
			if !q.Completed || g.currentQ != 1 || g.inv.Gold != gold+37 || q.Objectives.Item != "" || q.Objectives.Clue != "" {
				t.Fatal("completion/reward/custody incorrect")
			}
			if _, err := g.ProcessAction(req); err == nil {
				t.Fatal("accepted completed quest replay")
			}
			if g.inv.Gold != gold+37 {
				t.Fatal("duplicate reward")
			}
		})
	}
}

func TestQuestObjectivesLegacySaveMigration(t *testing.T) {
	g := objectiveTestGame(t, "Q02")
	g.quests[0].Objectives = nil
	g.quests[1] = generator.Quest{ID: "completed", TemplateID: "Q01", Completed: true}
	ss, err := g.ToSaveState("legacy", "test")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if restored.quests[0].Objectives == nil || restored.quests[1].Objectives != nil || !restored.quests[1].Completed {
		t.Fatal("legacy migration changed completed quest or missed active one")
	}
}

func TestQuestObjectivesIsolationAndInvalidVisits(t *testing.T) {
	g := objectiveTestGame(t, "Q01")
	q := &g.quests[0]
	for _, id := range []string{"", "fabricated_npc", q.TargetNodeID + "_npc999"} {
		if _, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: id}); err != nil {
			t.Fatal(err)
		}
		if q.Objectives.Step != 0 {
			t.Fatal("invalid visit advanced objectives")
		}
	}
	for _, template := range []string{"Q12", "promotion", "Q04"} {
		clone := *q
		clone.TemplateID = template
		if g.advanceObjectiveArrival(&clone, q.TargetNodeID) {
			t.Fatalf("handled %s", template)
		}
	}
	clone := *q
	clone.IsPromotion = true
	if g.advanceObjectiveArrival(&clone, q.TargetNodeID) {
		t.Fatal("handled promotion")
	}
	state := g.State()
	before, _ := json.Marshal(q)
	state.Quests[0].Objectives.Step = 88
	state.Quests[0].Actions[0].Location = "changed"
	after, _ := json.Marshal(q)
	if string(before) != string(after) {
		t.Fatal("state response aliases server quest")
	}
}
