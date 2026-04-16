package api

// Debug-only exported mutators. These are the production-build siblings of
// the *ForTest helpers in export_test.go. They are reached only from the
// debug HTTP handlers (debug_handlers.go), which are themselves registered
// only when KITHLANDS_DEBUG=1 is set in the environment.
//
// Why not //go:build debug?
//   The *ForTest helpers live in _test.go files and are not linkable from
//   a non-test HTTP handler. Gating these mirrors behind a build tag would
//   mean `go test ./...` could not exercise the HTTP handlers (they'd be
//   tag-excluded from the test binary too). Env-var gating at route
//   registration time is the same idiom net/http/pprof uses and lets the
//   handler coverage ship with the normal test binary.

import (
	"errors"
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
)

type DebugPartyVitalsUpdate struct {
	Slot   int
	HP     *int
	MP     *int
	Status *string
}

type DebugPartyLevelUpdate struct {
	Slot  int `json:"slot"`
	Level int `json:"level"`
}

// DebugForceEncounterStart sets the encounter start marker and resets the
// round counter so the next client poll sees the requested opening.
// Only "ambush", "preemptive", and "normal" are accepted.
func (g *Game) DebugForceEncounterStart(kind string) error {
	var start combat.EncounterStart
	switch kind {
	case "ambush":
		start = combat.EncounterStartAmbush
	case "preemptive":
		start = combat.EncounterStartPreemptive
	case "normal", "":
		start = combat.EncounterStartNormal
	default:
		return fmt.Errorf("unknown encounter start %q", kind)
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.phase != "combat" {
		return errors.New("not in combat phase")
	}
	g.encounterStart = start
	g.combatRound = 0
	return nil
}

// DebugForceEncounter drops the game straight into a combat phase against
// the named monsters at the requested level, bypassing the random encounter
// roll. Parallels EnterCombatForTest used by tests.
func (g *Game) DebugForceEncounter(monsterIDs []string, level int) error {
	if len(monsterIDs) == 0 {
		return errors.New("monster_ids required")
	}
	if level <= 0 {
		level = 1
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.snapshotVictoryXPProgress()
	g.enemies = g.enemies[:0]
	for _, id := range monsterIDs {
		found := false
		for i := range g.gd.Monsters {
			m := &g.gd.Monsters[i]
			if m.ID != id {
				continue
			}
			c := balance.ScaleMonster(m, level, 1, g.diff)
			c.MonsterID = m.ID
			c.Size = m.Size
			g.enemies = append(g.enemies, c)
			found = true
			break
		}
		if !found {
			return fmt.Errorf("unknown monster %q", id)
		}
	}
	g.phase = "combat"
	g.spellBuffs = nil
	g.encounterStart = combat.EncounterStartNormal
	g.combatRound = 0
	g.combatLog = nil
	g.combatActions = nil
	return nil
}

// DebugGiveItem adds n copies of the named consumable to the inventory.
// Unknown IDs are accepted silently (the inventory is a map) but the
// handler validates against gamedata before calling this.
func (g *Game) DebugGiveItem(itemID string, qty int) error {
	if itemID == "" {
		return errors.New("item_id required")
	}
	if qty <= 0 {
		qty = 1
	}
	// Verify the id is a known consumable; silent success would mask typos.
	known := false
	for _, c := range g.gd.Items.Consumables {
		if c.ID == itemID {
			known = true
			break
		}
	}
	if !known {
		return fmt.Errorf("unknown consumable %q", itemID)
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.inv.Consumables[itemID] += qty
	return nil
}

// DebugSetGold overwrites the party's gold. Debug-only: used by visual proof
// flows that need deterministic shop purchasing without walking a money grind.
func (g *Game) DebugSetGold(gold int) error {
	if gold < 0 {
		return errors.New("gold must be >= 0")
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.inv.Gold = gold
	return nil
}

// DebugHealParty restores every living party member to full HP and MP and
// clears non-death statuses. Members at 0 HP remain dead — use a Phoenix
// Down via DebugGiveItem + a combat action to revive them.
func (g *Game) DebugHealParty() {
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, c := range g.party {
		if c == nil {
			continue
		}
		if c.CurrentHP <= 0 {
			continue
		}
		c.CurrentHP = c.MaxHP
		c.CurrentMP = c.MaxMP
		if c.Status != character.StatusDeath {
			c.Status = character.StatusNone
		}
	}
}

// DebugSetPartyVitals applies direct HP/MP/status overrides to named party
// slots. Debug-only: used by Playwright proof flows to set up deterministic
// menu states without depending on combat RNG.
func (g *Game) DebugSetPartyVitals(updates []DebugPartyVitalsUpdate) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, update := range updates {
		if update.Slot < 0 || update.Slot >= len(g.party) {
			return fmt.Errorf("invalid slot %d", update.Slot)
		}
		c := g.party[update.Slot]
		if c == nil {
			return fmt.Errorf("invalid slot %d", update.Slot)
		}
		if update.HP != nil {
			c.CurrentHP = max(0, min(c.MaxHP, *update.HP))
			if c.CurrentHP == 0 {
				c.Status = character.StatusDeath
			} else if c.Status == character.StatusDeath && update.Status == nil {
				c.Status = character.StatusNone
			}
		}
		if update.MP != nil {
			c.CurrentMP = max(0, min(c.MaxMP, *update.MP))
		}
		if update.Status != nil {
			c.Status = character.Status(*update.Status)
		}
	}
	return nil
}

// DebugSetPartyLevels applies direct level overrides for deterministic shop
// and progression proof setup. It intentionally changes only Level because the
// issue-scoped tests care about shop gating, not a full respec of combat stats.
func (g *Game) DebugSetPartyLevels(updates []DebugPartyLevelUpdate) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, update := range updates {
		if update.Slot < 0 || update.Slot >= len(g.party) {
			return fmt.Errorf("invalid slot %d", update.Slot)
		}
		if update.Level < 1 {
			return fmt.Errorf("invalid level %d", update.Level)
		}
		c := g.party[update.Slot]
		if c == nil {
			return fmt.Errorf("invalid slot %d", update.Slot)
		}
		c.Level = update.Level
	}
	return nil
}

// DebugWarpQuest fast-forwards currentQ so the named quest index is active.
// Out-of-range indices clamp to [0, len(quests)].
func (g *Game) DebugWarpQuest(idx int) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if idx < 0 {
		idx = 0
	}
	if idx > len(g.quests) {
		idx = len(g.quests)
	}
	g.currentQ = idx
	return nil
}
