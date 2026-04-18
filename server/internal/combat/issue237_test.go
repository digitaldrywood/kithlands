package combat_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/combat"
)

func TestIssue237_PartyQueuedAttackDoesNotResolveAfterVictory(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	leader := makeWarrior("Leader", 10, 0)
	leader.ID = 1
	leader.AGI = 999
	leader.HitPct = 999
	leader.STR = 999

	ally := makeWarrior("Ally", 10, 1)
	ally.ID = 2
	ally.AGI = 1

	slime := makeEnemy(3, "Slime", 5, 1, 1, 0)
	slime.CurrentHP = 1

	results := combat.ResolveTurn(
		[]*combat.Combatant{leader, ally},
		[]*combat.Combatant{slime},
		[]combat.Action{
			{ActorID: leader.ID, Kind: combat.ActionAttack, TargetID: slime.ID},
			{ActorID: ally.ID, Kind: combat.ActionAttack, TargetID: slime.ID},
		},
		stats,
		rand.New(rand.NewPCG(42, 0)),
	)

	nonPoison := 0
	for _, result := range results {
		if result.Kind == combat.ActionPoisonTick {
			continue
		}
		nonPoison++
		if result.ActorID == ally.ID {
			t.Fatalf("ally attack should not resolve after the last enemy dies: %+v", result)
		}
	}

	if nonPoison != 1 {
		t.Fatalf("resolved non-poison actions = %d, want 1", nonPoison)
	}
	if !combat.CheckVictory([]*combat.Combatant{slime}) {
		t.Fatalf("enemy should be defeated after leader's lethal attack")
	}
}
