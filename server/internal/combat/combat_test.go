package combat_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func loadTestData(t *testing.T) *gamedata.GameData {
	t.Helper()
	return gamedata.Load("../../../shared")
}

func makeWarrior(name string, weaponPower, armorAbsorb int) *combat.Combatant {
	return &combat.Combatant{
		ID: 1, Name: name, IsPlayer: true,
		STR: 20, AGI: 5, INT: 1, VIT: 10, LCK: 5, HitPct: 10,
		MaxHP: 35, CurrentHP: 35,
		WeaponPower: weaponPower, ArmorAbsorb: armorAbsorb,
	}
}

func makeEnemy(id int, name string, str, agi, hp, armor int) *combat.Combatant {
	return &combat.Combatant{
		ID: id, Name: name, IsPlayer: false,
		STR: str, AGI: agi, INT: 1, VIT: 5, LCK: 3, HitPct: 5,
		MaxHP: hp, CurrentHP: hp,
		WeaponPower: 0, ArmorAbsorb: armor,
	}
}

func TestDamageNeverZero(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	// Very weak attacker vs heavily armored defender
	attacker := &combat.Combatant{
		ID: 1, Name: "Weakling", IsPlayer: true,
		STR: 1, AGI: 50, INT: 1, VIT: 1, LCK: 0, HitPct: 100,
		MaxHP: 100, CurrentHP: 100,
		WeaponPower: 0,
	}
	defender := &combat.Combatant{
		ID: 2, Name: "Tank", IsPlayer: false,
		STR: 1, AGI: 1, INT: 1, VIT: 1, LCK: 0, HitPct: 0,
		MaxHP: 1000, CurrentHP: 1000,
		ArmorAbsorb: 999,
	}

	for i := 0; i < 1000; i++ {
		defender.CurrentHP = 1000
		defender.Status = character.StatusNone
		rng := rand.New(rand.NewPCG(uint64(i), 0))

		actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
		results := combat.ResolveTurn(
			[]*combat.Combatant{attacker},
			[]*combat.Combatant{defender},
			actions, stats, rng,
		)

		for _, r := range results {
			for _, h := range r.Hits {
				if !h.Missed && h.Damage < 1 {
					t.Fatalf("damage was %d, minimum is 1", h.Damage)
				}
			}
		}
	}
}

func TestMultiHitScaling(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	enemy := makeEnemy(2, "Goblin", 5, 1, 500, 0)

	tests := []struct {
		hitPct   int
		wantHits int
	}{
		{0, 1},
		{10, 1},
		{31, 1},
		{32, 2},
		{63, 2},
		{64, 3},
		{96, 4},
	}

	for _, tt := range tests {
		enemy.CurrentHP = 500
		enemy.Status = character.StatusNone
		attacker := makeWarrior("Tester", 10, 0)
		attacker.HitPct = tt.hitPct
		attacker.AGI = 50 // ensure high hit chance

		rng := rand.New(rand.NewPCG(42, 0))
		actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
		results := combat.ResolveTurn(
			[]*combat.Combatant{attacker},
			[]*combat.Combatant{enemy},
			actions, stats, rng,
		)

		if len(results) == 0 {
			t.Errorf("hitPct=%d: no results", tt.hitPct)
			continue
		}
		gotHits := len(results[0].Hits)
		if gotHits != tt.wantHits {
			t.Errorf("hitPct=%d: got %d hits, want %d", tt.hitPct, gotHits, tt.wantHits)
		}
	}
}

func TestCritDoublesBaseDamage(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	// High LCK to guarantee crits
	attacker := makeWarrior("Critter", 10, 0)
	attacker.LCK = 400 // crit chance = 400/4 = 100%
	attacker.AGI = 50

	enemy := makeEnemy(2, "Target", 1, 1, 10000, 0)

	rng := rand.New(rand.NewPCG(42, 0))
	actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
	results := combat.ResolveTurn(
		[]*combat.Combatant{attacker},
		[]*combat.Combatant{enemy},
		actions, stats, rng,
	)

	if len(results) == 0 || len(results[0].Hits) == 0 {
		t.Fatal("no hits")
	}

	for _, h := range results[0].Hits {
		if h.Missed {
			continue
		}
		if !h.Crit {
			t.Error("expected crit with 100% crit chance")
		}
		// With crit multiplier 2, damage should be at least 2 (2 * min 1)
		if h.Damage < 2 {
			t.Errorf("crit damage %d too low", h.Damage)
		}
	}
}

func TestVictoryCondition(t *testing.T) {
	enemies := []*combat.Combatant{
		{ID: 1, CurrentHP: 0, Status: character.StatusDeath},
		{ID: 2, CurrentHP: 0, Status: character.StatusDeath},
	}
	if !combat.CheckVictory(enemies) {
		t.Error("should be victory when all enemies dead")
	}

	enemies[0].CurrentHP = 1
	enemies[0].Status = character.StatusNone
	if combat.CheckVictory(enemies) {
		t.Error("should not be victory when an enemy lives")
	}
}

func TestDefeatCondition(t *testing.T) {
	party := []*combat.Combatant{
		{ID: 1, CurrentHP: 0, Status: character.StatusDeath},
		{ID: 2, CurrentHP: 0, Status: character.StatusDeath},
	}
	if !combat.CheckDefeat(party) {
		t.Error("should be defeat when all party dead")
	}

	party[0].CurrentHP = 1
	party[0].Status = character.StatusNone
	if combat.CheckDefeat(party) {
		t.Error("should not be defeat when a member lives")
	}
}

func TestStonedCountsAsDefeated(t *testing.T) {
	party := []*combat.Combatant{
		{ID: 1, CurrentHP: 50, Status: character.StatusStone},
		{ID: 2, CurrentHP: 0, Status: character.StatusDeath},
	}
	if !combat.CheckDefeat(party) {
		t.Error("stoned + dead should count as defeat")
	}
}

func TestEnemyTargetingWeights(t *testing.T) {
	party := []*combat.Combatant{
		{ID: 0, Name: "Slot0", CurrentHP: 100, MaxHP: 100},
		{ID: 1, Name: "Slot1", CurrentHP: 100, MaxHP: 100},
		{ID: 2, Name: "Slot2", CurrentHP: 100, MaxHP: 100},
		{ID: 3, Name: "Slot3", CurrentHP: 100, MaxHP: 100},
	}

	hits := make(map[int]int)
	trials := 10000
	for i := 0; i < trials; i++ {
		rng := rand.New(rand.NewPCG(uint64(i), 0))
		target := combat.SelectEnemyTarget(party, rng)
		if target != nil {
			hits[target.ID]++
		}
	}

	// Slot 0 should get ~50%, slot 1 ~25%, slots 2-3 ~12.5% each
	slot0Rate := float64(hits[0]) / float64(trials)
	if slot0Rate < 0.40 || slot0Rate > 0.60 {
		t.Errorf("slot 0 hit rate: %.2f, want ~0.50", slot0Rate)
	}
	slot1Rate := float64(hits[1]) / float64(trials)
	if slot1Rate < 0.18 || slot1Rate > 0.32 {
		t.Errorf("slot 1 hit rate: %.2f, want ~0.25", slot1Rate)
	}
}

func TestDeadCombatantCannotAct(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	attacker := makeWarrior("Dead", 10, 0)
	attacker.CurrentHP = 0
	attacker.Status = character.StatusDeath

	enemy := makeEnemy(2, "Goblin", 5, 1, 20, 0)

	rng := rand.New(rand.NewPCG(42, 0))
	actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
	results := combat.ResolveTurn(
		[]*combat.Combatant{attacker},
		[]*combat.Combatant{enemy},
		actions, stats, rng,
	)

	if len(results) != 0 {
		t.Error("dead combatant should not produce actions")
	}
}

func TestSleepingCombatantCannotAct(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	attacker := makeWarrior("Sleepy", 10, 0)
	attacker.Status = character.StatusSleep

	enemy := makeEnemy(2, "Goblin", 5, 1, 20, 0)

	rng := rand.New(rand.NewPCG(42, 0))
	actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
	results := combat.ResolveTurn(
		[]*combat.Combatant{attacker},
		[]*combat.Combatant{enemy},
		actions, stats, rng,
	)

	if len(results) != 0 {
		t.Error("sleeping combatant should not produce actions")
	}
}

func TestRetargetOnDeadTarget(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	attacker := makeWarrior("Hero", 10, 0)
	attacker.AGI = 50

	dead := makeEnemy(2, "DeadGoblin", 5, 1, 0, 0)
	dead.CurrentHP = 0
	dead.Status = character.StatusDeath

	alive := makeEnemy(3, "LiveGoblin", 5, 1, 50, 0)

	rng := rand.New(rand.NewPCG(42, 0))
	actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
	results := combat.ResolveTurn(
		[]*combat.Combatant{attacker},
		[]*combat.Combatant{dead, alive},
		actions, stats, rng,
	)

	if len(results) == 0 {
		t.Fatal("expected retarget to living enemy")
	}
	if results[0].TargetID != 3 {
		t.Errorf("should retarget to living enemy (3), got %d", results[0].TargetID)
	}
}
