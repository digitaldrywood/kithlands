package combat

import (
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

// NewPlayer snapshots base resources and resolved loadout stats. Only resources
// and status may be synchronized back to Character after a combat round.
func NewPlayer(id int, c *character.Character, inv *inventory.Inventory, gd *gamedata.GameData) *Combatant {
	e := inv.ResolveEffectiveStats(c, id, gd)
	return &Combatant{
		ID: id, Name: c.Name, IsPlayer: true, STR: e.STR, AGI: e.AGI, INT: e.INT, VIT: e.VIT, LCK: e.LCK,
		HitPct: e.HitPct, MaxHP: c.MaxHP, CurrentHP: c.CurrentHP, Status: c.Status, Row: string(c.Row),
		WeaponPower: e.Power, ArmorAbsorb: e.Absorb, LongRange: inv.WeaponLongRange(id, gd),
		BareHandDamage: e.BareHandDamage, EvadePenalty: e.EvadePenalty, CritPct: e.CritPct,
	}
}

func (c *Combatant) Evade() int      { return max(0, c.AGI*2-c.EvadePenalty) }
func (c *Combatant) CritChance() int { return min(100, max(0, c.LCK/4+c.CritPct)) }
