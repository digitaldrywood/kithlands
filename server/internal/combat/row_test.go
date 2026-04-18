package combat

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func loadRowTestData(t *testing.T) *gamedata.GameData {
	t.Helper()
	return gamedata.Load("../../../shared")
}

func TestApplyPhysicalRowModifiers(t *testing.T) {
	attacker := &Combatant{}
	defender := &Combatant{}

	tests := []struct {
		name    string
		attRow  string
		defRow  string
		wantDmg int
	}{
		{name: "front vs front", attRow: "front", defRow: "front", wantDmg: 41},
		{name: "back vs front", attRow: "back", defRow: "front", wantDmg: 21},
		{name: "front vs back", attRow: "front", defRow: "back", wantDmg: 21},
		{name: "back vs back", attRow: "back", defRow: "back", wantDmg: 11},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			attacker.Row = tt.attRow
			defender.Row = tt.defRow
			got := applyPhysicalRowModifiers(41, attacker, defender, true)
			if got != tt.wantDmg {
				t.Fatalf("applyPhysicalRowModifiers() = %d, want %d", got, tt.wantDmg)
			}
		})
	}
}

func TestResolveAttackLongRangeIgnoresBackRowPenalty(t *testing.T) {
	gd := loadRowTestData(t)
	stats := &gd.Stats.Combat

	makeAttacker := func(row string, longRange bool) *Combatant {
		return &Combatant{
			ID: 1, Name: "Archer", IsPlayer: true,
			STR: 24, AGI: 60, VIT: 10, LCK: 0, HitPct: 64,
			MaxHP: 80, CurrentHP: 80,
			WeaponPower: 18,
			Row:         row,
			LongRange:   longRange,
		}
	}
	makeDefender := func() *Combatant {
		return &Combatant{
			ID: 2, Name: "Goblin", IsPlayer: false,
			STR: 8, AGI: 0, VIT: 6, LCK: 0, HitPct: 0,
			MaxHP: 999, CurrentHP: 999,
			ArmorAbsorb: 3,
			Row:         "front",
		}
	}

	front := resolveAttack(makeAttacker("front", true), makeDefender(), stats, rand.New(rand.NewPCG(7, 0)))
	back := resolveAttack(makeAttacker("back", true), makeDefender(), stats, rand.New(rand.NewPCG(7, 0)))

	if front.TotalDmg != back.TotalDmg {
		t.Fatalf("long-range back-row attack total = %d, want %d", back.TotalDmg, front.TotalDmg)
	}
}

func TestResolveBackstabIgnoreRowBypassesPenaltyAndDefenseBonus(t *testing.T) {
	gd := loadRowTestData(t)
	stats := &gd.Stats.Combat

	makeAttacker := func(row string) *Combatant {
		return &Combatant{
			ID: 1, Name: "Shadow", IsPlayer: true,
			STR: 28, AGI: 60, VIT: 8, LCK: 0, HitPct: 32,
			MaxHP: 70, CurrentHP: 70,
			WeaponPower: 16,
			Row:         row,
		}
	}
	makeDefender := func(row string) *Combatant {
		return &Combatant{
			ID: 2, Name: "Target", IsPlayer: false,
			STR: 8, AGI: 0, VIT: 6, LCK: 0, HitPct: 0,
			MaxHP: 999, CurrentHP: 999,
			ArmorAbsorb: 4,
			Row:         row,
			Status:      character.StatusNone,
		}
	}

	front := resolveBackstab(makeAttacker("front"), makeDefender("front"), false, stats, rand.New(rand.NewPCG(11, 0)))
	ignored := resolveBackstab(makeAttacker("back"), makeDefender("back"), true, stats, rand.New(rand.NewPCG(11, 0)))

	if ignored.TotalDmg != front.TotalDmg {
		t.Fatalf("ignores_row backstab total = %d, want %d", ignored.TotalDmg, front.TotalDmg)
	}
}
