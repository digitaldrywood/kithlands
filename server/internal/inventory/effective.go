package inventory

import (
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// EffectiveStats is a disposable gameplay snapshot, never persisted over growth
// stats. HP, MP, status, and level-up gains remain properties of Character.
type EffectiveStats struct {
	STR, AGI, INT, VIT, LCK int
	HitPct, Power, Absorb   int
	EvadePenalty, CritPct   int
	SpellDamagePct          int
	BareHandDamage          int
}

// ResolveEffectiveStats combines base growth with each resolved equipment slot.
func (inv *Inventory) ResolveEffectiveStats(c *character.Character, slot int, gd *gamedata.GameData) EffectiveStats {
	return ResolveStats(c, inv.LoadoutStats(slot, gd), gd.ClassByID(c.ClassID))
}

// ResolveStats also serves proposed loadouts. Derived values always use the
// resulting attributes, so preview, field, combat and save reload agree.
func ResolveStats(c *character.Character, gear map[string]int, class *gamedata.Class) EffectiveStats {
	e := EffectiveStats{
		STR: max(0, c.STR+gear["str"]), AGI: max(0, c.AGI+gear["agi"]),
		INT: max(0, c.INT+gear["int"]), VIT: c.VIT, LCK: max(0, c.LCK+gear["lck"]),
		Power: gear["power"], Absorb: max(0, gear["absorb"]),
		EvadePenalty: gear["evade_penalty"], CritPct: gear["crit_pct"],
		SpellDamagePct: max(0, gear["spell_damage_pct"]),
	}
	e.HitPct = max(0, c.HitPct+gear["hit_pct"])
	if class != nil && class.BareHand != nil {
		e.BareHandDamage = class.BareHand.BaseDamage + c.Level*e.STR/2
	}
	return e
}

func (e EffectiveStats) Attack() int {
	if e.BareHandDamage > 0 {
		return e.BareHandDamage + e.Power
	}
	return e.STR + e.Power
}
func (e EffectiveStats) Evade() int      { return max(0, e.AGI*2-e.EvadePenalty) }
func (e EffectiveStats) CritChance() int { return min(100, max(0, e.LCK/4+e.CritPct)) }

// Values is the authoritative equipment-screen projection (before temporary
// combat buffs and row modifiers). Power is equipment power, attack includes STR
// or the class's bare-hand curve. SpellDamagePct is an offensive casting bonus;
// effective INT scales damage and healing.
func (e EffectiveStats) Values() map[string]int {
	return map[string]int{
		"str": e.STR, "agi": e.AGI, "int": e.INT, "vit": e.VIT, "lck": e.LCK,
		"power": e.Power, "attack": e.Attack(), "absorb": e.Absorb, "hit_pct": e.HitPct,
		"evade": e.Evade(), "evade_penalty": e.EvadePenalty,
		"crit_pct": e.CritChance(), "attacks_per_turn": 1 + e.HitPct/32,
		"spell_damage_pct": e.SpellDamagePct,
	}
}
