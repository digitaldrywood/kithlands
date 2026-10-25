package api

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/generator"
)

func escortArrive(t *testing.T, g *Game, node string) {
	t.Helper()
	arriveAtWorldNode(t, g, node)
	if _, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: node}); err != nil {
		t.Fatal(err)
	}
}

func escortJoin(t *testing.T, g *Game) {
	t.Helper()
	q := &g.quests[0]
	escortArrive(t, g, q.GiverNodeID)
	if _, err := g.ProcessAction(objectiveAction(g)); err != nil {
		t.Fatal(err)
	}
	escortArrive(t, g, q.TargetNodeID)
	if q.Completed || q.Objectives.Step != 3 {
		t.Fatal("arrival completed escort")
	}
	if _, err := g.ProcessAction(objectiveAction(g)); err != nil {
		t.Fatal(err)
	}
}

func TestEscortReturnCustodyReplayAndSave(t *testing.T) {
	g := objectiveTestGame(t, "Q05")
	initialGold := g.inv.Gold
	if _, err := g.ProcessAction(GameActionRequest{Type: "quest_action", QuestID: g.quests[0].ID, ObjectiveIndex: 5, NodeID: g.quests[0].GiverNodeID}); err == nil {
		t.Fatal("accepted remote reunion")
	}
	escortJoin(t, g)
	q := &g.quests[0]
	if q.Objectives.Companion != "lost traveler" || q.Objectives.CompanionSprite != "wayfarer" || g.inv.Gold != initialGold {
		t.Fatal("join custody or premature payout")
	}
	for _, pendingReport := range []bool{false, true} {
		if pendingReport {
			escortArrive(t, g, q.GiverNodeID)
		}
		ss, err := g.ToSaveState("Escort in progress", "test")
		if err != nil {
			t.Fatal(err)
		}
		held := *q.Objectives
		g, err = FromSaveState(ss, g.gd, g.loc)
		if err != nil {
			t.Fatal(err)
		}
		q = &g.quests[0]
		if *q.Objectives != held {
			t.Fatal("lost escort on save/load")
		}
	}
	escortArrive(t, g, q.GiverNodeID)
	req := objectiveAction(g)
	held := *q.Objectives
	for _, missing := range []string{"companion", "clue"} {
		if missing == "companion" {
			q.Objectives.Companion = ""
		} else {
			q.Objectives.Clue = ""
		}
		if _, err := g.ProcessAction(req); err == nil {
			t.Fatalf("accepted missing %s", missing)
		}
		if missing == "clue" && q.Objectives.Companion != held.Companion {
			t.Fatal("rejected report mutated custody")
		}
		*q.Objectives = held
	}
	if _, err := g.ProcessAction(req); err != nil {
		t.Fatal(err)
	}
	if !q.Completed || q.Objectives.Companion != "" || g.inv.Gold != initialGold+37 {
		t.Fatal("reunion payout incorrect")
	}
	if _, err := g.ProcessAction(req); err == nil {
		t.Fatal("accepted reward replay")
	}
	if g.inv.Gold != initialGold+37 {
		t.Fatal("duplicate reward")
	}
}

func TestEscortDefeatRecoveryAndRejoin(t *testing.T) {
	g := objectiveTestGame(t, "Q05")
	escortJoin(t, g)
	q := &g.quests[0]
	gold := g.inv.Gold
	// An ordinary victory is not a reunion.
	g.completeObjectiveEncounter()
	if q.Completed || q.Objectives.Step != 4 {
		t.Fatal("unrelated victory completed escort")
	}
	// The real defeat resolver must recover world travel without awarding a quest.
	for _, c := range g.party {
		c.CurrentHP = 0
	}
	g.phase = "combat"
	g.enemies = []*combat.Combatant{{ID: 100, MaxHP: 10, CurrentHP: 10}}
	g.resolveCombatOutcome(g.makeCombatants())
	if g.phase != "world" || q.Objectives.Companion != "" || q.Objectives.Step != 2 || q.Objectives.Recovery != "defeat" || q.Objectives.Clue == "" || g.inv.Gold != gold {
		t.Fatal("escort defeat did not reset search safely")
	}
	for _, c := range g.party {
		if !c.IsAlive() {
			t.Fatal("party not recovered")
		}
	}
	ss, err := g.ToSaveState("Escort recovery", "test")
	if err != nil {
		t.Fatal(err)
	}
	g, err = FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	q = &g.quests[0]
	escortArrive(t, g, q.TargetNodeID)
	if _, err = g.ProcessAction(objectiveAction(g)); err != nil {
		t.Fatal(err)
	}
	if q.Objectives.Companion == "" || q.Objectives.Recovery != "" {
		t.Fatal("cannot rejoin after recovery")
	}
}

func TestEscortCompletedLegacyRemainsCompleted(t *testing.T) {
	g := objectiveTestGame(t, "Q05")
	g.quests[0] = generator.Quest{ID: "old", TemplateID: "Q05", Completed: true}
	generator.PrepareObjectives(g.quests, g.loc, g.walk.Spawn.ID, g.gd.QuestObjectives)
	if !g.quests[0].Completed || g.quests[0].Objectives != nil {
		t.Fatal("reopened completed legacy escort")
	}
}

func TestEscortRetreatKeepsTravelerAndDungeonDefeatIsSeparate(t *testing.T) {
	g := objectiveTestGame(t, "Q05")
	escortJoin(t, g)
	q := &g.quests[0]
	held := *q.Objectives
	g.phase = "combat"
	g.enemies = []*combat.Combatant{{ID: 100, MaxHP: 10, CurrentHP: 10}}
	for i := 0; i < 200 && g.phase == "combat"; i++ {
		if _, err := g.ProcessAction(GameActionRequest{Type: "flee"}); err != nil {
			t.Fatal(err)
		}
	}
	if g.phase != "world" || *q.Objectives != held {
		t.Fatal("retreat lost escort")
	}
	g.phase = "defeat"
	g.location.Kind = LocationDungeon
	g.recoverEscortDefeat()
	if g.phase != "defeat" || *q.Objectives != held {
		t.Fatal("escort replaced dungeon recovery")
	}
}

func TestEscortLegacyUnfinishedSaveGetsPlanWithoutMovingSearchSite(t *testing.T) {
	g := objectiveTestGame(t, "Q05")
	q := &g.quests[0]
	target, reward := q.TargetNodeID, q.Reward
	q.Objectives = nil
	q.Actions = []generator.QuestAction{{Type: generator.ActionLearn}, {Type: generator.ActionGoto, Location: target}, {Type: generator.ActionEscort}}
	ss, err := g.ToSaveState("Legacy unfinished escort", "test")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	q = &restored.quests[0]
	if q.Completed || q.Objectives == nil || q.Objectives.Step != 0 || len(q.Actions) != 6 || q.TargetNodeID != target || q.Reward != reward {
		t.Fatal("legacy escort migration changed progress, site or reward")
	}
}
