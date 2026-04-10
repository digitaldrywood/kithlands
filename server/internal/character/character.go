package character

import (
	"fmt"
	"math"
	"math/rand/v2"
	"strconv"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// Character represents a party member with full state.
type Character struct {
	Name     string `json:"name"`
	ClassID  string `json:"class_id"`
	Level    int    `json:"level"`
	XP       int    `json:"xp"`
	Promoted bool   `json:"promoted"`

	// Core stats
	STR    int `json:"str"`
	AGI    int `json:"agi"`
	INT    int `json:"int"`
	VIT    int `json:"vit"`
	LCK    int `json:"lck"`
	HitPct int `json:"hit_pct"`

	// HP
	MaxHP     int `json:"max_hp"`
	CurrentHP int `json:"current_hp"`

	// Status
	Status Status `json:"status"`
}

type Status string

const (
	StatusNone    Status = ""
	StatusPoison  Status = "poison"
	StatusSleep   Status = "sleep"
	StatusSilence Status = "silence"
	StatusStone   Status = "stone"
	StatusDeath   Status = "death"
)

// New creates a character of the given class with starting stats.
func New(name, classID string, class *gamedata.Class) *Character {
	return &Character{
		Name:      name,
		ClassID:   classID,
		Level:     1,
		XP:        0,
		STR:       class.StartingStats.STR,
		AGI:       class.StartingStats.AGI,
		INT:       class.StartingStats.INT,
		VIT:       class.StartingStats.VIT,
		LCK:       class.StartingStats.LCK,
		HitPct:    class.StartingStats.HitPct,
		MaxHP:     class.StartingStats.MHP,
		CurrentHP: class.StartingStats.MHP,
		Status:    StatusNone,
	}
}

// XPToNextLevel returns the XP needed to reach the next level per Section 5.2.
// Values come from the authoritative reference table in stats.json.
// Falls back to floor(coefficient * level^exponent) + constant if the level
// is missing from the table.
func XPToNextLevel(level int, curve *gamedata.XPCurve) int {
	if v, ok := curve.RefTable[strconv.Itoa(level)]; ok {
		return v
	}
	return int(math.Floor(curve.Coefficient*math.Pow(float64(level), curve.Exponent))) + int(curve.Constant)
}

// CanLevelUp returns true if the character has enough XP to level up.
func CanLevelUp(c *Character, curve *gamedata.XPCurve) bool {
	if c.Level >= curve.MaxLevel {
		return false
	}
	return c.XP >= XPToNextLevel(c.Level, curve)
}

// LevelUp advances the character one level, applying stat gains per Section 5.3.
// Uses the provided RNG for deterministic results in tests and seeded saves.
func LevelUp(c *Character, class *gamedata.Class, stats *gamedata.StatsConfig, rng *rand.Rand) error {
	if c.Level >= stats.XPCurve.MaxLevel {
		return fmt.Errorf("already at max level %d", stats.XPCurve.MaxLevel)
	}

	needed := XPToNextLevel(c.Level, &stats.XPCurve)
	if c.XP < needed {
		return fmt.Errorf("need %d XP to level up, have %d", needed, c.XP)
	}

	c.XP -= needed
	c.Level++

	// Stat gains: roll each stat against growth chance (X/8)
	growth := &class.StatGrowthEights
	if rng.IntN(8) < growth.STR {
		c.STR++
	}
	if rng.IntN(8) < growth.AGI {
		c.AGI++
	}
	if rng.IntN(8) < growth.INT {
		c.INT++
	}
	if rng.IntN(8) < growth.VIT {
		c.VIT++
	}
	if rng.IntN(8) < growth.LCK {
		c.LCK++
	}

	// HitPct gain per level
	if gain, ok := stats.HitPctPerLvl[c.ClassID]; ok {
		c.HitPct += gain
	}

	// HP gain per Section 5.3
	hpGain := class.HPPerLevel
	isStrongLevel := rng.IntN(100) < class.StrongLevelRate
	if isStrongLevel {
		hpGain += stats.LevelUp.HPGain.StrongBonus
	} else if c.VIT > rng.IntN(32) {
		hpGain += stats.LevelUp.HPGain.StrongBonus
	}

	c.MaxHP += hpGain
	c.CurrentHP += hpGain

	return nil
}

// IsAlive returns true if the character can act.
func (c *Character) IsAlive() bool {
	return c.CurrentHP > 0 && c.Status != StatusDeath && c.Status != StatusStone
}

// CanAct returns true if the character can take a turn.
func (c *Character) CanAct() bool {
	return c.IsAlive() && c.Status != StatusSleep
}

// AttacksPerTurn returns the number of hits per physical attack per Section 5.1.
func (c *Character) AttacksPerTurn() int {
	return 1 + c.HitPct/32
}

// Evade returns the character's evasion value per Section 5.1.
func (c *Character) Evade() int {
	return c.AGI * 2
}

// CritChance returns the crit percentage (d100 threshold) per Section 6.2.
func (c *Character) CritChance() int {
	return c.LCK / 4
}

// MagicDefense returns the derived magic defense per stats.json.
func (c *Character) MagicDefense() int {
	return (c.VIT + c.INT) / 2
}

// TakeDamage applies damage, clamping HP to 0.
func (c *Character) TakeDamage(amount int) {
	c.CurrentHP -= amount
	if c.CurrentHP <= 0 {
		c.CurrentHP = 0
		c.Status = StatusDeath
	}
}

// Promote marks the character as promoted. Stat growth, starting equipment,
// and base-class identifier all stay the same; the class's PromotedName and
// PromotedSchools become active via game-layer lookups.
func (c *Character) Promote() {
	c.Promoted = true
}

// Heal restores HP up to MaxHP.
func (c *Character) Heal(amount int) {
	c.CurrentHP += amount
	if c.CurrentHP > c.MaxHP {
		c.CurrentHP = c.MaxHP
	}
}
