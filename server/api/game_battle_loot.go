package api

import (
	"fmt"
	"sort"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

const (
	battleLootPending  = "pending"
	battleLootKept     = "kept"
	battleLootEquipped = "equipped"
)

// BattleRewardsState is the authoritative receipt for the most recently
// completed encounter. Consumables and gems are aggregated by item and count;
// every equipment roll remains a distinct physical instance.
type BattleRewardsState struct {
	XP    int               `json:"xp"`
	Gold  int               `json:"gold"`
	Drops []BattleDropState `json:"drops,omitempty"`
}

type BattleDropState struct {
	ItemID            string                   `json:"item_id"`
	InstanceID        string                   `json:"instance_id,omitempty"`
	Kind              string                   `json:"kind"`
	Name              string                   `json:"name"`
	Quantity          int                      `json:"quantity"`
	Decision          string                   `json:"decision,omitempty"`
	Item              *ItemState               `json:"item,omitempty"`
	EquipOptions      []BattleEquipOptionState `json:"equip_options,omitempty"`
	EquippedPartySlot *int                     `json:"equipped_party_slot,omitempty"`
	EquipmentSlot     string                   `json:"equipment_slot,omitempty"`
}

// BattleEquipOptionState is a non-mutating comparison produced by applying
// the real inventory validator to a clone. Only genuinely valid party/slot
// pairs are returned.
type BattleEquipOptionState struct {
	PartySlot         int            `json:"party_slot"`
	CharacterName     string         `json:"character_name"`
	ClassName         string         `json:"class_name"`
	EquipmentSlot     string         `json:"equipment_slot"`
	EquipmentSlotName string         `json:"equipment_slot_name"`
	CurrentItemName   string         `json:"current_item_name,omitempty"`
	Before            map[string]int `json:"before"`
	After             map[string]int `json:"after"`
	Deltas            map[string]int `json:"deltas"`
}

type BattleLootDecisionRequest struct {
	InstanceID    string `json:"instance_id"`
	Action        string `json:"action"`
	PartySlot     int    `json:"party_slot,omitempty"`
	EquipmentSlot string `json:"equipment_slot,omitempty"`
}

type battleRewardsReceipt struct {
	XP    int                 `json:"xp"`
	Gold  int                 `json:"gold"`
	Drops []battleDropReceipt `json:"drops,omitempty"`
}

type battleDropReceipt struct {
	ItemID            string `json:"item_id"`
	InstanceID        string `json:"instance_id,omitempty"`
	Kind              string `json:"kind"`
	Name              string `json:"name"`
	Quantity          int    `json:"quantity"`
	Decision          string `json:"decision,omitempty"`
	EquippedPartySlot int    `json:"equipped_party_slot,omitempty"`
	EquipmentSlot     string `json:"equipment_slot,omitempty"`
}

func (g *Game) addBattleDrop(grant lootGrant) {
	if g.battleRewards == nil {
		g.battleRewards = &battleRewardsReceipt{}
	}
	if grant.Kind != "equipment" {
		for i := range g.battleRewards.Drops {
			drop := &g.battleRewards.Drops[i]
			if drop.Kind == grant.Kind && drop.ItemID == grant.ItemID {
				drop.Quantity += max(grant.Quantity, 1)
				return
			}
		}
	}
	decision := ""
	if grant.Kind == "equipment" {
		decision = battleLootPending
	}
	g.battleRewards.Drops = append(g.battleRewards.Drops, battleDropReceipt{
		ItemID: grant.ItemID, InstanceID: grant.InstanceID, Kind: grant.Kind,
		Name: grant.Name, Quantity: max(grant.Quantity, 1), Decision: decision,
	})
}

func (g *Game) fillBattleRewardsState(state *GameState) {
	if g.battleRewards == nil {
		return
	}
	out := &BattleRewardsState{XP: g.battleRewards.XP, Gold: g.battleRewards.Gold}
	for _, receipt := range g.battleRewards.Drops {
		drop := BattleDropState{
			ItemID: receipt.ItemID, InstanceID: receipt.InstanceID,
			Kind: receipt.Kind, Name: receipt.Name, Quantity: receipt.Quantity,
			Decision: receipt.Decision, EquipmentSlot: receipt.EquipmentSlot,
		}
		if receipt.Kind == "equipment" {
			if item, err := g.rolledItemState(receipt.InstanceID, g.inv.Instance(receipt.InstanceID)); err == nil {
				drop.Item = &item
			}
			if receipt.Decision == battleLootPending {
				drop.EquipOptions = g.battleEquipOptions(receipt.InstanceID)
			}
			if receipt.Decision == battleLootEquipped {
				partySlot := receipt.EquippedPartySlot
				drop.EquippedPartySlot = &partySlot
			}
		}
		out.Drops = append(out.Drops, drop)
	}
	state.BattleRewards = out
}

func (g *Game) battleEquipOptions(instanceID string) []BattleEquipOptionState {
	instance := g.inv.Instance(instanceID)
	if instance == nil || g.gd.EquipmentBaseByID(instance.BaseID) == nil {
		return nil
	}
	slotDefs := append([]gamedata.EquipmentSlotDefinition(nil), g.gd.Items.EquipmentSlots...)
	sort.SliceStable(slotDefs, func(i, j int) bool { return slotDefs[i].Order < slotDefs[j].Order })
	var options []BattleEquipOptionState
	for partySlot, member := range g.party {
		for _, slot := range slotDefs {
			working := g.inv.Clone()
			if _, err := working.EquipInstanceAt(partySlot, slot.ID, instanceID, member.ClassID, member.Level, g.gd); err != nil {
				continue
			}
			before := g.inv.ResolveEffectiveStats(member, partySlot, g.gd).Values()
			after := working.ResolveEffectiveStats(member, partySlot, g.gd).Values()
			options = append(options, BattleEquipOptionState{
				PartySlot: partySlot, CharacterName: member.Name,
				ClassName:     g.partyClassName(member.ClassID, member.Promoted),
				EquipmentSlot: slot.ID, EquipmentSlotName: slot.Name,
				CurrentItemName: g.equippedItemName(g.inv.Equipment[partySlot].Equipped(slot.ID)),
				Before:          before, After: after, Deltas: statDeltas(before, after),
			})
		}
	}
	return options
}

func (g *Game) partyClassName(classID string, promoted bool) string {
	class := g.gd.ClassByID(classID)
	if class == nil {
		return classID
	}
	if promoted && class.PromotedName != "" {
		return class.PromotedName
	}
	return class.Name
}

func (g *Game) equippedItemName(ref inventory.EquippedItemRef) string {
	if ref.InstanceID != "" {
		if resolved, err := inventory.ResolveInstance(g.inv.Instance(ref.InstanceID), g.gd); err == nil {
			return resolved.Name
		}
	}
	if base := g.gd.EquipmentBaseByID(ref.ItemID); base != nil {
		return base.Name
	}
	return ""
}

// ResolveBattleLoot records a Keep decision or equips the exact rolled
// instance from the receipt. Identical retries are idempotent; a conflicting
// second decision is rejected.
func (g *Game) ResolveBattleLoot(req BattleLootDecisionRequest) (*GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.phase == "combat" || g.phase == "defeat" || g.phase == "promotion" {
		return nil, fmt.Errorf("battle loot can only be resolved after victory")
	}
	if req.InstanceID == "" {
		return nil, fmt.Errorf("instance_id is required")
	}
	if req.Action != "keep" && req.Action != "equip" {
		return nil, fmt.Errorf("action must be keep or equip")
	}
	var receipt *battleDropReceipt
	if g.battleRewards != nil {
		for i := range g.battleRewards.Drops {
			candidate := &g.battleRewards.Drops[i]
			if candidate.Kind == "equipment" && candidate.InstanceID == req.InstanceID {
				receipt = candidate
				break
			}
		}
	}
	if receipt == nil {
		return nil, fmt.Errorf("equipment is not pending from the latest battle")
	}
	if receipt.Decision != battleLootPending {
		sameKeep := receipt.Decision == battleLootKept && req.Action == "keep"
		sameEquip := receipt.Decision == battleLootEquipped && req.Action == "equip" &&
			receipt.EquippedPartySlot == req.PartySlot && receipt.EquipmentSlot == req.EquipmentSlot
		if sameKeep || sameEquip {
			state := g.stateUnlocked()
			return &state, nil
		}
		return nil, fmt.Errorf("battle loot decision was already resolved as %s", receipt.Decision)
	}
	if req.Action == "keep" {
		receipt.Decision = battleLootKept
		state := g.stateUnlocked()
		return &state, nil
	}
	if req.PartySlot < 0 || req.PartySlot >= len(g.party) {
		return nil, fmt.Errorf("invalid party slot")
	}
	if req.EquipmentSlot == "" {
		return nil, fmt.Errorf("equipment_slot is required")
	}
	member := g.party[req.PartySlot]
	previous := g.inv.Equipment[req.PartySlot].Equipped(req.EquipmentSlot)
	if _, err := g.inv.EquipInstanceAt(req.PartySlot, req.EquipmentSlot, req.InstanceID, member.ClassID, member.Level, g.gd); err != nil {
		return nil, err
	}
	returnRecommendedStaticToInventory(g.inv, previous, g.gd)
	receipt.Decision = battleLootEquipped
	receipt.EquippedPartySlot = req.PartySlot
	receipt.EquipmentSlot = req.EquipmentSlot
	state := g.stateUnlocked()
	return &state, nil
}
