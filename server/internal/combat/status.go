package combat

import (
	"math/rand/v2"

	"github.com/digitaldrywood/kithlands/internal/character"
)

// ApplyStatus sets a status on a combatant. Per Section 6.5, statuses do not stack.
func ApplyStatus(c *Combatant, status character.Status) {
	if c.CurrentHP <= 0 {
		return
	}
	c.Status = status
}

// ProcessPoison applies poison damage at the start of a turn per Section 6.5:
// -5% max HP per turn in combat.
func ProcessPoison(c *Combatant) int {
	if c.Status != character.StatusPoison {
		return 0
	}
	dmg := c.MaxHP * 5 / 100
	if dmg < 1 {
		dmg = 1
	}
	c.CurrentHP -= dmg
	if c.CurrentHP <= 0 {
		c.CurrentHP = 0
		c.Status = character.StatusDeath
	}
	return dmg
}

// ProcessSleepOnDamage wakes a sleeping combatant when they take damage per Section 6.5.
func ProcessSleepOnDamage(c *Combatant) {
	if c.Status == character.StatusSleep {
		c.Status = character.StatusNone
	}
}

// ProcessConfusion returns true if the confused combatant acts randomly this turn.
// Per Section 6.5: acts randomly, may attack allies. Cured by damage.
func ProcessConfusion(c *Combatant, rng *rand.Rand) bool {
	if c.Status != character.Status("confuse") {
		return false
	}
	return true
}

// CureStatus removes a status effect.
func CureStatus(c *Combatant) {
	c.Status = character.StatusNone
}
