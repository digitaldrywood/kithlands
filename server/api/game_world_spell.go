package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

// processWorldSpell handles out-of-combat spell casts initiated from the
// party menu or character detail screen. Like world items, field spells are
// free actions: validate everything up front, then consume MP exactly once.
func (g *Game) processWorldSpell(req GameActionRequest) (*GameState, error) {
	caster, err := g.worldSpellCaster(req.SlotIdx)
	if err != nil {
		state := g.stateUnlocked()
		return &state, err
	}
	if caster.Status == character.StatusSilence {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("%s is silenced and cannot cast", caster.Name)
	}

	spell := g.gd.SpellByID(req.SpellID)
	if spell == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("unknown spell %q", req.SpellID)
	}
	if !g.characterKnowsSpell(caster, spell.ID) {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("%s does not know %s", caster.Name, spell.Name)
	}
	if !isFieldCastableSpell(spell) {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("%s cannot be cast in the field", spell.Name)
	}
	if !magic.CanCast(caster, spell) {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("%s doesn't have enough MP for %s", caster.Name, spell.Name)
	}
	if err := g.validateWorldSpellTarget(spell, req.TargetID); err != nil {
		state := g.stateUnlocked()
		return &state, err
	}
	if err := magic.ConsumeMP(caster, spell); err != nil {
		state := g.stateUnlocked()
		return &state, err
	}

	g.message = g.applyWorldSpell(req.SlotIdx, caster, spell, req.TargetID)
	state := g.stateUnlocked()
	return &state, nil
}

func isFieldCastableSpell(spell *gamedata.Spell) bool {
	if spell == nil {
		return false
	}
	switch spell.Effect {
	case "heal", "cure_status":
		return true
	case "utility":
		return spell.ID == "resurrect"
	}
	return false
}

func (g *Game) worldSpellCaster(slot int) (*character.Character, error) {
	if slot < 0 || slot >= len(g.party) {
		return nil, fmt.Errorf("invalid caster")
	}
	caster := g.party[slot]
	if caster == nil {
		return nil, fmt.Errorf("invalid caster")
	}
	if !caster.IsAlive() {
		return nil, fmt.Errorf("%s cannot cast right now", caster.Name)
	}
	return caster, nil
}

func (g *Game) characterKnowsSpell(caster *character.Character, spellID string) bool {
	if caster == nil {
		return false
	}
	sb, ok := g.spellBooks[caster.Name]
	if !ok || sb == nil {
		return false
	}
	for _, ids := range sb.KnownSpells {
		for _, id := range ids {
			if id == spellID {
				return true
			}
		}
	}
	return false
}

func (g *Game) validateWorldSpellTarget(spell *gamedata.Spell, targetIdx int) error {
	switch spell.Effect {
	case "heal":
		if spell.Target == "all_allies" {
			if !g.anyLivingPartyMember(func(c *character.Character) bool {
				return c.CurrentHP < c.MaxHP
			}) {
				return fmt.Errorf("no valid target")
			}
			return nil
		}
		target, err := g.worldSpellTarget(targetIdx)
		if err != nil {
			return err
		}
		if !target.IsAlive() {
			return fmt.Errorf("%s cannot be healed", target.Name)
		}
		if target.CurrentHP >= target.MaxHP {
			return fmt.Errorf("%s is already at full HP", target.Name)
		}
		return nil

	case "cure_status":
		if spell.Target == "all_allies" {
			if !g.anyLivingPartyMember(func(c *character.Character) bool {
				return worldSpellCuresStatus(spell, c)
			}) {
				return fmt.Errorf("no valid target")
			}
			return nil
		}
		target, err := g.worldSpellTarget(targetIdx)
		if err != nil {
			return err
		}
		if !target.IsAlive() {
			return fmt.Errorf("%s cannot be targeted", target.Name)
		}
		if !worldSpellCuresStatus(spell, target) {
			return fmt.Errorf("%s is not afflicted with %s", target.Name, spell.CuresStatus)
		}
		return nil

	case "utility":
		target, err := g.worldSpellTarget(targetIdx)
		if err != nil {
			return err
		}
		if target.Status != character.StatusDeath && target.CurrentHP > 0 {
			return fmt.Errorf("%s is not KO'd", target.Name)
		}
		return nil
	}
	return fmt.Errorf("%s cannot be cast in the field", spell.Name)
}

func (g *Game) worldSpellTarget(targetIdx int) (*character.Character, error) {
	if targetIdx < 0 || targetIdx >= len(g.party) {
		return nil, fmt.Errorf("invalid target")
	}
	target := g.party[targetIdx]
	if target == nil {
		return nil, fmt.Errorf("invalid target")
	}
	return target, nil
}

func (g *Game) anyLivingPartyMember(match func(*character.Character) bool) bool {
	for _, c := range g.party {
		if c == nil || !c.IsAlive() {
			continue
		}
		if match(c) {
			return true
		}
	}
	return false
}

func worldSpellCuresStatus(spell *gamedata.Spell, target *character.Character) bool {
	if spell == nil || target == nil || !target.IsAlive() {
		return false
	}
	if spell.CuresStatus == "all" {
		return target.Status != character.StatusNone && target.Status != character.StatusDeath
	}
	return target.Status == character.Status(spell.CuresStatus)
}

func (g *Game) applyWorldSpell(casterSlot int, caster *character.Character, spell *gamedata.Spell, targetIdx int) string {
	switch spell.Effect {
	case "heal":
		effective := g.inv.ResolveEffectiveStats(caster, casterSlot, g.gd)
		amount := magic.ResolveHealSpell(spell, magic.CasterPower{Intellect: effective.INT}, g.rng)
		if spell.Target == "all_allies" {
			for _, c := range g.party {
				if c == nil || !c.IsAlive() {
					continue
				}
				c.Heal(amount)
			}
			return fmt.Sprintf("%s casts %s on the party.", caster.Name, spell.Name)
		}
		target, _ := g.worldSpellTarget(targetIdx)
		magic.ApplySpellToCharacter(target, spell, amount)
		return fmt.Sprintf("%s casts %s on %s.", caster.Name, spell.Name, target.Name)

	case "cure_status":
		if spell.Target == "all_allies" {
			for _, c := range g.party {
				if worldSpellCuresStatus(spell, c) {
					c.Status = character.StatusNone
				}
			}
			return fmt.Sprintf("%s casts %s on the party.", caster.Name, spell.Name)
		}
		target, _ := g.worldSpellTarget(targetIdx)
		magic.ApplySpellToCharacter(target, spell, 0)
		return fmt.Sprintf("%s casts %s on %s.", caster.Name, spell.Name, target.Name)

	case "utility":
		target, _ := g.worldSpellTarget(targetIdx)
		target.Status = character.StatusNone
		target.CurrentHP = 1
		return fmt.Sprintf("%s casts %s on %s.", caster.Name, spell.Name, target.Name)
	}
	return ""
}
