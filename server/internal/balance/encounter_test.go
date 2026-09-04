package balance_test

import (
	"math/rand/v2"
	"strconv"
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

	result := balance.GenerateFormationEncounter(gd, 1, diff, "", rng)
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
		"slime_pack":           true,
		"goblin_rabble":        true,
		"scattered_mob":        true,
		"starter_slime_pair":   true,
		"starter_goblin_scout": true,
		"starter_mixed_duo":    true,
		"giant_rat_scurry":     true,
		"bramblehog_rooters":   true,
		"mire_toad_watch":      true,
		"ridge_rook_scout":     true,
	}

	for seed := uint64(0); seed < 1000; seed++ {
		rng := rand.New(rand.NewPCG(seed, 0))
		result := balance.GenerateFormationEncounter(gd, 1, diff, "", rng)
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
		result := balance.GenerateFormationEncounter(gd, 3, diff, "", rng)

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
		result := balance.GenerateFormationEncounter(gd, 2, diff, "", rng)

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
		result := balance.GenerateFormationEncounter(gd, 3, diff, "", rng)
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
		r1 := balance.GenerateFormationEncounter(gd, 2, diff, "", rng1)

		rng2 := rand.New(rand.NewPCG(seed, 0))
		r2 := balance.GenerateFormationEncounter(gd, 2, diff, "", rng2)

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

func TestHighLevelEncounterRelaxesAuthoredMaxCaps(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")
	rng := rand.New(rand.NewPCG(42, 0))

	// Level 99 is beyond every authored max cap, so encounter generation should
	// reuse the authored formations on the relaxed path instead of collapsing
	// into the single-monster fallback.
	result := balance.GenerateFormationEncounter(gd, 99, diff, "", rng)
	if len(result.Combatants) == 0 {
		t.Fatal("expected relaxed high-level path to produce at least one combatant")
	}
	if result.FormationID == "" {
		t.Fatal("expected a real authored formation on the relaxed high-level path")
	}
}

func TestScaleMonster_XPScalesWithEncounterLevel(t *testing.T) {
	// Issue #121: XP must scale with encounter level the same way HP/STR do.
	// A party fighting scaled late-game encounters needs proportionally higher
	// XP to actually progress through the 15-quest campaign.
	m := &gamedata.Monster{
		Name:     "tester",
		Tier:     1,
		HP:       10,
		XPReward: 20,
	}
	diff := balance.GetDifficulty("normal")

	base := balance.ScaleMonster(m, 1, 1, diff)
	mid := balance.ScaleMonster(m, 2, 5, diff)
	high := balance.ScaleMonster(m, 3, 9, diff)

	if base.XPReward != 20 {
		t.Errorf("level 1 (tier 1) should award base XP, got %d want 20", base.XPReward)
	}
	if mid.XPReward <= base.XPReward {
		t.Errorf("level 5 encounter should award more XP than level 1: got %d <= %d", mid.XPReward, base.XPReward)
	}
	if high.XPReward <= mid.XPReward {
		t.Errorf("level 9 encounter should award more XP than level 5: got %d <= %d", high.XPReward, mid.XPReward)
	}
	// 0.5 per level above tier: levelScale=8 → 1 + 8*0.5 = 5x
	if high.XPReward < 5*m.XPReward-1 {
		t.Errorf("level 9 (tier 1) should award ~5x base XP, got %d want ~%d", high.XPReward, 5*m.XPReward)
	}
}

func TestScaleMonster_XPAppliesDifficultyMult(t *testing.T) {
	// XPGainMult on Difficulty was dead code until #121. Easy should give more
	// XP per fight than Classic at the same encounter level, so players on
	// lower difficulty don't stall on the progression curve.
	m := &gamedata.Monster{
		Name:     "tester",
		Tier:     1,
		HP:       10,
		XPReward: 100,
	}
	easy := balance.GetDifficulty("easy")
	classic := balance.GetDifficulty("classic")

	easyScaled := balance.ScaleMonster(m, 1, 5, easy)
	classicScaled := balance.ScaleMonster(m, 2, 5, classic)

	if easyScaled.XPReward <= classicScaled.XPReward {
		t.Errorf("easy XP (%d) must exceed classic XP (%d) at same encounter level",
			easyScaled.XPReward, classicScaled.XPReward)
	}
}

func TestScaleMonster_XPFloorsAtBase(t *testing.T) {
	// Low-difficulty or low-level encounters must never pay less than the raw
	// JSON value — the floor keeps base rewards predictable for tuning.
	m := &gamedata.Monster{
		Name:     "tester",
		Tier:     5,
		HP:       10,
		XPReward: 100,
	}
	classic := balance.GetDifficulty("classic") // XPGainMult 0.8

	// Encounter level below tier → levelScale clamps to 0 → multiplier is
	// 1.0 * 0.8 = 0.8, which would drop reward below base without a floor.
	scaled := balance.ScaleMonster(m, 1, 1, classic)
	if scaled.XPReward < m.XPReward {
		t.Errorf("XP reward should floor at base %d, got %d", m.XPReward, scaled.XPReward)
	}
}

func TestScaleMonster_HighEncounterLevelKeepsPressure(t *testing.T) {
	m := &gamedata.Monster{
		Name:        "war hydra",
		Tier:        5,
		HP:          350,
		ArmorAbsorb: 18,
		Stats: gamedata.MonsterStats{
			STR:    62,
			AGI:    12,
			INT:    8,
			VIT:    28,
			LCK:    6,
			HitPct: 22,
		},
		XPReward: 910,
	}
	diff := balance.GetDifficulty("normal")

	base := balance.ScaleMonster(m, 1, 5, diff)
	late := balance.ScaleMonster(m, 2, 20, diff)

	if got := float64(late.MaxHP) / float64(base.MaxHP); got < 2.0 {
		t.Fatalf("late-game HP ratio %.2f too low; want at least 2.0x", got)
	}
	if got := float64(late.STR) / float64(base.STR); got < 1.4 {
		t.Fatalf("late-game STR ratio %.2f too low; want at least 1.4x", got)
	}
	if late.HitPct <= base.HitPct {
		t.Fatalf("late-game hit pct %d should exceed base %d", late.HitPct, base.HitPct)
	}
}

func TestCombatantFieldsPopulated(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")
	rng := rand.New(rand.NewPCG(42, 0))

	result := balance.GenerateFormationEncounter(gd, 1, diff, "", rng)
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

func TestGenerateFormationEncounterHighLevelAvoidsFallback(t *testing.T) {
	gd := loadTestData(t)
	gd.Formations = []gamedata.Formation{
		{
			ID:                "capped_wolves",
			Weight:            1,
			MinEncounterLevel: 2,
			MaxEncounterLevel: 5,
			TerrainTags:       []string{"forest"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "wolf", Min: 1, Max: 1},
			},
		},
	}
	diff := balance.GetDifficulty("normal")
	rng := rand.New(rand.NewPCG(42, 0))

	result := balance.GenerateFormationEncounter(gd, 20, diff, "forest", rng)
	if result.FormationID != "capped_wolves" {
		t.Fatalf("expected capped formation, got %q", result.FormationID)
	}
	if len(result.Combatants) != 1 {
		t.Fatalf("expected one scaled combatant, got %d", len(result.Combatants))
	}
	wolf := gd.MonsterByID("wolf")
	if wolf == nil {
		t.Fatal("expected wolf monster data")
		return
	}
	if got := result.Combatants[0].MonsterID; got != "wolf" {
		t.Fatalf("expected wolf combatant, got %q", got)
	}
	if result.Combatants[0].MaxHP <= wolf.HP {
		t.Fatalf("expected scaled wolf HP > base %d, got %d", wolf.HP, result.Combatants[0].MaxHP)
	}
	wantXP := int(float64(wolf.XPReward) * diff.XPGainMult * 0.85)
	if result.Combatants[0].XPReward != wantXP {
		t.Fatalf("expected relaxed XP reward %d, got %d", wantXP, result.Combatants[0].XPReward)
	}
}

func TestAuthoredTerrainCoverageAvoidsSingleSlimeFallback(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")
	terrains := []string{"grass", "path", "forest", "marsh", "snow", "hill"}

	for _, terrain := range terrains {
		for _, level := range []int{1, 50} {
			t.Run(terrain+"_level_"+strconv.Itoa(level), func(t *testing.T) {
				for seed := uint64(0); seed < 100; seed++ {
					rng := rand.New(rand.NewPCG(seed, 0))
					result := balance.GenerateFormationEncounter(gd, level, diff, terrain, rng)
					if result.FormationID == "" {
						t.Fatalf("seed %d: %s level %d fell back outside authored formations", seed, terrain, level)
					}
				}
			})
		}
	}
}

func TestStarterProtectedTerrainUsesSafeAuthoredFormations(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")
	terrains := []string{"grass", "path", "forest", "marsh", "snow", "hill"}

	for _, terrain := range terrains {
		for encounterIndex := 1; encounterIndex < balance.StarterProtectedEncounterCount; encounterIndex++ {
			rng := rand.New(rand.NewPCG(uint64(encounterIndex), 0))
			result := balance.GenerateFormationEncounterWithProfile(
				gd,
				1,
				diff,
				terrain,
				balance.EncounterProfile{WorldEncounterIndex: encounterIndex},
				rng,
			)
			formation := gd.FormationByID(result.FormationID)
			if formation == nil {
				t.Fatalf("%s encounter %d used fallback instead of an authored starter formation", terrain, encounterIndex)
			}
			if !formation.StarterSafe {
				t.Fatalf("%s encounter %d selected unsafe formation %q", terrain, encounterIndex, formation.ID)
			}
		}
	}
}

func TestOverworldExpansionIdentitiesAreEncounterable(t *testing.T) {
	gd := loadTestData(t)
	diff := balance.GetDifficulty("normal")
	tests := []struct {
		id      string
		terrain string
		level   int
	}{
		{id: "giant_rat", terrain: "path", level: 1},
		{id: "bandit", terrain: "path", level: 4},
		{id: "war_hydra", terrain: "marsh", level: 100},
		{id: "wyvern", terrain: "snow", level: 100},
		{id: "bramblehog", terrain: "forest", level: 1},
		{id: "mire_toad", terrain: "marsh", level: 1},
		{id: "frosthorn", terrain: "snow", level: 3},
		{id: "ridge_rook", terrain: "hill", level: 1},
	}

	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			for seed := uint64(0); seed < 4096; seed++ {
				rng := rand.New(rand.NewPCG(seed, 0))
				result := balance.GenerateFormationEncounter(gd, tt.level, diff, tt.terrain, rng)
				for _, combatant := range result.Combatants {
					if combatant.MonsterID == tt.id {
						return
					}
				}
			}
			t.Fatalf("%s never appeared on %s at level %d", tt.id, tt.terrain, tt.level)
		})
	}
}

func TestFormationEligibilityByTerrainTag(t *testing.T) {
	gd := loadTestData(t)
	gd.Formations = []gamedata.Formation{
		{
			ID:                "path_only",
			Weight:            1,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 0,
			TerrainTags:       []string{"path"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "goblin", Min: 1, Max: 1},
			},
		},
		{
			ID:                "grass_only",
			Weight:            1,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 0,
			TerrainTags:       []string{"grass"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "slime", Min: 1, Max: 1},
			},
		},
	}
	diff := balance.GetDifficulty("normal")

	for seed := uint64(0); seed < 50; seed++ {
		rng := rand.New(rand.NewPCG(seed, 0))
		result := balance.GenerateFormationEncounter(gd, 1, diff, "path", rng)
		if result.FormationID != "path_only" {
			t.Fatalf("seed %d: path terrain picked %q, want path_only", seed, result.FormationID)
		}
	}
}

func TestFormationTerrainFallsBackToAny(t *testing.T) {
	gd := loadTestData(t)
	gd.Formations = []gamedata.Formation{
		{
			ID:                "forest_only",
			Weight:            1,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 0,
			TerrainTags:       []string{"forest"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "wolf", Min: 1, Max: 1},
			},
		},
		{
			ID:                "anywhere",
			Weight:            1,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 0,
			TerrainTags:       []string{"any"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "slime", Min: 1, Max: 1},
			},
		},
	}
	diff := balance.GetDifficulty("normal")

	rng := rand.New(rand.NewPCG(42, 0))
	result := balance.GenerateFormationEncounter(gd, 1, diff, "sand", rng)
	if result.FormationID != "anywhere" {
		t.Fatalf("sand terrain should fall back to any-tagged formation, got %q", result.FormationID)
	}
}
