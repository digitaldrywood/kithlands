package combat_test

import (
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"math/rand/v2"
	"testing"
)

func TestBramblehogPreparationAndDefendedRush(t *testing.T) {
	gd := loadTestData(t)
	m := gd.MonsterByID("bramblehog")
	run := func(guard bool) (damage, prevented int) {
		enemy := makeEnemy(100, m.Name, 20, 2, 200, 0)
		enemy.MonsterID = m.ID
		enemy.HitPct = 100
		player := makeWarrior("Hero", 5, 0)
		player.CurrentHP, player.MaxHP = 1000, 1000
		party, enemies := []*combat.Combatant{player}, []*combat.Combatant{enemy}
		rng := rand.New(rand.NewPCG(51, 0))
		preparation, ok := combat.PlanEnemyAction(enemy, party, m, 0, rng)
		if !ok {
			t.Fatal("no preparation")
		}
		result := combat.ResolveTurn(party, enemies, []combat.Action{preparation}, &gd.Stats.Combat, rng)
		if len(result) != 1 || result[0].TotalDmg != 0 || player.CurrentHP != 1000 || len(enemy.Buffs) != 1 {
			t.Fatal("preparing must consume the action and grant focus without damage")
		}
		for round := 1; round <= 2; round++ {
			action, _ := combat.PlanEnemyAction(enemy, party, m, round, rng)
			actions := []combat.Action{action}
			if guard {
				actions = append(actions, combat.Action{ActorID: player.ID, Kind: combat.ActionDefend})
			}
			for _, r := range combat.ResolveTurn(party, enemies, actions, &gd.Stats.Combat, rng) {
				if r.ActorID == enemy.ID {
					damage += r.TotalDmg
					prevented += r.DamagePrevented
				}
			}
		}
		if len(enemy.Buffs) != 0 {
			t.Fatal("focus must expire after the two rush turns")
		}
		return
	}
	open, _ := run(false)
	// Defend contributes an initiative roll, so compare protection accounting
	// inside the defended run rather than treating different RNG streams as equal.
	guarded, prevented := run(true)
	if open <= 0 || guarded <= 0 || prevented <= 0 || prevented > guarded+4 {
		t.Fatalf("rush/defense ineffective: open=%d guard=%d prevented=%d", open, guarded, prevented)
	}
}

func TestEnemyPlanLeavesInterruptionsAndRetargetingToResolution(t *testing.T) {
	gd := loadTestData(t)
	m := gd.MonsterByID("bramblehog")
	for _, status := range []character.Status{character.StatusSleep, character.StatusStone, character.StatusDeath} {
		enemy := makeEnemy(100, m.Name, 20, 1, 200, 0)
		enemy.Status = status
		player := makeWarrior("Hero", 5, 0)
		party, enemies := []*combat.Combatant{player}, []*combat.Combatant{enemy}
		rng := rand.New(rand.NewPCG(1, 0))
		action, _ := combat.PlanEnemyAction(enemy, party, m, 0, rng)
		if got := combat.ResolveAction(party, enemies, action, &gd.Stats.Combat, rng); len(got) != 0 || len(enemy.Buffs) != 0 {
			t.Fatalf("%s enemy executed preparation", status)
		}
	}
	enemy := makeEnemy(100, m.Name, 20, 1, 200, 0)
	first, second := makeWarrior("Hero", 5, 0), makeWarrior("Cinder", 5, 0)
	second.ID = 2
	party, enemies := []*combat.Combatant{first, second}, []*combat.Combatant{enemy}
	rng := rand.New(rand.NewPCG(7, 0))
	action, _ := combat.PlanEnemyAction(enemy, party, m, 1, rng)
	if action.TargetID == first.ID {
		first.CurrentHP = 0
	} else {
		second.CurrentHP = 0
	}
	result := combat.ResolveAction(party, enemies, action, &gd.Stats.Combat, rng)
	if len(result) != 1 || result[0].TargetID == action.TargetID {
		t.Fatal("invalidated target was not retargeted")
	}
	enemy.CurrentHP = 0
	if result := combat.ResolveAction(party, enemies, action, &gd.Stats.Combat, rng); len(result) != 0 {
		t.Fatal("defeated actor executed plan")
	}
}

func TestEnemyPreparationCanWakeButConfusionReplacesIt(t *testing.T) {
	gd := loadTestData(t)
	m := gd.MonsterByID("bramblehog")
	enemy := makeEnemy(100, m.Name, 6, 1, 200, 0)
	player := makeWarrior("Hero", 5, 0)
	player.AGI, player.HitPct = 1000, 100
	party, enemies := []*combat.Combatant{player}, []*combat.Combatant{enemy}
	rng := rand.New(rand.NewPCG(7, 0))
	enemy.Status = character.StatusSleep
	plan, _ := combat.PlanEnemyAction(enemy, party, m, 0, rng)
	results := combat.ResolveTurn(party, enemies, []combat.Action{
		{ActorID: player.ID, Kind: combat.ActionAttack, TargetID: enemy.ID}, plan,
	}, &gd.Stats.Combat, rng)
	if len(results) != 2 || results[0].ActorID != player.ID || results[0].TotalDmg <= 0 ||
		results[1].Kind != combat.ActionAbility || len(enemy.Buffs) != 1 {
		t.Fatal("a faster hit must wake the sleeping enemy before its planned preparation")
	}
	enemy.Status, enemy.Buffs = character.StatusConfuse, nil
	plan, _ = combat.PlanEnemyAction(enemy, party, m, 0, rng)
	results = combat.ResolveAction(party, enemies, plan, &gd.Stats.Combat, rng)
	if len(results) != 1 || results[0].Kind != combat.ActionConfusion || len(enemy.Buffs) != 0 {
		t.Fatal("confusion must replace preparation with a random attack and no focus buff")
	}
}
