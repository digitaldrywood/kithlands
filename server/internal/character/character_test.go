package character_test

import (
	"math"
	"math/rand/v2"
	"strconv"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func loadTestData(t *testing.T) *gamedata.GameData {
	t.Helper()
	return gamedata.Load("../../../shared")
}

func TestPromoteSetsFlag(t *testing.T) {
	gd := loadTestData(t)
	rogue := gd.ClassByID("rogue")
	c := character.New("Sneak", "rogue", rogue)

	if c.Promoted {
		t.Fatal("new character should not be promoted")
	}
	c.Promote()
	if !c.Promoted {
		t.Error("Promote() did not set Promoted flag")
	}
	if c.ClassID != "rogue" {
		t.Errorf("ClassID should remain base class, got %q", c.ClassID)
	}
}

func TestNewCharacter(t *testing.T) {
	gd := loadTestData(t)

	warrior := gd.ClassByID("warrior")
	c := character.New("Bob", "warrior", warrior)

	if c.Name != "Bob" {
		t.Errorf("name: got %q, want %q", c.Name, "Bob")
	}
	if c.Level != 1 {
		t.Errorf("level: got %d, want 1", c.Level)
	}
	if c.STR != 20 {
		t.Errorf("STR: got %d, want 20", c.STR)
	}
	if c.MaxHP != 35 {
		t.Errorf("MaxHP: got %d, want 35", c.MaxHP)
	}
	if c.CurrentHP != c.MaxHP {
		t.Errorf("CurrentHP should equal MaxHP at creation")
	}
	if !c.IsAlive() {
		t.Error("new character should be alive")
	}
}

func TestXPCurve(t *testing.T) {
	gd := loadTestData(t)
	curve := &gd.Stats.XPCurve

	// Verify XPToNextLevel returns the authoritative reference table value
	// for every level from 1 to MaxLevel.
	prev := 0
	for level := 1; level <= curve.MaxLevel; level++ {
		want, ok := curve.RefTable[strconv.Itoa(level)]
		if !ok {
			t.Fatalf("reference table missing level %d", level)
		}
		got := character.XPToNextLevel(level, curve)
		if got != want {
			t.Errorf("XP at level %d: got %d, want %d", level, got, want)
		}
		if got <= prev {
			t.Errorf("XP curve not increasing: level %d (%d) <= level %d (%d)", level, got, level-1, prev)
		}
		prev = got
	}

	if curve.MaxLevel != 50 {
		t.Errorf("max level: got %d, want 50", curve.MaxLevel)
	}
}

func TestLevelUp(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")

	c := character.New("Bob", "warrior", warrior)
	c.XP = 1000 // plenty for first few levels
	rng := rand.New(rand.NewPCG(42, 0))

	startHP := c.MaxHP
	startLevel := c.Level

	err := character.LevelUp(c, warrior, &gd.Stats, rng)
	if err != nil {
		t.Fatalf("LevelUp error: %v", err)
	}

	if c.Level != startLevel+1 {
		t.Errorf("level: got %d, want %d", c.Level, startLevel+1)
	}
	if c.MaxHP <= startHP {
		t.Errorf("MaxHP should increase: was %d, now %d", startHP, c.MaxHP)
	}
}

func TestLevelUpStatGrowthDistribution(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")

	// Warrior has STR 8/8 (always gains) and INT 4/8 (gains ~50%)
	strGains := 0
	intGains := 0
	trials := 10000

	for i := 0; i < trials; i++ {
		c := character.New("Test", "warrior", warrior)
		c.XP = 100000
		rng := rand.New(rand.NewPCG(uint64(i), 0))

		startSTR := c.STR
		startINT := c.INT
		_ = character.LevelUp(c, warrior, &gd.Stats, rng)

		if c.STR > startSTR {
			strGains++
		}
		if c.INT > startINT {
			intGains++
		}
	}

	// Warrior STR growth is 8/8 = 100%
	strRate := float64(strGains) / float64(trials)
	if strRate < 0.95 {
		t.Errorf("warrior STR growth rate: got %.2f, want ~1.00", strRate)
	}

	// Warrior INT growth is 4/8 = 50%
	intRate := float64(intGains) / float64(trials)
	if math.Abs(intRate-0.5) > 0.05 {
		t.Errorf("warrior INT growth rate: got %.2f, want ~0.50", intRate)
	}
}

func TestCannotLevelUpWithoutXP(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")
	c := character.New("Bob", "warrior", warrior)
	rng := rand.New(rand.NewPCG(1, 0))

	err := character.LevelUp(c, warrior, &gd.Stats, rng)
	if err == nil {
		t.Error("expected error leveling up without XP")
	}
}

func TestMaxLevel(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")
	c := character.New("Bob", "warrior", warrior)
	c.Level = 50
	c.XP = 999999
	rng := rand.New(rand.NewPCG(1, 0))

	err := character.LevelUp(c, warrior, &gd.Stats, rng)
	if err == nil {
		t.Error("expected error at max level")
	}
}

func TestTakeDamageAndDeath(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")
	c := character.New("Bob", "warrior", warrior)

	c.TakeDamage(10)
	if c.CurrentHP != 25 {
		t.Errorf("HP after 10 damage: got %d, want 25", c.CurrentHP)
	}
	if !c.IsAlive() {
		t.Error("should still be alive")
	}

	c.TakeDamage(100)
	if c.CurrentHP != 0 {
		t.Errorf("HP should be 0, got %d", c.CurrentHP)
	}
	if c.IsAlive() {
		t.Error("should be dead")
	}
	if c.Status != character.StatusDeath {
		t.Errorf("status should be death, got %q", c.Status)
	}
}

func TestHeal(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")
	c := character.New("Bob", "warrior", warrior)

	c.TakeDamage(20)
	c.Status = character.StatusNone // reset from death if needed
	c.Heal(10)
	if c.CurrentHP != 25 {
		t.Errorf("HP after heal: got %d, want 25", c.CurrentHP)
	}

	c.Heal(100)
	if c.CurrentHP != c.MaxHP {
		t.Errorf("HP should cap at max: got %d, want %d", c.CurrentHP, c.MaxHP)
	}
}

func TestAttacksPerTurn(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")
	c := character.New("Bob", "warrior", warrior)

	if c.AttacksPerTurn() != 1 {
		t.Errorf("attacks at hit%%=%d: got %d, want 1", c.HitPct, c.AttacksPerTurn())
	}

	c.HitPct = 32
	if c.AttacksPerTurn() != 2 {
		t.Errorf("attacks at hit%%=32: got %d, want 2", c.AttacksPerTurn())
	}

	c.HitPct = 64
	if c.AttacksPerTurn() != 3 {
		t.Errorf("attacks at hit%%=64: got %d, want 3", c.AttacksPerTurn())
	}
}

func TestMultiLevelUp(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")
	curve := &gd.Stats.XPCurve

	c := character.New("Hero", "warrior", warrior)
	rng := rand.New(rand.NewPCG(42, 0))

	// Post-#121 flattened curve:
	//   Level 1→2: 70, Level 2→3: 95, Level 3→4: 116
	// Give just enough XP for 3 level-ups: 70+95+116 = 281, plus 5 leftover.
	startXP := 70 + 95 + 116 + 5
	c.XP = startXP

	levelsGained := 0
	for character.CanLevelUp(c, curve) {
		if err := character.LevelUp(c, warrior, &gd.Stats, rng); err != nil {
			t.Fatalf("LevelUp error at level %d: %v", c.Level, err)
		}
		levelsGained++
	}

	if c.Level != 4 {
		t.Errorf("level: got %d, want 4", c.Level)
	}
	if levelsGained != 3 {
		t.Errorf("levels gained: got %d, want 3", levelsGained)
	}
	if c.XP != 5 {
		t.Errorf("remaining XP: got %d, want 5", c.XP)
	}
	// Level 4→5 needs 136; only 5 XP left.
	if character.CanLevelUp(c, curve) {
		t.Errorf("should not be able to level up with %d XP (need %d)", c.XP, character.XPToNextLevel(c.Level, curve))
	}
}

func TestCanActWithStatus(t *testing.T) {
	gd := loadTestData(t)
	warrior := gd.ClassByID("warrior")

	tests := []struct {
		status  character.Status
		canAct  bool
		isAlive bool
	}{
		{character.StatusNone, true, true},
		{character.StatusPoison, true, true},
		{character.StatusSilence, true, true},
		{character.StatusSleep, false, true},
		{character.StatusStone, false, false},
		{character.StatusDeath, false, false},
	}

	for _, tt := range tests {
		c := character.New("Test", "warrior", warrior)
		c.Status = tt.status
		if tt.status == character.StatusDeath {
			c.CurrentHP = 0
		}

		if c.CanAct() != tt.canAct {
			t.Errorf("status %q: CanAct() got %v, want %v", tt.status, c.CanAct(), tt.canAct)
		}
		if c.IsAlive() != tt.isAlive {
			t.Errorf("status %q: IsAlive() got %v, want %v", tt.status, c.IsAlive(), tt.isAlive)
		}
	}
}
