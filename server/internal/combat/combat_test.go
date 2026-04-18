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

func TestPhysicalDamageVarianceSwingsAboveAndBelowNominal(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	attacker := &combat.Combatant{
		ID: 1, Name: "Variance", IsPlayer: true,
		STR: 24, AGI: 50, INT: 1, VIT: 10, LCK: 0, HitPct: 30,
		MaxHP: 100, CurrentHP: 100,
		WeaponPower: 12,
	}
	defender := &combat.Combatant{
		ID: 2, Name: "Dummy", IsPlayer: false,
		STR: 1, AGI: 0, INT: 1, VIT: 1, LCK: 0, HitPct: 0,
		MaxHP: 10_000, CurrentHP: 10_000,
		ArmorAbsorb: 8,
	}

	nominal := (attacker.STR + attacker.WeaponPower) - defender.ArmorAbsorb
	minDmg := 1 << 30
	maxDmg := 0

	for seed := uint64(0); seed < 256; seed++ {
		defender.CurrentHP = 10_000
		defender.Status = character.StatusNone
		rng := rand.New(rand.NewPCG(seed, 0))
		results := combat.ResolveTurn(
			[]*combat.Combatant{attacker},
			[]*combat.Combatant{defender},
			[]combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}},
			stats, rng,
		)
		if len(results) == 0 || len(results[0].Hits) == 0 || results[0].Hits[0].Missed {
			t.Fatalf("expected a landed hit for seed %d", seed)
		}
		dmg := results[0].Hits[0].Damage
		if dmg < minDmg {
			minDmg = dmg
		}
		if dmg > maxDmg {
			maxDmg = dmg
		}
	}

	if minDmg >= nominal {
		t.Fatalf("minimum damage %d should dip below nominal %d", minDmg, nominal)
	}
	if maxDmg <= nominal {
		t.Fatalf("maximum damage %d should rise above nominal %d", maxDmg, nominal)
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

func TestBrawlerBareHandScaling(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	// Formula (per game_world.go:111-114): base + level*STR/2
	// Level 1 STR 5  -> 5 + 1*5/2 = 7
	// Level 20 STR 25 -> 5 + 20*25/2 = 255
	cases := []struct {
		level    int
		str      int
		wantBare int
	}{
		{1, 5, 7},
		{5, 10, 30},
		{20, 25, 255},
	}
	for _, tc := range cases {
		bare := 5 + tc.level*tc.str/2
		if bare != tc.wantBare {
			t.Fatalf("formula drift: level=%d str=%d got %d want %d", tc.level, tc.str, bare, tc.wantBare)
		}

		brawler := &combat.Combatant{
			ID: 1, Name: "Brawler", IsPlayer: true,
			STR: tc.str, AGI: 10, LCK: 0, HitPct: 31, // single hit, toHit > 100
			MaxHP: 100, CurrentHP: 100,
			BareHandDamage: bare,
		}
		dummy := makeEnemy(2, "Dummy", 1, 1, 1_000_000, 0)
		dummy.AGI = 0 // guaranteed hit together with HitPct 31

		rng := rand.New(rand.NewPCG(42, 0))
		actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
		results := combat.ResolveTurn(
			[]*combat.Combatant{brawler},
			[]*combat.Combatant{dummy},
			actions, stats, rng,
		)
		if len(results) == 0 || results[0].TotalDmg <= 0 {
			t.Fatalf("level=%d: bare-hand produced no damage", tc.level)
		}
		// Sanity: damage is in the same order of magnitude as bare-hand base.
		if results[0].TotalDmg < bare/2 || results[0].TotalDmg > bare*3 {
			t.Errorf("level=%d: bare-hand dmg=%d not close to base %d", tc.level, results[0].TotalDmg, bare)
		}
	}
}

func TestFocusBuffIncreasesDamage(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	makeAttacker := func() *combat.Combatant {
		return &combat.Combatant{
			ID: 1, Name: "Fighter", IsPlayer: true,
			STR: 20, AGI: 10, LCK: 0, HitPct: 10, // single hit
			MaxHP: 100, CurrentHP: 100,
			WeaponPower: 10,
		}
	}

	// Baseline damage across many seeds
	baseline := 0
	for seed := uint64(0); seed < 200; seed++ {
		a := makeAttacker()
		d := makeEnemy(2, "Dummy", 1, 0, 100_000, 0)
		rng := rand.New(rand.NewPCG(seed, 0))
		results := combat.ResolveTurn(
			[]*combat.Combatant{a},
			[]*combat.Combatant{d},
			[]combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}},
			stats, rng,
		)
		if len(results) > 0 {
			baseline += results[0].TotalDmg
		}
	}

	// Focused damage
	focused := 0
	for seed := uint64(0); seed < 200; seed++ {
		a := makeAttacker()
		d := makeEnemy(2, "Dummy", 1, 0, 100_000, 0)
		rng := rand.New(rand.NewPCG(seed, 0))

		// Apply focus via the dispatcher, then attack.
		// Note: ResolveTurn ticks buffs at end-of-round, so we must cast focus
		// and attack within the *same* ResolveTurn call for the buff to apply.
		results := combat.ResolveTurn(
			[]*combat.Combatant{a},
			[]*combat.Combatant{d},
			[]combat.Action{
				{ActorID: 1, Kind: combat.ActionAbility, TargetID: 1, AbilityID: "focus"},
			},
			stats, rng,
		)
		if len(results) == 0 {
			t.Fatalf("focus produced no result")
		}
		// Second turn: attack while focus is still active (TurnsLeft 3 -> 2 after tick).
		rng2 := rand.New(rand.NewPCG(seed, 1))
		results = combat.ResolveTurn(
			[]*combat.Combatant{a},
			[]*combat.Combatant{d},
			[]combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}},
			stats, rng2,
		)
		if len(results) > 0 {
			focused += results[0].TotalDmg
		}
	}

	if focused <= baseline {
		t.Fatalf("focus did not increase damage: baseline=%d focused=%d", baseline, focused)
	}
	// Expect roughly 1.3x-1.7x (formula is *1.5 on base damage before mitigation and variance).
	ratio := float64(focused) / float64(baseline)
	if ratio < 1.2 || ratio > 1.8 {
		t.Errorf("focus damage ratio %.2f outside expected band ~1.5", ratio)
	}
}

func TestInspireBuffsAllAllies(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	wayfarer := &combat.Combatant{
		ID: 1, Name: "Wayfarer", IsPlayer: true,
		STR: 10, AGI: 10, LCK: 0, HitPct: 10,
		MaxHP: 30, CurrentHP: 30,
	}
	ally1 := &combat.Combatant{
		ID: 2, Name: "Warrior", IsPlayer: true,
		STR: 20, AGI: 5, HitPct: 10,
		MaxHP: 35, CurrentHP: 35,
	}
	ally2 := &combat.Combatant{
		ID: 3, Name: "Brawler", IsPlayer: true,
		STR: 5, AGI: 5, HitPct: 5,
		MaxHP: 33, CurrentHP: 33, BareHandDamage: 10,
	}
	dummy := makeEnemy(9, "Dummy", 1, 0, 1000, 0)

	rng := rand.New(rand.NewPCG(42, 0))
	results := combat.ResolveTurn(
		[]*combat.Combatant{wayfarer, ally1, ally2},
		[]*combat.Combatant{dummy},
		[]combat.Action{{ActorID: 1, Kind: combat.ActionAbility, TargetID: 1, AbilityID: "inspire"}},
		stats, rng,
	)
	if len(results) != 1 {
		t.Fatalf("expected 1 inspire result, got %d", len(results))
	}

	for _, c := range []*combat.Combatant{wayfarer, ally1, ally2} {
		found := false
		for _, b := range c.Buffs {
			if b.Kind == "inspire" && b.DamageMult == 125 {
				found = true
				break
			}
		}
		// ResolveTurn ticked at end, so TurnsLeft was decremented from 3 to 2;
		// buff should still be present.
		if !found {
			t.Errorf("%s missing inspire buff (buffs=%+v)", c.Name, c.Buffs)
		}
	}
}

func TestCounterTriggersReactiveAttack(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	brawler := &combat.Combatant{
		ID: 1, Name: "Brawler", IsPlayer: true,
		STR: 10, AGI: 20, LCK: 0, HitPct: 10,
		MaxHP: 100, CurrentHP: 100, BareHandDamage: 25,
	}
	enemy := makeEnemy(2, "Orc", 20, 0, 200, 0)
	enemy.HitPct = 10
	enemy.AGI = 5 // lower than brawler so brawler acts first

	rng := rand.New(rand.NewPCG(7, 0))
	results := combat.ResolveTurn(
		[]*combat.Combatant{brawler},
		[]*combat.Combatant{enemy},
		[]combat.Action{
			{ActorID: 1, Kind: combat.ActionAbility, TargetID: 1, AbilityID: "counter"},
			{ActorID: 2, Kind: combat.ActionAttack, TargetID: 1},
		},
		stats, rng,
	)

	// Expect 3 results: counter setup, enemy attack, counter-attack from brawler.
	var sawCounterKind bool
	var sawEnemyAttack bool
	for _, r := range results {
		if r.Kind == combat.ActionCounter {
			sawCounterKind = true
		}
		if r.ActorID == 2 && r.Kind == combat.ActionAttack {
			sawEnemyAttack = true
		}
	}
	if !sawEnemyAttack {
		t.Fatalf("enemy did not attack; results=%+v", results)
	}
	if !sawCounterKind {
		t.Fatalf("expected a counter-kind result, got %+v", results)
	}
	// Countering flag must be cleared by end of round.
	if brawler.Countering {
		t.Error("brawler Countering flag not cleared at end of round")
	}
}

func TestBackstabDealsTripleDamage(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	// Run baseline and backstab over many seeds to average out variance.
	baseline := 0
	backstab := 0
	for seed := uint64(0); seed < 200; seed++ {
		rogue := &combat.Combatant{
			ID: 1, Name: "Rogue", IsPlayer: true,
			STR: 10, AGI: 20, LCK: 0, HitPct: 10, // single hit baseline
			MaxHP: 30, CurrentHP: 30, WeaponPower: 10,
		}
		d := makeEnemy(2, "Dummy", 1, 0, 1_000_000, 0)
		rng := rand.New(rand.NewPCG(seed, 0))
		results := combat.ResolveTurn(
			[]*combat.Combatant{rogue},
			[]*combat.Combatant{d},
			[]combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}},
			stats, rng,
		)
		if len(results) > 0 {
			baseline += results[0].TotalDmg
		}

		rogue2 := &combat.Combatant{
			ID: 1, Name: "Rogue", IsPlayer: true,
			STR: 10, AGI: 20, LCK: 0, HitPct: 100,
			MaxHP: 30, CurrentHP: 30, WeaponPower: 10,
		}
		d2 := makeEnemy(2, "Dummy", 1, 0, 1_000_000, 0)
		rng2 := rand.New(rand.NewPCG(seed, 0))
		results2 := combat.ResolveTurn(
			[]*combat.Combatant{rogue2},
			[]*combat.Combatant{d2},
			[]combat.Action{{ActorID: 1, Kind: combat.ActionAbility, TargetID: 2, AbilityID: "backstab"}},
			stats, rng2,
		)
		if len(results2) > 0 {
			backstab += results2[0].TotalDmg
		}
	}

	if baseline == 0 || backstab == 0 {
		t.Fatalf("no damage recorded: baseline=%d backstab=%d", baseline, backstab)
	}
	ratio := float64(backstab) / float64(baseline)
	// Base damage is tripled; accounting for random roll variance on top of a
	// 3x base, the expected ratio sits around 3.0 (can drift lower because
	// the random bonus is baseDmg/2 in both cases, not tripled).
	if ratio < 2.0 {
		t.Errorf("backstab/baseline ratio %.2f below expected ~3x", ratio)
	}
}

func TestBuffsExpireAfterDuration(t *testing.T) {
	c := &combat.Combatant{
		ID: 1, Name: "Test", IsPlayer: true,
		MaxHP: 10, CurrentHP: 10,
	}
	c.Buffs = []combat.CombatBuff{{Kind: "focus", DamageMult: 150, TurnsLeft: 2}}

	combat.TickBuffs([]*combat.Combatant{c}, nil)
	if len(c.Buffs) != 1 || c.Buffs[0].TurnsLeft != 1 {
		t.Fatalf("after 1 tick: buffs=%+v", c.Buffs)
	}
	combat.TickBuffs([]*combat.Combatant{c}, nil)
	if len(c.Buffs) != 0 {
		t.Fatalf("buff should have expired, buffs=%+v", c.Buffs)
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

func TestPoisonDamagePerTurn(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	attacker := makeWarrior("Hero", 10, 0)
	attacker.Status = character.StatusPoison
	attacker.MaxHP = 100
	attacker.CurrentHP = 100

	enemy := makeEnemy(2, "Goblin", 5, 1, 50, 0)

	rng := rand.New(rand.NewPCG(42, 0))
	actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
	results := combat.ResolveTurn(
		[]*combat.Combatant{attacker},
		[]*combat.Combatant{enemy},
		actions, stats, rng,
	)

	// First result should be poison tick: 5% of 100 = 5 damage
	if len(results) < 1 {
		t.Fatal("expected at least 1 result")
	}
	if results[0].Kind != combat.ActionPoisonTick {
		t.Fatalf("first result should be poison_tick, got %s", results[0].Kind)
	}
	if results[0].TotalDmg != 5 {
		t.Errorf("poison damage: got %d, want 5 (5%% of 100)", results[0].TotalDmg)
	}
	if attacker.CurrentHP != 95 {
		t.Errorf("HP after poison: got %d, want 95", attacker.CurrentHP)
	}
	// Should still be poisoned (not dead)
	if attacker.Status != character.StatusPoison {
		t.Errorf("status after poison: got %q, want %q", attacker.Status, character.StatusPoison)
	}
}

func TestPoisonKillsCombatant(t *testing.T) {
	c := &combat.Combatant{
		ID: 1, Name: "Dying", MaxHP: 100, CurrentHP: 3,
		Status: character.StatusPoison,
	}
	dmg := combat.ProcessPoison(c)
	if dmg != 5 {
		t.Errorf("poison damage: got %d, want 5", dmg)
	}
	if c.CurrentHP != 0 {
		t.Errorf("HP: got %d, want 0", c.CurrentHP)
	}
	if c.Status != character.StatusDeath {
		t.Errorf("status: got %q, want %q", c.Status, character.StatusDeath)
	}
}

func TestPoisonMinDamageIsOne(t *testing.T) {
	c := &combat.Combatant{
		ID: 1, Name: "Tiny", MaxHP: 10, CurrentHP: 10,
		Status: character.StatusPoison,
	}
	dmg := combat.ProcessPoison(c)
	// 5% of 10 = 0, should be clamped to 1
	if dmg != 1 {
		t.Errorf("poison damage: got %d, want 1 (min damage)", dmg)
	}
}

func TestSleepWakesOnDamage(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	attacker := makeWarrior("Hero", 10, 0)
	attacker.AGI = 50
	attacker.HitPct = 31 // single hit, toHit > 100

	enemy := makeEnemy(2, "Sleeper", 5, 0, 100, 0)
	enemy.Status = character.StatusSleep

	rng := rand.New(rand.NewPCG(42, 0))
	actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
	results := combat.ResolveTurn(
		[]*combat.Combatant{attacker},
		[]*combat.Combatant{enemy},
		actions, stats, rng,
	)

	if len(results) == 0 {
		t.Fatal("expected attack result")
	}
	if results[0].TotalDmg <= 0 {
		t.Fatal("expected damage to wake sleeper")
	}
	if enemy.Status != character.StatusNone {
		t.Errorf("enemy should be awake after damage, got status %q", enemy.Status)
	}
}

func TestConfusedActsRandomly(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	confused := makeWarrior("Confused", 10, 0)
	confused.Status = character.StatusConfuse
	confused.AGI = 50

	ally := &combat.Combatant{
		ID: 3, Name: "Ally", IsPlayer: true,
		STR: 10, AGI: 5, MaxHP: 100, CurrentHP: 100,
	}

	enemy := makeEnemy(2, "Goblin", 5, 1, 100, 0)

	// Run many iterations to verify random targeting hits both allies and enemies.
	hitAlly := 0
	hitEnemy := 0
	for seed := uint64(0); seed < 200; seed++ {
		confused.CurrentHP = 100
		confused.Status = character.StatusConfuse
		ally.CurrentHP = 100
		ally.Status = character.StatusNone
		enemy.CurrentHP = 100
		enemy.Status = character.StatusNone

		rng := rand.New(rand.NewPCG(seed, 0))
		actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
		results := combat.ResolveTurn(
			[]*combat.Combatant{confused, ally},
			[]*combat.Combatant{enemy},
			actions, stats, rng,
		)

		for _, r := range results {
			if r.Kind == combat.ActionConfusion {
				if r.TargetID == 2 {
					hitEnemy++
				} else {
					hitAlly++
				}
			}
		}
	}

	if hitAlly == 0 {
		t.Error("confused actor never attacked an ally")
	}
	if hitEnemy == 0 {
		t.Error("confused actor never attacked an enemy")
	}
}

func TestConfusedSkipsAbilities(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	confused := makeWarrior("Confused", 10, 0)
	confused.Status = character.StatusConfuse
	confused.AGI = 50

	enemy := makeEnemy(2, "Goblin", 5, 1, 100, 0)

	rng := rand.New(rand.NewPCG(42, 0))
	// Try to use an ability while confused - should be forced to basic attack.
	actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAbility, TargetID: 2, AbilityID: "focus"}}
	results := combat.ResolveTurn(
		[]*combat.Combatant{confused},
		[]*combat.Combatant{enemy},
		actions, stats, rng,
	)

	if len(results) == 0 {
		t.Fatal("expected confusion result")
	}
	if results[0].Kind != combat.ActionConfusion {
		t.Errorf("expected confusion action, got %s", results[0].Kind)
	}
}

func TestStonedCountsAsDefeatedForVictory(t *testing.T) {
	enemies := []*combat.Combatant{
		{ID: 1, CurrentHP: 50, Status: character.StatusStone},
	}
	if !combat.CheckVictory(enemies) {
		t.Error("stoned enemy should count as defeated for victory")
	}
}

func TestConfusedCombatantNotSkipped(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	confused := makeWarrior("Confused", 10, 0)
	confused.Status = character.StatusConfuse
	confused.AGI = 50

	enemy := makeEnemy(2, "Goblin", 5, 1, 100, 0)

	rng := rand.New(rand.NewPCG(42, 0))
	actions := []combat.Action{{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2}}
	results := combat.ResolveTurn(
		[]*combat.Combatant{confused},
		[]*combat.Combatant{enemy},
		actions, stats, rng,
	)

	// Confused actor should still act (not be skipped like sleep/stone)
	if len(results) == 0 {
		t.Fatal("confused combatant should still produce an action")
	}
}

// firstAttackerID returns the ActorID of the first non-poison-tick result,
// which is the combatant that won initiative for the round.
func firstAttackerID(results []combat.ResolvedAction) int {
	for _, r := range results {
		if r.Kind == combat.ActionPoisonTick {
			continue
		}
		return r.ActorID
	}
	return 0
}

func TestInitiativeExposedInResolvedAction(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	p := makeWarrior("Hero", 10, 0)
	p.ID = 1
	e := makeEnemy(2, "Goblin", 5, 4, 50, 0)

	rng := rand.New(rand.NewPCG(1, 2))
	actions := []combat.Action{
		{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2},
		{ActorID: 2, Kind: combat.ActionAttack, TargetID: 1},
	}
	results := combat.ResolveTurn(
		[]*combat.Combatant{p},
		[]*combat.Combatant{e},
		actions, stats, rng,
	)

	seen := 0
	for _, r := range results {
		if r.Kind == combat.ActionPoisonTick {
			continue
		}
		if r.Initiative <= 0 {
			t.Errorf("expected Initiative > 0 on %s result, got %d", r.Kind, r.Initiative)
		}
		seen++
	}
	if seen == 0 {
		t.Fatal("expected at least one resolved action carrying an initiative value")
	}
}

func TestInitiativeFavorsHighAGI(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	const trials = 400
	highWins := 0

	for i := 0; i < trials; i++ {
		high := makeEnemy(1, "Rogue", 5, 15, 100, 0)
		high.IsPlayer = true
		low := makeEnemy(2, "Warrior", 5, 5, 100, 0)
		low.IsPlayer = false

		rng := rand.New(rand.NewPCG(uint64(i), 42))
		actions := []combat.Action{
			{ActorID: 2, Kind: combat.ActionAttack, TargetID: 1},
			{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2},
		}
		results := combat.ResolveTurn(
			[]*combat.Combatant{high},
			[]*combat.Combatant{low},
			actions, stats, rng,
		)
		if firstAttackerID(results) == 1 {
			highWins++
		}
	}

	// Per the GDD tightening: high-AGI should dominate but not be deterministic.
	// With AGI 15 vs AGI 5 the distributions barely overlap, so we expect
	// high-AGI to win at least 80% of rolls.
	if highWins < trials*8/10 {
		t.Errorf("high-AGI win rate too low: %d/%d (<80%%)", highWins, trials)
	}
}

func TestInitiativeAllowsUpsets(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	const trials = 400
	lowerWins := 0

	for i := 0; i < trials; i++ {
		// Close matchup so the rolls can overlap.
		fast := makeEnemy(1, "Skirmisher", 5, 8, 100, 0)
		fast.IsPlayer = true
		slow := makeEnemy(2, "Bruiser", 5, 6, 100, 0)
		slow.IsPlayer = false

		rng := rand.New(rand.NewPCG(uint64(i), 99))
		actions := []combat.Action{
			{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2},
			{ActorID: 2, Kind: combat.ActionAttack, TargetID: 1},
		}
		results := combat.ResolveTurn(
			[]*combat.Combatant{fast},
			[]*combat.Combatant{slow},
			actions, stats, rng,
		)
		if firstAttackerID(results) == 2 {
			lowerWins++
		}
	}

	// With AGI 8 vs AGI 6 the slower combatant should still land first
	// sometimes — this is the whole point of the randomized roll.
	if lowerWins == 0 {
		t.Error("lower-AGI combatant never went first across 400 close-matchup trials")
	}
}

func TestSortActionsByInitiativeBreaksTiesByPartySlotOrder(t *testing.T) {
	party := []*combat.Combatant{
		{ID: 10, Name: "Slot0", IsPlayer: true},
		{ID: 11, Name: "Slot1", IsPlayer: true},
		{ID: 12, Name: "Slot2", IsPlayer: true},
	}
	enemies := []*combat.Combatant{
		{ID: 99, Name: "Goblin"},
	}
	actions := []combat.Action{
		{ActorID: 12, Kind: combat.ActionAttack, Initiative: 22},
		{ActorID: 99, Kind: combat.ActionAttack, Initiative: 22},
		{ActorID: 10, Kind: combat.ActionAttack, Initiative: 22},
	}

	combat.SortActionsByInitiativeForTest(actions, party, enemies)

	if got := []int{actions[0].ActorID, actions[1].ActorID, actions[2].ActorID}; got[0] != 10 || got[1] != 12 || got[2] != 99 {
		t.Fatalf("equal-initiative order = %v, want [10 12 99]", got)
	}
}

func TestInitiativeVariesAcrossRounds(t *testing.T) {
	gd := loadTestData(t)
	stats := &gd.Stats.Combat

	// Stable roster, stable AGI, fresh rolls each round. Turn order must
	// not be locked in by a strict AGI sort.
	ally := makeEnemy(1, "A", 5, 7, 10_000, 0)
	ally.IsPlayer = true
	foe := makeEnemy(2, "B", 5, 7, 10_000, 0)
	foe.IsPlayer = false

	rng := rand.New(rand.NewPCG(7, 7))
	seenFirst := map[int]bool{}
	for round := 0; round < 40; round++ {
		ally.CurrentHP, foe.CurrentHP = 10_000, 10_000
		ally.Status, foe.Status = character.StatusNone, character.StatusNone
		actions := []combat.Action{
			{ActorID: 1, Kind: combat.ActionAttack, TargetID: 2},
			{ActorID: 2, Kind: combat.ActionAttack, TargetID: 1},
		}
		results := combat.ResolveTurn(
			[]*combat.Combatant{ally},
			[]*combat.Combatant{foe},
			actions, stats, rng,
		)
		seenFirst[firstAttackerID(results)] = true
	}

	if len(seenFirst) < 2 {
		t.Errorf("expected both combatants to win initiative at least once, saw %v", seenFirst)
	}
}
