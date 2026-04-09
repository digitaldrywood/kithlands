package magic

import (
	"fmt"
	"math/rand/v2"
	"sort"
	"strconv"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// SpellBook tracks which spells a character knows and how many charges remain.
// Per Section 8.1: FF1-style spell charges per spell level, not a unified MP pool.
type SpellBook struct {
	// KnownSpells maps spell level (1-8) to up to 3 spell IDs.
	KnownSpells map[int][]string `json:"known_spells"`

	// Charges maps spell level (1-8) to remaining charges.
	Charges map[int]int `json:"charges"`

	// MaxCharges maps spell level (1-8) to maximum charges for current character level.
	MaxCharges map[int]int `json:"max_charges"`
}

// NewSpellBook creates an empty spell book.
func NewSpellBook() *SpellBook {
	return &SpellBook{
		KnownSpells: make(map[int][]string),
		Charges:     make(map[int]int),
		MaxCharges:  make(map[int]int),
	}
}

// UpdateCharges recalculates max charges based on character level and class.
// Uses the charge table from spells.json per Section 8.1.
func (sb *SpellBook) UpdateCharges(charLevel int, class *gamedata.Class, spells *gamedata.SpellsData, promoted bool) {
	table := spells.ChargeTable.Table

	// Find the highest table entry <= charLevel
	var keys []int
	for k := range table {
		n, _ := strconv.Atoi(k)
		keys = append(keys, n)
	}
	sort.Ints(keys)

	var row []int
	for _, k := range keys {
		if k <= charLevel {
			row = table[strconv.Itoa(k)]
		}
	}
	if row == nil {
		return
	}

	maxSpellLvl := class.Magic.MaxSpellLevel
	if promoted {
		maxSpellLvl = class.Magic.PromotedMaxSpellLvl
	}

	for i, charges := range row {
		spellLvl := i + 1
		if spellLvl > maxSpellLvl {
			break
		}
		sb.MaxCharges[spellLvl] = charges
		if sb.Charges[spellLvl] > charges {
			sb.Charges[spellLvl] = charges
		}
	}
}

// RestoreAllCharges fills all charges to max (inn rest).
func (sb *SpellBook) RestoreAllCharges() {
	for lvl, max := range sb.MaxCharges {
		sb.Charges[lvl] = max
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

// CanCast returns true if the character has charges at the spell's level.
func (sb *SpellBook) CanCast(spell *gamedata.Spell) bool {
	return sb.Charges[spell.SpellLevel] > 0
}

// ConsumeCharge uses one charge at the given spell level.
func (sb *SpellBook) ConsumeCharge(spellLevel int) error {
	if sb.Charges[spellLevel] <= 0 {
		return fmt.Errorf("no charges remaining at spell level %d", spellLevel)
	}
	sb.Charges[spellLevel]--
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
