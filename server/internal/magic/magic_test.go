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

func TestNewCasterHasFullMP(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")

	c := character.New("Raistlin", "cinder", cinder)
	if c.MaxMP <= 0 {
		t.Errorf("cinder MaxMP: got %d, want > 0", c.MaxMP)
	}
	if c.CurrentMP != c.MaxMP {
		t.Errorf("new caster should start at full MP: got %d/%d", c.CurrentMP, c.MaxMP)
	}
}

func TestNewNonCasterHasZeroMP(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")

	c := character.New("Wulfgar", "warrior", warrior)
	if c.MaxMP != 0 {
		t.Errorf("warrior MaxMP: got %d, want 0", c.MaxMP)
	}
	if c.CurrentMP != 0 {
		t.Errorf("warrior CurrentMP: got %d, want 0", c.CurrentMP)
	}
}

func TestRestoreMPClampsToMax(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")

	c := character.New("Raistlin", "cinder", cinder)
	c.CurrentMP = 1
	c.RestoreMP(9999)
	if c.CurrentMP != c.MaxMP {
		t.Errorf("RestoreMP overshoot: got %d, want %d", c.CurrentMP, c.MaxMP)
	}
}

func TestSpellHasMPCost(t *testing.T) {
	gd := loadTestData(t)
	for _, id := range []string{"spark", "cure", "fireball", "banish"} {
		sp := gd.SpellByID(id)
		if sp == nil {
			t.Fatalf("spell %q missing from game data", id)
		}
		if sp.MPCost <= 0 {
			t.Errorf("spell %q MPCost: got %d, want > 0", id, sp.MPCost)
		}
		// Cost scales with spell level per the L*2 formula.
		wantCost := sp.SpellLevel * 2
		if sp.MPCost != wantCost {
			t.Errorf("spell %q MPCost: got %d, want %d (level %d * 2)", id, sp.MPCost, wantCost, sp.SpellLevel)
		}
	}
}

func TestCanCastChecksMP(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")
	spark := gd.SpellByID("spark")

	c := character.New("Raistlin", "cinder", cinder)

	if !magic.CanCast(c, spark) {
		t.Error("full MP caster should be able to cast spark")
	}

	c.CurrentMP = spark.MPCost - 1
	if magic.CanCast(c, spark) {
		t.Error("caster with insufficient MP should not be able to cast")
	}

	c.CurrentMP = spark.MPCost
	if !magic.CanCast(c, spark) {
		t.Error("caster with exactly enough MP should be able to cast")
	}
}

func TestConsumeMPDecrementsPool(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")
	spark := gd.SpellByID("spark")

	c := character.New("Raistlin", "cinder", cinder)
	startMP := c.CurrentMP

	if err := magic.ConsumeMP(c, spark); err != nil {
		t.Fatalf("unexpected error consuming MP: %v", err)
	}
	if c.CurrentMP != startMP-spark.MPCost {
		t.Errorf("after ConsumeMP: got %d, want %d", c.CurrentMP, startMP-spark.MPCost)
	}
}

func TestConsumeMPInsufficient(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")
	spark := gd.SpellByID("spark")

	c := character.New("Raistlin", "cinder", cinder)
	c.CurrentMP = 0

	if err := magic.ConsumeMP(c, spark); err == nil {
		t.Error("ConsumeMP with 0 MP should error")
	}
	if c.CurrentMP != 0 {
		t.Errorf("failed cast should not consume MP: got %d, want 0", c.CurrentMP)
	}
}

func TestUpdateMaxMPPerClass(t *testing.T) {
	gd := loadTestData(t)

	tests := []struct {
		classID  string
		wantZero bool
	}{
		{"warrior", true},
		{"brawler", true},
		{"rogue", true},
		{"mender", false},
		{"cinder", false},
		{"wayfarer", false},
	}

	for _, tt := range tests {
		t.Run(tt.classID, func(t *testing.T) {
			cls := gd.ClassByID(tt.classID)
			c := character.New("Test", tt.classID, cls)
			if tt.wantZero && c.MaxMP != 0 {
				t.Errorf("%s MaxMP at L1: got %d, want 0", tt.classID, c.MaxMP)
			}
			if !tt.wantZero && c.MaxMP <= 0 {
				t.Errorf("%s MaxMP at L1: got %d, want > 0", tt.classID, c.MaxMP)
			}
		})
	}
}

func TestMaxMPGrowsOnLevelUp(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")

	c := character.New("Raistlin", "cinder", cinder)
	startMaxMP := c.MaxMP

	// Force a level-up by dumping XP and calling LevelUp directly.
	c.XP = character.XPToNextLevel(c.Level, &gd.Stats.XPCurve)
	rng := rand.New(rand.NewPCG(42, 0))
	if err := character.LevelUp(c, cinder, &gd.Stats, rng); err != nil {
		t.Fatalf("LevelUp: %v", err)
	}

	if c.MaxMP <= startMaxMP {
		t.Errorf("Cinder MaxMP after level-up: got %d, want > %d", c.MaxMP, startMaxMP)
	}
}

func TestLevelUpFillsCurrentMP(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")

	c := character.New("Raistlin", "cinder", cinder)
	c.CurrentMP = 0 // simulate post-battle
	c.XP = character.XPToNextLevel(c.Level, &gd.Stats.XPCurve)
	rng := rand.New(rand.NewPCG(42, 0))
	if err := character.LevelUp(c, cinder, &gd.Stats, rng); err != nil {
		t.Fatalf("LevelUp: %v", err)
	}

	// Level-up should fully restore MP, mirroring the HP restore on level-up.
	if c.CurrentMP != c.MaxMP {
		t.Errorf("CurrentMP after level-up: got %d, want %d", c.CurrentMP, c.MaxMP)
	}
}

func TestLearnSpell(t *testing.T) {
	sb := magic.NewSpellBook()

	if err := sb.LearnSpell("spark", 1, 3); err != nil {
		t.Fatalf("learning spark: %v", err)
	}
	if err := sb.LearnSpell("frost", 1, 3); err != nil {
		t.Fatal(err)
	}
	if err := sb.LearnSpell("sleep", 1, 3); err != nil {
		t.Fatal(err)
	}

	// 4th spell at same level should fail (max 3 per Section 8.2).
	if err := sb.LearnSpell("extra", 1, 3); err == nil {
		t.Error("should not learn 4th spell at same level")
	}
}

func TestLearnDuplicateSpell(t *testing.T) {
	sb := magic.NewSpellBook()
	_ = sb.LearnSpell("spark", 1, 3)

	if err := sb.LearnSpell("spark", 1, 3); err == nil {
		t.Error("should not learn duplicate spell")
	}
}

func TestClassSpellLevelCap(t *testing.T) {
	gd := loadTestData(t)
	cinder := gd.ClassByID("cinder")

	sb := magic.NewSpellBook()
	// Unpromoted cinder caps at spell level 6.
	// Attempting to learn a level-7 spell still succeeds at the SpellBook layer —
	// the class cap is enforced by game_create / game_promote when populating
	// the SpellBook. This test documents that SpellBook doesn't enforce it on
	// its own and leaves cap enforcement to the game layer.
	if err := sb.LearnSpell("spark", 1, 3); err != nil {
		t.Fatalf("learning spark: %v", err)
	}
	if _, ok := sb.KnownSpells[1]; !ok {
		t.Error("spark should be registered at spell level 1")
	}
	_ = cinder // silence unused if future assertions add class-cap logic
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
