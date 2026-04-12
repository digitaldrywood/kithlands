package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// processWorldItem handles `{type:"item"}` requests issued from the world-menu
// Item screen. Mirrors processCombatItem's dispatch but without the enemy turn:
// out-of-combat item use is a free action.
//
// Rules:
//
//   - Only consumables flagged world_usable are accepted. Tent is the only
//     current item that is world-only; everything else is both.
//   - The caller passes TargetID as a party slot index (0-based). A sentinel
//     -1 means "pick automatically" (most-damaged, etc.) so the client can
//     skip target selection for full-party effects like Tent.
//   - Inventory is decremented exactly once, on success. Rejection paths
//     (full HP, no valid target, wrong status) MUST return an error before
//     the decrement so the item is refunded to the player.
func (g *Game) processWorldItem(req GameActionRequest) (*GameState, error) {
	consumable := g.findConsumable(req.ItemID)
	if consumable == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("unknown item %q", req.ItemID)
	}
	if !consumable.WorldUsable {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("%s cannot be used here", consumable.Name)
	}
	if g.inv.Consumables[consumable.ID] <= 0 {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("no %s", consumable.Name)
	}

	// Dispatch — validate BEFORE consuming so bad requests refund the item.
	if err := g.applyWorldConsumableEffect(consumable, req.TargetID); err != nil {
		state := g.stateUnlocked()
		return &state, err
	}

	// Validation passed — consume the item.
	g.inv.Consumables[consumable.ID]--
	if g.inv.Consumables[consumable.ID] == 0 {
		delete(g.inv.Consumables, consumable.ID)
	}

	g.message = fmt.Sprintf("Used %s.", consumable.Name)
	state := g.stateUnlocked()
	return &state, nil
}

// findConsumable returns the shared/items.json definition for the given id,
// or nil if unknown. Pointer into g.gd.Items.Consumables — do not mutate.
func (g *Game) findConsumable(id string) *gamedata.Consumable {
	for i := range g.gd.Items.Consumables {
		if g.gd.Items.Consumables[i].ID == id {
			return &g.gd.Items.Consumables[i]
		}
	}
	return nil
}

// applyWorldConsumableEffect runs the effect and reports an error when the
// attempt should be rejected (e.g. no valid target, already at full HP). The
// caller only decrements inventory if this returns nil.
func (g *Game) applyWorldConsumableEffect(c *gamedata.Consumable, targetIdx int) error {
	switch c.Effect {
	case "heal":
		target := pickHealTarget(g.party, targetIdx)
		if target == nil {
			return fmt.Errorf("no valid target")
		}
		if target.CurrentHP >= target.MaxHP {
			return fmt.Errorf("%s is already at full HP", target.Name)
		}
		target.Heal(c.Value)

	case "restore_mp":
		target := pickMPTarget(g.party, targetIdx)
		if target == nil {
			return fmt.Errorf("no valid target")
		}
		if target.CurrentMP >= target.MaxMP {
			return fmt.Errorf("%s's MP is already full", target.Name)
		}
		target.RestoreMP(c.Value)

	case "cure_poison":
		return g.cureStatus(targetIdx, character.StatusPoison)

	case "cure_silence":
		return g.cureStatus(targetIdx, character.StatusSilence)

	case "cure_stone":
		return g.cureStatus(targetIdx, character.StatusStone)

	case "revive":
		if targetIdx < 0 || targetIdx >= len(g.party) {
			return fmt.Errorf("invalid target")
		}
		t := g.party[targetIdx]
		if t.IsAlive() {
			return fmt.Errorf("%s is not KO'd", t.Name)
		}
		t.Status = character.StatusNone
		t.CurrentHP = c.Value
		if t.CurrentHP < 1 {
			t.CurrentHP = 1
		}

	case "rest":
		// Tent: fully restores the whole party.
		g.restParty()

	default:
		return fmt.Errorf("effect %q not usable in the field", c.Effect)
	}
	return nil
}

// cureStatus clears the given status from the targeted party member, erroring
// if the member is not afflicted. Shared by cure_poison/cure_silence/cure_stone.
func (g *Game) cureStatus(targetIdx int, status character.Status) error {
	if targetIdx < 0 || targetIdx >= len(g.party) {
		return fmt.Errorf("invalid target")
	}
	t := g.party[targetIdx]
	if t.Status != status {
		return fmt.Errorf("%s is not afflicted with %s", t.Name, status)
	}
	t.Status = character.StatusNone
	return nil
}
