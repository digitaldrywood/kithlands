package balance_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestProtectEarlyEncounterDifficultyClampsOnlyPunishingMultipliers(t *testing.T) {
	classic := balance.ProtectEarlyEncounterDifficulty(balance.GetDifficulty("classic"), 1)
	if classic.EnemyHPMult != 1.0 {
		t.Fatalf("classic HP multiplier at encounter level 1 = %.2f, want 1.0", classic.EnemyHPMult)
	}
	if classic.EnemyDamageMult != 1.0 {
		t.Fatalf("classic damage multiplier at encounter level 1 = %.2f, want 1.0", classic.EnemyDamageMult)
	}
	if classic.XPGainMult != balance.GetDifficulty("classic").XPGainMult {
		t.Fatalf("classic XP multiplier changed unexpectedly: got %.2f want %.2f", classic.XPGainMult, balance.GetDifficulty("classic").XPGainMult)
	}

	hardLate := balance.ProtectEarlyEncounterDifficulty(balance.GetDifficulty("hard"), 3)
	if hardLate.EnemyHPMult != balance.GetDifficulty("hard").EnemyHPMult {
		t.Fatalf("hard HP multiplier at encounter level 3 = %.2f, want %.2f", hardLate.EnemyHPMult, balance.GetDifficulty("hard").EnemyHPMult)
	}
	if hardLate.EnemyDamageMult != balance.GetDifficulty("hard").EnemyDamageMult {
		t.Fatalf("hard damage multiplier at encounter level 3 = %.2f, want %.2f", hardLate.EnemyDamageMult, balance.GetDifficulty("hard").EnemyDamageMult)
	}

	easy := balance.ProtectEarlyEncounterDifficulty(balance.GetDifficulty("easy"), 1)
	if easy.EnemyHPMult != balance.GetDifficulty("easy").EnemyHPMult {
		t.Fatalf("easy HP multiplier changed unexpectedly: got %.2f want %.2f", easy.EnemyHPMult, balance.GetDifficulty("easy").EnemyHPMult)
	}
	if easy.EnemyDamageMult != balance.GetDifficulty("easy").EnemyDamageMult {
		t.Fatalf("easy damage multiplier changed unexpectedly: got %.2f want %.2f", easy.EnemyDamageMult, balance.GetDifficulty("easy").EnemyDamageMult)
	}
}

func TestGenerateFormationEncounterWithProfileUsesTutorialAndStarterSafePools(t *testing.T) {
	gd := loadTestData(t)
	gd.Formations = []gamedata.Formation{
		{
			ID:                "tutorial",
			Weight:            1,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 1,
			TutorialOnly:      true,
			StarterSafe:       true,
			TerrainTags:       []string{"any"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "slime", Min: 1, Max: 1},
			},
		},
		{
			ID:                "starter_safe",
			Weight:            1,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 2,
			StarterSafe:       true,
			TerrainTags:       []string{"path"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "goblin", Min: 1, Max: 1},
			},
		},
		{
			ID:                "unsafe",
			Weight:            100,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 2,
			TerrainTags:       []string{"path"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "goblin", Min: 2, Max: 3},
			},
		},
	}
	diff := balance.GetDifficulty("normal")

	tutorial := balance.GenerateFormationEncounterWithProfile(
		gd,
		1,
		diff,
		"path",
		balance.EncounterProfile{WorldEncounterIndex: 0},
		rand.New(rand.NewPCG(1, 0)),
	)
	if tutorial.FormationID != "tutorial" {
		t.Fatalf("tutorial encounter picked %q, want tutorial", tutorial.FormationID)
	}

	starter := balance.GenerateFormationEncounterWithProfile(
		gd,
		1,
		diff,
		"path",
		balance.EncounterProfile{WorldEncounterIndex: 1},
		rand.New(rand.NewPCG(1, 0)),
	)
	if starter.FormationID != "starter_safe" {
		t.Fatalf("starter-safe encounter picked %q, want starter_safe", starter.FormationID)
	}
}
