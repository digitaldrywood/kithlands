package magic_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

func loadTestData(t *testing.T) *gamedata.GameData {
	t.Helper()
	return gamedata.Load("../../../shared")
}

func TestSpellBookCharges(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")

	sb := magic.NewSpellBook()
	sb.UpdateCharges(1, cinder, &gd.Spells, false)

	if sb.MaxCharges[1] != 2 {
		t.Errorf("level 1 cinder max charges at spell level 1: got %d, want 2", sb.MaxCharges[1])
	}

	sb.RestoreAllCharges()
	if sb.Charges[1] != 2 {
		t.Errorf("charges after restore: got %d, want 2", sb.Charges[1])
	}
}

func TestSpellBookChargesAtHigherLevel(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")

	sb := magic.NewSpellBook()
	sb.UpdateCharges(5, cinder, &gd.Spells, false)
	sb.RestoreAllCharges()

	if sb.MaxCharges[1] != 4 {
		t.Errorf("level 5 spell-level-1 charges: got %d, want 4", sb.MaxCharges[1])
	}
	if sb.MaxCharges[2] != 3 {
		t.Errorf("level 5 spell-level-2 charges: got %d, want 3", sb.MaxCharges[2])
	}
	if sb.MaxCharges[3] != 2 {
		t.Errorf("level 5 spell-level-3 charges: got %d, want 2", sb.MaxCharges[3])
	}
}

func TestLearnSpell(t *testing.T) {
	sb := magic.NewSpellBook()

	err := sb.LearnSpell("spark", 1, 3)
	if err != nil {
		t.Fatalf("learning spark: %v", err)
	}

	err = sb.LearnSpell("frost", 1, 3)
	if err != nil {
		t.Fatal(err)
	}

	err = sb.LearnSpell("sleep", 1, 3)
	if err != nil {
		t.Fatal(err)
	}

	// 4th spell at same level should fail (max 3 per Section 8.2)
	err = sb.LearnSpell("extra", 1, 3)
	if err == nil {
		t.Error("should not learn 4th spell at same level")
	}
}

func TestLearnDuplicateSpell(t *testing.T) {
	sb := magic.NewSpellBook()
	sb.LearnSpell("spark", 1, 3)

	err := sb.LearnSpell("spark", 1, 3)
	if err == nil {
		t.Error("should not learn duplicate spell")
	}
}

func TestCastAndConsumeCharge(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")
	spark := gd.SpellByID("spark")

	sb := magic.NewSpellBook()
	sb.UpdateCharges(1, cinder, &gd.Spells, false)
	sb.RestoreAllCharges()
	sb.LearnSpell("spark", 1, 3)

	if !sb.CanCast(spark) {
		t.Fatal("should be able to cast with charges")
	}

	// Use both charges
	sb.ConsumeCharge(1)
	sb.ConsumeCharge(1)

	if sb.CanCast(spark) {
		t.Error("should not be able to cast with 0 charges")
	}

	err := sb.ConsumeCharge(1)
	if err == nil {
		t.Error("should error on 0 charges")
	}
}

func TestSpellDamage(t *testing.T) {
	gd := loadTestData(t)
	spark := gd.SpellByID("spark")

	target := &magic.SpellTarget{
		Weaknesses:  []string{},
		Resistances: []string{},
		Absorbs:     []string{},
	}

	for i := 0; i < 100; i++ {
		rng := rand.New(rand.NewPCG(uint64(i), 0))
		dmg := magic.ResolveSpellDamage(spark, target, rng)
		// Spark power=10, damage = rand(10, 20), so 10-20
		if dmg < 10 || dmg > 20 {
			t.Errorf("spark damage %d out of range [10, 20]", dmg)
		}
	}
}

func TestSpellDamageWeakness(t *testing.T) {
	gd := loadTestData(t)
	spark := gd.SpellByID("spark") // fire element

	target := &magic.SpellTarget{
		Weaknesses: []string{"fire"},
	}

	rng := rand.New(rand.NewPCG(42, 0))
	dmg := magic.ResolveSpellDamage(spark, target, rng)
	// Should be 1.5x, so minimum 15
	if dmg < 15 {
		t.Errorf("fire spell vs fire-weak: damage %d, expected >= 15", dmg)
	}
}

func TestSpellDamageResistance(t *testing.T) {
	gd := loadTestData(t)
	spark := gd.SpellByID("spark")

	target := &magic.SpellTarget{
		Resistances: []string{"fire"},
	}

	rng := rand.New(rand.NewPCG(42, 0))
	dmg := magic.ResolveSpellDamage(spark, target, rng)
	// Should be 0.5x, so max 10
	if dmg > 10 {
		t.Errorf("fire spell vs fire-resist: damage %d, expected <= 10", dmg)
	}
}

func TestHealSpell(t *testing.T) {
	gd := loadTestData(t)
	cure := gd.SpellByID("cure")

	for i := 0; i < 100; i++ {
		rng := rand.New(rand.NewPCG(uint64(i), 0))
		heal := magic.ResolveHealSpell(cure, rng)
		// Cure power=16, heal = rand(16, 32)
		if heal < 16 || heal > 32 {
			t.Errorf("cure heal %d out of range [16, 32]", heal)
		}
	}
}

func TestApplyHealToCharacter(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")
	cure := gd.SpellByID("cure")

	c := character.New("Bob", "warrior", warrior)
	c.TakeDamage(20)
	c.Status = character.StatusNone

	magic.ApplySpellToCharacter(c, cure, 16)
	if c.CurrentHP != 31 {
		t.Errorf("HP after 16 heal: got %d, want 31", c.CurrentHP)
	}
}

func TestCureStatusSpell(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")
	curePoison := gd.SpellByID("cure_poison")

	c := character.New("Bob", "warrior", warrior)
	c.Status = character.StatusPoison

	magic.ApplySpellToCharacter(c, curePoison, 0)
	if c.Status != character.StatusNone {
		t.Errorf("status after cure poison: got %q, want %q", c.Status, character.StatusNone)
	}
}

func TestClassSpellLevelCap(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")

	sb := magic.NewSpellBook()
	// Cinder max_spell_level is 6, promoted is 8
	// At level 20 the charge table gives charges for levels 1-7
	// But unpromoted cinder caps at 6
	sb.UpdateCharges(20, cinder, &gd.Spells, false)
	sb.RestoreAllCharges()

	if sb.MaxCharges[6] <= 0 {
		t.Error("cinder should have spell level 6 charges at char level 20")
	}
	if sb.MaxCharges[7] > 0 {
		t.Error("unpromoted cinder should NOT have spell level 7 charges")
	}

	// Promoted cinder gets level 7
	sb2 := magic.NewSpellBook()
	sb2.UpdateCharges(20, cinder, &gd.Spells, true)
	sb2.RestoreAllCharges()

	if sb2.MaxCharges[7] <= 0 {
		t.Error("promoted cinder (pyromancer) should have spell level 7 charges at char level 20")
	}
}
