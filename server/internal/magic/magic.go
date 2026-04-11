package magic

import (
	"fmt"
	"math/rand/v2"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// SpellBook tracks which spells a character knows. Per GDD §8.1 the party
// shares a unified MP pool per character (see Character.CurrentMP/MaxMP);
// this struct is the list of learned spell IDs grouped by spell level.
type SpellBook struct {
	// KnownSpells maps spell level (1-8) to up to 3 spell IDs.
	KnownSpells map[int][]string `json:"known_spells"`
}

// NewSpellBook creates an empty spell book.
func NewSpellBook() *SpellBook {
	return &SpellBook{
		KnownSpells: make(map[int][]string),
	}
}

// LearnSpell teaches a spell. Per Section 8.2: max 3 spells per spell level.
func (sb *SpellBook) LearnSpell(spellID string, spellLevel int, maxPerLevel int) error {
	known := sb.KnownSpells[spellLevel]
	if len(known) >= maxPerLevel {
		return fmt.Errorf("already know %d spells at level %d (max %d)", len(known), spellLevel, maxPerLevel)
	}
	for _, id := range known {
		if id == spellID {
			return fmt.Errorf("already know spell %q", spellID)
		}
	}
	sb.KnownSpells[spellLevel] = append(sb.KnownSpells[spellLevel], spellID)
	return nil
}

// CanCast reports whether the caster has enough MP to cast the spell.
func CanCast(c *character.Character, spell *gamedata.Spell) bool {
	if c == nil || spell == nil {
		return false
	}
	return c.CurrentMP >= spell.MPCost
}

// ConsumeMP subtracts the spell's MP cost from the caster. Returns an error
// if the caster cannot afford the cast.
func ConsumeMP(c *character.Character, spell *gamedata.Spell) error {
	if c == nil || spell == nil {
		return fmt.Errorf("nil caster or spell")
	}
	if c.CurrentMP < spell.MPCost {
		return fmt.Errorf("%s has %d MP, needs %d", c.Name, c.CurrentMP, spell.MPCost)
	}
	c.CurrentMP -= spell.MPCost
	return nil
}

// ResolveSpellDamage computes magic damage per Section 6.2.
// damage = rand(spell_base, spell_base * 2)
// Elemental modifiers applied per target.
func ResolveSpellDamage(spell *gamedata.Spell, target *SpellTarget, rng *rand.Rand) int {
	base := spell.Power
	if base <= 0 {
		return 0
	}

	dmg := base + rng.IntN(base+1)

	if target.WeakTo(spell.Element) {
		dmg = dmg * 3 / 2
	}
	if target.Resists(spell.Element) {
		dmg = dmg / 2
	}

	if dmg < 1 {
		dmg = 1
	}

	return dmg
}

// SpellTarget provides element interaction for damage calculation.
type SpellTarget struct {
	Weaknesses  []string
	Resistances []string
	Absorbs     []string
}

func (t *SpellTarget) WeakTo(element string) bool {
	if element == "none" || element == "" {
		return false
	}
	for _, e := range t.Weaknesses {
		if e == element {
			return true
		}
	}
	return false
}

func (t *SpellTarget) Resists(element string) bool {
	if element == "none" || element == "" {
		return false
	}
	for _, e := range t.Resistances {
		if e == element {
			return true
		}
	}
	return false
}

func (t *SpellTarget) AbsorbsElement(element string) bool {
	if element == "none" || element == "" {
		return false
	}
	for _, e := range t.Absorbs {
		if e == element {
			return true
		}
	}
	return false
}

// ResolveHealSpell computes heal amount. Per GDD, healing = rand(power, power*2).
func ResolveHealSpell(spell *gamedata.Spell, rng *rand.Rand) int {
	if spell.Power <= 0 {
		return 0
	}
	return spell.Power + rng.IntN(spell.Power+1)
}

// ResolveStatusSpell checks if a status effect lands. Returns true if successful.
func ResolveStatusSpell(spell *gamedata.Spell, targetVIT int, rng *rand.Rand) bool {
	if spell.HitChance <= 0 {
		return false
	}
	// Status resistance based on VIT
	adjustedChance := spell.HitChance - targetVIT
	if adjustedChance < 5 {
		adjustedChance = 5
	}
	return rng.IntN(100) < adjustedChance
}

// ApplySpellToCharacter applies a resolved spell effect to a character.
func ApplySpellToCharacter(c *character.Character, spell *gamedata.Spell, amount int) {
	switch spell.Effect {
	case "heal":
		c.Heal(amount)
	case "cure_status":
		if c.Status == character.Status(spell.CuresStatus) {
			c.Status = character.StatusNone
		}
	}
}
