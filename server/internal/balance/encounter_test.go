package balance_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func loadTestData(t *testing.T) *gamedata.GameData {
	t.Helper()
	return gamedata.Load("../../../shared")
}

func TestGenerateFormationEncounterReturnsNonEmpty(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")
	rng := rand.New(rand.NewPCG(42, 0))

	result := balance.GenerateFormationEncounter(gd, 1, diff, rng)
	if len(result.Combatants) == 0 {
		t.Fatal("expected at least one combatant")
	}
	if result.Layout == "" {
		t.Fatal("expected non-empty layout")
	}
}

func TestFormationEligibilityByLevel(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")

	// At level 1, only level-1-eligible formations should appear.
	// Formations with min_encounter_level > 1 must never be picked.
	level1Only := map[string]bool{
		"slime_pack":    true,
		"goblin_rabble": true,
		"scattered_mob": true,
	}

	for seed := uint64(0); seed < 1000; seed++ {
		rng := rand.New(rand.NewPCG(seed, 0))
		result := balance.GenerateFormationEncounter(gd, 1, diff, rng)
		if result.FormationID == "" {
			continue // fallback
		}
		if !level1Only[result.FormationID] {
			t.Fatalf("seed %d: level 1 picked formation %q which requires higher level", seed, result.FormationID)
		}
	}
}

func TestSizeCapEnforced(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")

	for seed := uint64(0); seed < 500; seed++ {
		rng := rand.New(rand.NewPCG(seed, 0))
		result := balance.GenerateFormationEncounter(gd, 3, diff, rng)

		sizeCounts := make(map[string]int)
		for _, c := range result.Combatants {
			sizeCounts[c.Size]++
		}

		for size, count := range sizeCounts {
			cap := balance.SizeMaxPerEncounter[size]
			if cap > 0 && count > cap {
				t.Fatalf("seed %d: size %q has %d combatants, cap is %d", seed, size, count, cap)
			}
		}
	}
}

func TestMixedFormationHasMultipleTypes(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")

	// Run enough seeds at level 2+ to hit mixed_horde (goblin + slime)
	foundMixed := false
	for seed := uint64(0); seed < 2000; seed++ {
		rng := rand.New(rand.NewPCG(seed, 0))
		result := balance.GenerateFormationEncounter(gd, 2, diff, rng)

		monsterIDs := make(map[string]bool)
		for _, c := range result.Combatants {
			monsterIDs[c.MonsterID] = true
		}
		if len(monsterIDs) > 1 {
			foundMixed = true
			break
		}
	}
	if !foundMixed {
		t.Fatal("expected to find at least one mixed-type encounter in 2000 seeds")
	}
}

func TestLayoutPassthrough(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")

	validLayouts := map[string]bool{
		"line": true, "vshape": true, "triangle": true,
		"boss_minions": true, "scattered": true, "rows": true,
	}

	for seed := uint64(0); seed < 200; seed++ {
		rng := rand.New(rand.NewPCG(seed, 0))
		result := balance.GenerateFormationEncounter(gd, 3, diff, rng)
		if !validLayouts[result.Layout] {
			t.Fatalf("seed %d: invalid layout %q", seed, result.Layout)
		}
	}
}

func TestDeterminismWithSeed(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")

	// Same seed must produce identical results
	for seed := uint64(0); seed < 50; seed++ {
		rng1 := rand.New(rand.NewPCG(seed, 0))
		r1 := balance.GenerateFormationEncounter(gd, 2, diff, rng1)

		rng2 := rand.New(rand.NewPCG(seed, 0))
		r2 := balance.GenerateFormationEncounter(gd, 2, diff, rng2)

		if r1.FormationID != r2.FormationID {
			t.Fatalf("seed %d: formation mismatch: %q vs %q", seed, r1.FormationID, r2.FormationID)
		}
		if len(r1.Combatants) != len(r2.Combatants) {
			t.Fatalf("seed %d: combatant count mismatch: %d vs %d", seed, len(r1.Combatants), len(r2.Combatants))
		}
		for i := range r1.Combatants {
			if r1.Combatants[i].MonsterID != r2.Combatants[i].MonsterID {
				t.Fatalf("seed %d idx %d: monster mismatch", seed, i)
			}
		}
	}
}

func TestFallbackWhenNoEligible(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")
	rng := rand.New(rand.NewPCG(42, 0))

	// Level 99 is beyond all max_encounter_level values (except 0 = unbounded)
	// but all formations with max=0 have weight=0 (boss only).
	// This should trigger the fallback.
	result := balance.GenerateFormationEncounter(gd, 99, diff, rng)
	if len(result.Combatants) == 0 {
		t.Fatal("expected fallback to produce at least one combatant")
	}
	if result.Layout != "line" {
		t.Errorf("expected fallback layout 'line', got %q", result.Layout)
	}
}

func TestCombatantFieldsPopulated(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")
	rng := rand.New(rand.NewPCG(42, 0))

	result := balance.GenerateFormationEncounter(gd, 1, diff, rng)
	for _, c := range result.Combatants {
		if c.MonsterID == "" {
			t.Error("combatant has empty MonsterID")
		}
		if c.Size == "" {
			t.Error("combatant has empty Size")
		}
		if c.MaxHP <= 0 {
			t.Errorf("combatant %q has invalid MaxHP: %d", c.Name, c.MaxHP)
		}
		if c.CurrentHP != c.MaxHP {
			t.Errorf("combatant %q CurrentHP != MaxHP: %d != %d", c.Name, c.CurrentHP, c.MaxHP)
		}
	}
}
