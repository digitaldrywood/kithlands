package combat_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
)

func TestDefendProtectsAgainstFasterPhysicalAttackAndExpires(t *testing.T) {
	gd := loadTestData(t)
	for seed := uint64(0); seed < 40; seed++ {
		run := func(defend bool) ([]combat.ResolvedAction, *combat.Combatant) {
			guard := makeWarrior("Guard", 0, 0)
			guard.CurrentHP, guard.MaxHP, guard.AGI = 10000, 10000, 1
			striker := makeEnemy(10, "Fast striker", 30, 100, 10000, 0)
			striker.HitPct, striker.CritPct = 64, 100
			kind := combat.ActionAttack
			if defend {
				kind = combat.ActionDefend
			}
			results := combat.ResolveTurn([]*combat.Combatant{guard}, []*combat.Combatant{striker},
				[]combat.Action{{ActorID: guard.ID, Kind: kind, TargetID: striker.ID},
					{ActorID: striker.ID, Kind: combat.ActionAttack, TargetID: guard.ID}},
				&gd.Stats.Combat, rand.New(rand.NewPCG(seed, 0)))
			return results, guard
		}
		open, _ := run(false)
		guarded, guard := run(true)
		if open[0].ActorID != 10 || guarded[0].ActorID != 10 {
			t.Fatal("fixture must exercise an attack before the guard's initiative")
		}
		for i, hit := range open[0].Hits {
			want := max(gd.Stats.Combat.MinDamagePerHit, hit.Damage/2)
			if hit.Missed {
				want = 0
			}
			if got := guarded[0].Hits[i].Damage; got != want {
				t.Fatalf("seed %d hit %d: guarded damage %d, want %d from %d", seed, i, got, want, hit.Damage)
			}
		}
		// A later direct attack after end-of-round cleanup must do normal damage.
		striker := makeEnemy(10, "Fast striker", 30, 100, 10000, 0)
		striker.HitPct, striker.CritPct = 64, 100
		later := combat.ResolveAction([]*combat.Combatant{guard}, []*combat.Combatant{striker},
			combat.Action{ActorID: striker.ID, Kind: combat.ActionAttack, TargetID: guard.ID},
			&gd.Stats.Combat, rand.New(rand.NewPCG(seed, 9)))
		fresh := *guard
		fresh.Defending = false
		normal := combat.ResolveAction([]*combat.Combatant{&fresh}, []*combat.Combatant{striker},
			combat.Action{ActorID: striker.ID, Kind: combat.ActionAttack, TargetID: fresh.ID},
			&gd.Stats.Combat, rand.New(rand.NewPCG(seed, 9)))
		if guard.Defending || len(later) != 1 || len(normal) != 1 || later[0].TotalDmg != normal[0].TotalDmg {
			t.Fatal("guard must clear at round end")
		}
	}
}

func TestDefendReducesPhysicalAbilityAndPreservesMinimumDamage(t *testing.T) {
	gd := loadTestData(t)
	for _, strength := range []int{1, 30} {
		striker := makeEnemy(10, "Striker", strength, 10, 10000, 0)
		guard := makeWarrior("Guard", 0, 0)
		guard.CurrentHP, guard.MaxHP = 10000, 10000
		attack := combat.Action{ActorID: striker.ID, Kind: combat.ActionAbility, AbilityID: "backstab", TargetID: guard.ID}
		if strength == 1 {
			guard.ArmorAbsorb = 999
		}
		open := combat.ResolveAction([]*combat.Combatant{guard}, []*combat.Combatant{striker}, attack, &gd.Stats.Combat, rand.New(rand.NewPCG(7, 0)))
		guard.Defending = true
		blocked := combat.ResolveAction([]*combat.Combatant{guard}, []*combat.Combatant{striker}, attack, &gd.Stats.Combat, rand.New(rand.NewPCG(7, 0)))
		if blocked[0].TotalDmg != max(gd.Stats.Combat.MinDamagePerHit, open[0].TotalDmg/2) {
			t.Fatalf("strength %d: open %d, defended %d", strength, open[0].TotalDmg, blocked[0].TotalDmg)
		}
	}
}

func TestIncapacitatedMembersCannotPrepareDefend(t *testing.T) {
	for _, status := range []character.Status{character.StatusSleep, character.StatusStone, character.StatusDeath, character.StatusConfuse} {
		guard := makeWarrior("Guard", 0, 0)
		guard.Status = status
		combat.PrepareRoundDefenses([]*combat.Combatant{guard}, nil,
			[]combat.Action{{ActorID: guard.ID, Kind: combat.ActionDefend}})
		if guard.Defending {
			t.Fatalf("%s cannot establish a guard", status)
		}
	}
}
