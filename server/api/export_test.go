package api

import (
	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/combat"
)

// ForceVictoryForTest kills every enemy in the current encounter and runs
// the normal combat-victory path so the game transitions into the post-fight
// quest_complete / promotion phases. Exposed only for tests.
func ForceVictoryForTest(g *Game) {
	g.mu.Lock()
	for _, e := range g.enemies {
		e.CurrentHP = 0
	}
	g.mu.Unlock()
	// A harmless attack action runs the victory-resolution block.
	_, _ = g.ProcessAction(GameActionRequest{
		Type: "attack",
		Actions: []MemberActionReq{
			{Slot: 0, Type: "defend"},
		},
	})
}

// DamagePartyForTest subtracts `dmg` HP from the given party slot without
// killing the character (floors at 1). Used by spell tests that need a
// damaged ally to verify heal effects.
func DamagePartyForTest(g *Game, slot int, dmg int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if slot < 0 || slot >= len(g.party) {
		return
	}
	c := g.party[slot]
	c.CurrentHP -= dmg
	if c.CurrentHP < 1 {
		c.CurrentHP = 1
	}
}

// PartyCurrentHPForTest returns the party member's current HP. Reads through
// the same field the spell handlers write to, so tests can assert on heal
// amounts without going through the full GameState serialization.
func PartyCurrentHPForTest(g *Game, slot int) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	if slot < 0 || slot >= len(g.party) {
		return -1
	}
	return g.party[slot].CurrentHP
}

// ReplaceEnemiesForTest clears the current encounter and installs a single
// scaled instance of the named monster. Used to set up deterministic fights
// (e.g. skeleton-only for undead-cure tests).
func ReplaceEnemiesForTest(g *Game, monsterID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for i := range g.gd.Monsters {
		m := &g.gd.Monsters[i]
		if m.ID != monsterID {
			continue
		}
		c := balance.ScaleMonster(m, 100, 1, g.diff)
		c.MonsterID = m.ID
		c.Size = m.Size
		g.enemies = []*combat.Combatant{c}
		return
	}
}

// SpellBuffsForTest returns the active spell buffs on the given party slot.
func SpellBuffsForTest(g *Game, slot int) []combat.CombatBuff {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.spellBuffs == nil {
		return nil
	}
	return g.spellBuffs[slot]
}

// TeachSpellForTest teaches the given party member a spell at the provided
// spell level so tests can exercise spells outside the member's starting
// learnset (e.g. all_allies heal spells).
func TeachSpellForTest(g *Game, slot int, spellID string, spellLevel int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if slot < 0 || slot >= len(g.party) {
		return
	}
	sb, ok := g.spellBooks[g.party[slot].Name]
	if !ok {
		return
	}
	_ = sb.LearnSpell(spellID, spellLevel, 3)
	if sb.MaxCharges[spellLevel] < 1 {
		sb.MaxCharges[spellLevel] = 3
	}
	sb.Charges[spellLevel] = sb.MaxCharges[spellLevel]
}

// CastBuffSpellLiveBuffsForTest exercises resolveBuffSpell against a fresh
// combatants slice (mirroring makeCombatants) and returns the live buffs on
// the target combatant. Used to verify a recast replaces the existing live
// buff instead of stacking on top of the preloaded persistent copy.
func CastBuffSpellLiveBuffsForTest(g *Game, casterSlot, targetSlot int, spellID string) []combat.CombatBuff {
	g.mu.Lock()
	defer g.mu.Unlock()
	combatants := g.makeCombatants()
	spell := g.gd.SpellByID(spellID)
	if spell == nil {
		return nil
	}
	caster := g.party[casterSlot]
	pc := combatants[casterSlot]
	g.resolveBuffSpell(combatants, pc, caster, spell, targetSlot)
	return combatants[targetSlot].Buffs
}
