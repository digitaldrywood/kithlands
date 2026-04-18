package combat_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/combat"
)

func TestIssue233_DeadCombatantDoesNotActLaterInSameRound(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	hero := makeWarrior("Hero", 10, 0)
	hero.AGI = 999
	hero.HitPct = 999
	hero.STR = 999

	slime := makeEnemy(2, "Slime", 5, 1, 1, 0)

	results := combat.ResolveTurn(
		[]*combat.Combatant{hero},
		[]*combat.Combatant{slime},
		[]combat.Action{
			{ActorID: hero.ID, Kind: combat.ActionAttack, TargetID: slime.ID},
			{ActorID: slime.ID, Kind: combat.ActionAttack, TargetID: hero.ID},
		},
		stats,
		rand.New(rand.NewPCG(42, 0)),
	)

	acted := 0
	for _, result := range results {
		if result.Kind == combat.ActionPoisonTick {
			continue
		}
		acted++
		if result.ActorID == slime.ID {
			t.Fatalf("dead slime should not act after being killed earlier in the round: %+v", result)
		}
	}

	if acted != 1 {
		t.Fatalf("resolved non-poison actions = %d, want 1", acted)
	}
	if slime.CurrentHP != 0 {
		t.Fatalf("slime HP after lethal hit = %d, want 0", slime.CurrentHP)
	}
}
