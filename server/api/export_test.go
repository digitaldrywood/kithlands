package api

import (
	"errors"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// OverrideFormationsForTest replaces the game's formation pool with a
// synthetic set so tests can drive GenerateFormationEncounter into edge
// cases (e.g. slots that reference unknown monster IDs and therefore
// produce zero combatants — the pinned regression for issue #114).
func OverrideFormationsForTest(g *Game, formations []gamedata.Formation) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.gd.Formations = formations
}

// ForceWorldPhaseForTest drops the game back into the "world" phase and
// clears enemies. Used by tests that need to stage a fresh encounter
// request without completing the previous fight.
func ForceWorldPhaseForTest(g *Game) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.phase = "world"
	g.enemies = nil
}

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

// KillPartyMemberForTest drops the party member at idx to 0 HP and marks
// them dead. Exposed only for tests.
func KillPartyMemberForTest(g *Game, idx int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.party[idx].CurrentHP = 0
	g.party[idx].Status = character.StatusDeath
}

// PartyXPForTest returns the raw XP of the party member at idx. Exposed only
// for tests.
func PartyXPForTest(g *Game, idx int) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.party[idx].XP
}

// PartyHPForTest returns the current HP of the party member at idx. Exposed
// only for tests.
func PartyHPForTest(g *Game, idx int) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.party[idx].CurrentHP
}

// PartyMaxHPForTest returns the max HP of the party member at idx.
func PartyMaxHPForTest(g *Game, idx int) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.party[idx].MaxHP
}

// PartyMPForTest returns the current MP of the party member at idx.
func PartyMPForTest(g *Game, idx int) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.party[idx].CurrentMP
}

// PartyMaxMPForTest returns the max MP of the party member at idx.
func PartyMaxMPForTest(g *Game, idx int) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.party[idx].MaxMP
}

// PartyStatusForTest returns the current status of the party member at idx.
func PartyStatusForTest(g *Game, idx int) character.Status {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.party[idx].Status
}

// DamagePartyMPForTest subtracts n MP from the given party slot without
// letting it go negative. Used by no-rest tests to verify combat victory
// does not refill MP.
func DamagePartyMPForTest(g *Game, slot int, n int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if slot < 0 || slot >= len(g.party) {
		return
	}
	c := g.party[slot]
	c.CurrentMP -= n
	if c.CurrentMP < 0 {
		c.CurrentMP = 0
	}
}

// GiveItemForTest adds n of the given consumable to inventory. Exposed only
// for tests.
func GiveItemForTest(g *Game, id string, n int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.inv.Consumables[id] += n
}

// KeyItemsForTest returns a copy of the party's key-item list. Exposed only
// for tests (the client doesn't need a full inventory dump).
func KeyItemsForTest(g *Game) []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([]string, len(g.inv.KeyItems))
	copy(out, g.inv.KeyItems)
	return out
}

// HasKeyItemForTest checks whether the party holds the named key item.
func HasKeyItemForTest(g *Game, id string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.inv.HasKeyItem(id)
}

// HasPhoenixDownForTest reports whether any Phoenix Down is currently held.
// Used by the debug handler tests that verify /api/debug/.../give-item.
func HasPhoenixDownForTest(g *Game) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.inv.Consumables["phoenix_down"] > 0
}

// CurrentQuestForTest returns g.currentQ so tests can verify warp-quest
// side effects.
func CurrentQuestForTest(g *Game) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.currentQ
}

// QuestCountForTest returns len(g.quests) so warp-quest clamping tests
// don't have to reach into the wire state.
func QuestCountForTest(g *Game) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return len(g.quests)
}

// SetCurrentQuestForTest advances g.currentQ to idx (without clamping).
// Used by the promotion/feature-trigger integration tests to warp the
// party to a specific quest beat.
func SetCurrentQuestForTest(g *Game, idx int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.currentQ = idx
}

// PromotionOfferedForTest reports whether the midpoint promotion offer has
// already fired once on this game.
func PromotionOfferedForTest(g *Game) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.promotionOffered
}

// ClearQuestsForTest advances currentQ past the end of g.quests so a subsequent
// combat victory skips the quest-reward branch entirely and only exercises the
// monster-XP distribution path. Exposed only for tests.
func ClearQuestsForTest(g *Game) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.currentQ = len(g.quests)
}

// NilPartyMemberForTest drops a nil pointer into g.party to force a
// downstream nil-deref panic when makeCombatants runs. The issue #138
// regression test uses it to verify that ProcessAction's panic recovery
// converts the crash into a typed error instead of an empty 500 body.
func NilPartyMemberForTest(g *Game, slot int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if slot < 0 || slot >= len(g.party) {
		return
	}
	g.party[slot] = nil
}

// IsErrInternalAction reports whether err wraps ErrInternalAction. Exposed
// so tests in the api_test package can assert on the sentinel without
// importing the unexported variable.
func IsErrInternalAction(err error) bool {
	return errors.Is(err, ErrInternalAction)
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
// learnset (e.g. all_allies heal spells). Also refills the caster to full MP
// so the test can immediately cast the new spell.
func TeachSpellForTest(g *Game, slot int, spellID string, spellLevel int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if slot < 0 || slot >= len(g.party) {
		return
	}
	c := g.party[slot]
	sb, ok := g.spellBooks[c.Name]
	if !ok {
		return
	}
	_ = sb.LearnSpell(spellID, spellLevel, 3)
	// Ensure the test caster has enough MP even if the class curve would
	// normally leave them empty at level 1 (e.g. bare warrior in combat
	// fixture tests that bolt a cure spell onto any slot).
	if c.MaxMP < 20 {
		c.MaxMP = 20
	}
	c.CurrentMP = c.MaxMP
}

// SetEncounterStartForTest overrides the current encounter's start outcome
// and resets the round counter so combat tests can deterministically exercise
// the preemptive/ambush first-round paths without fighting RNG.
func SetEncounterStartForTest(g *Game, s combat.EncounterStart) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.encounterStart = s
	g.combatRound = 0
}

// EncounterStartForTest returns the encounter-start marker currently on the
// Game. Used by tests to assert that combat-exit paths reset the state.
func EncounterStartForTest(g *Game) combat.EncounterStart {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.encounterStart
}

// CombatRoundForTest returns the current round counter. Used alongside
// SetEncounterStartForTest to verify that round gating releases after round 1.
func CombatRoundForTest(g *Game) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.combatRound
}

// EnemyHPForTest returns the total HP of live enemies. Used to assert that
// preemptive first rounds leave enemies unharmed or that ambush first rounds
// spare them.
func EnemyHPForTest(g *Game) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	total := 0
	for _, e := range g.enemies {
		if e.CurrentHP > 0 {
			total += e.CurrentHP
		}
	}
	return total
}

// PartyTotalHPForTest returns the summed HP of the party. Used symmetrically
// to EnemyHPForTest for ambush/preemptive assertions.
func PartyTotalHPForTest(g *Game) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	total := 0
	for _, c := range g.party {
		if c.CurrentHP > 0 {
			total += c.CurrentHP
		}
	}
	return total
}

// ReplaceEnemiesScaledForTest installs a deterministic enemy team. Similar
// to ReplaceEnemiesForTest but lets the test pass its own ID list so we can
// stage multi-enemy ambush/preemptive fights.
func ReplaceEnemiesScaledForTest(g *Game, monsterIDs []string, level int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.enemies = g.enemies[:0]
	for _, id := range monsterIDs {
		for i := range g.gd.Monsters {
			m := &g.gd.Monsters[i]
			if m.ID != id {
				continue
			}
			c := balance.ScaleMonster(m, level, 1, g.diff)
			c.MonsterID = m.ID
			c.Size = m.Size
			g.enemies = append(g.enemies, c)
			break
		}
	}
}

// ApplyStatusToEnemyForTest marks enemy 0 with the given status so poison-tick
// assertions can fire on a single known target.
func ApplyStatusToEnemyForTest(g *Game, status character.Status) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if len(g.enemies) > 0 {
		g.enemies[0].Status = status
	}
}

// ApplyStatusToPartyForTest marks the party member at slot with the given
// status so ambush-poison-tick assertions can fire deterministically.
func ApplyStatusToPartyForTest(g *Game, slot int, status character.Status) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if slot >= 0 && slot < len(g.party) {
		g.party[slot].Status = status
	}
}

// EnterCombatForTest forces the game into a combat phase with a single
// deterministic encounter. Bypasses the random roll by clearing the start
// marker and round counter; tests should follow up with
// SetEncounterStartForTest to pick the outcome under test.
func EnterCombatForTest(g *Game, monsterIDs []string, level int) {
	ReplaceEnemiesScaledForTest(g, monsterIDs, level)
	g.mu.Lock()
	defer g.mu.Unlock()
	g.phase = "combat"
	g.spellBuffs = nil
	g.encounterStart = combat.EncounterStartNormal
	g.combatRound = 0
}

// CastBuffSpellLiveBuffsForTest exercises resolveBuffSpell against a fresh
// combatants slice (mirroring makeCombatants) and returns the live buffs on
// the target combatant. Used to verify a recast replaces the existing live
// buff instead of stacking on top of the preloaded persistent copy.
func CastBuffSpellLiveBuffsForTest(g *Game, casterSlot, targetSlot int, spellID string) []combat.CombatBuff {
	g.mu.Lock()
	defer g.mu.Unlock()
	if casterSlot < 0 || casterSlot >= len(g.party) {
		return nil
	}
	if targetSlot < 0 || targetSlot >= len(g.party) {
		return nil
	}
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
