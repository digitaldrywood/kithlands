package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

func (s *Server) handleShop(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	nodeID := r.PathValue("nodeId")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	items, err := game.GetShopItems(nodeID)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, map[string]any{"shop_items": items})
}

func (s *Server) handleBuy(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req struct {
		NodeID  string `json:"node_id"`
		StockID string `json:"stock_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	err := game.BuyItem(req.NodeID, req.StockID)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	state := game.State()
	jsonResp(w, state)
}

func (s *Server) handleEquip(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req struct {
		Slot          int    `json:"slot"`           // party slot 0-3
		EquipmentSlot string `json:"equipment_slot"` // authored loadout slot; optional for legacy weapon/body calls
		ItemID        string `json:"item_id"`        // static base ID or rolled instance ID
		Type          string `json:"type"`           // weapon, armor, accessory
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	err := game.EquipItemAt(req.Slot, req.EquipmentSlot, req.ItemID, req.Type)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	state := game.State()
	jsonResp(w, state)
}

func (s *Server) handleUnequip(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req struct {
		Slot          int    `json:"slot"`
		EquipmentSlot string `json:"equipment_slot"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := game.UnequipItem(req.Slot, req.EquipmentSlot); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleLearnSpell(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req struct {
		NodeID   string `json:"node_id"`
		StockID  string `json:"stock_id"`
		CharName string `json:"char_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	err := game.LearnSpell(req.NodeID, req.StockID, req.CharName)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	state := game.State()
	jsonResp(w, state)
}

// GetShopItems returns the current save-owned offers for the active shop.
func (g *Game) GetShopItems(nodeID string) ([]ShopItemState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.requireCurrentShopLocked(nodeID); err != nil {
		return nil, err
	}
	stock, err := g.ensureShopStockLocked(nodeID)
	if err != nil {
		return nil, err
	}
	var items []ShopItemState
	for i := range stock.Entries {
		entry := &stock.Entries[i]
		if entry.Sold || (entry.Type == "key_item" && g.inv.HasKeyItem(entry.ItemID)) {
			continue
		}
		item, err := g.shopItemStateLocked(nodeID, i, entry)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (g *Game) BuyItem(nodeID, offerID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.requireCurrentShopLocked(nodeID); err != nil {
		return err
	}
	entry, err := g.currentStockEntryLocked(nodeID, offerID)
	if err != nil {
		return err
	}
	if entry.Type == "spell" {
		return fmt.Errorf("choose a party member to learn this spell")
	}
	working := g.inv.Clone()
	if working == nil {
		return fmt.Errorf("inventory is unavailable")
	}
	if working.Gold < entry.Price {
		return fmt.Errorf("need %d gold, have %d", entry.Price, working.Gold)
	}

	switch entry.Type {
	case "material":
		material := g.gd.CraftMaterialByID(entry.ItemID)
		if material == nil || material.BuyPrice <= 0 {
			return fmt.Errorf("unknown smithing supply")
		}
		working.Normalize()
		if working.Materials[entry.ItemID] >= int(^uint(0)>>1) {
			return fmt.Errorf("material pouch is full")
		}
		working.Materials[entry.ItemID]++
	case "consumable":
		if g.findConsumable(entry.ItemID) == nil {
			return fmt.Errorf("consumable not found: %s", entry.ItemID)
		}
		working.Consumables[entry.ItemID]++
	case "weapon":
		w := g.gd.WeaponByID(entry.ItemID)
		if w == nil {
			return fmt.Errorf("weapon not found")
		}
		working.Consumables["wpn_"+entry.ItemID]++
	case "armor":
		a := g.gd.ArmorByID(entry.ItemID)
		if a == nil {
			return fmt.Errorf("armor not found")
		}
		working.Consumables["arm_"+entry.ItemID]++
	case "equipment":
		if entry.Instance == nil || entry.Instance.BaseID != entry.ItemID {
			return fmt.Errorf("shop equipment %q is invalid", entry.ItemID)
		}
		if err := working.AddExactInstance(*entry.Instance); err != nil {
			return err
		}
	case "key_item":
		ki := g.gd.KeyItemByID(entry.ItemID)
		if ki == nil {
			return fmt.Errorf("key item not found: %s", entry.ItemID)
		}
		if working.HasKeyItem(entry.ItemID) {
			return fmt.Errorf("already own %s", ki.Name)
		}
		working.AddKeyItem(entry.ItemID)
	default:
		return fmt.Errorf("unknown shop item type: %s", entry.Type)
	}
	working.Gold -= entry.Price
	g.inv = working
	if entry.Reusable {
		entry.Version++
	} else {
		entry.Sold = true
	}
	return nil
}

func (g *Game) EquipItem(slot int, itemID, itemType string) error {
	return g.EquipItemAt(slot, "", itemID, itemType)
}

// EquipItemAt equips an item into an authored loadout slot. Legacy clients may
// omit equipmentSlot for weapons and body armor.
func (g *Game) EquipItemAt(slot int, equipmentSlot, itemID, itemType string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.checkEquipmentMutationLocked(); err != nil {
		return err
	}

	if slot < 0 || slot >= len(g.party) {
		return fmt.Errorf("invalid slot")
	}

	member := g.party[slot]
	if instance := g.inv.Instance(itemID); instance != nil {
		if instance.Kind != itemType {
			return fmt.Errorf("equipment %q is not %s", itemID, itemType)
		}
		if equipmentSlot == "" {
			base := g.gd.EquipmentBaseByID(instance.BaseID)
			if base == nil {
				return fmt.Errorf("invalid equipment base")
			}
			equipmentSlot = inventory.DefaultEquipmentSlot(base.Category)
		}
		previous := g.inv.Equipment[slot].Equipped(equipmentSlot)
		if _, err := g.inv.EquipInstanceAt(slot, equipmentSlot, itemID, member.ClassID, member.Level, g.gd); err != nil {
			return err
		}
		returnRecommendedStaticToInventory(g.inv, previous, g.gd)
		return nil
	}
	base := g.gd.EquipmentBaseByID(itemID)
	if base == nil || base.Kind != itemType {
		return fmt.Errorf("unknown equip type or item: %s", itemID)
	}
	if member.Level < base.RequiredLevel {
		return fmt.Errorf("level %d required to equip this item", base.RequiredLevel)
	}
	if equipmentSlot == "" {
		equipmentSlot = inventory.DefaultEquipmentSlot(base.Category)
	}
	return equipRecommendedStatic(g.inv, slot, equipmentSlot, recommendationCandidate{itemID: base.ID, category: base.Category, inventoryKey: equipmentStateID(base.Category, base.ID)}, member.ClassID, g.gd)
}

// UnequipItem returns a slot's static item to the legacy inventory map or
// simply clears a rolled instance reference; owned instances are never deleted.
func (g *Game) UnequipItem(slot int, equipmentSlot string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.checkEquipmentMutationLocked(); err != nil {
		return err
	}
	if slot < 0 || slot >= len(g.party) {
		return fmt.Errorf("invalid slot")
	}
	if equipmentSlot == "" {
		return fmt.Errorf("equipment_slot is required")
	}
	ref, err := g.inv.UnequipAt(slot, equipmentSlot, g.gd)
	if err != nil {
		return err
	}
	returnRecommendedStaticToInventory(g.inv, ref, g.gd)
	return nil
}

func (g *Game) LearnSpell(nodeID, offerID, charName string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.requireCurrentShopLocked(nodeID); err != nil {
		return err
	}
	entry, err := g.currentStockEntryLocked(nodeID, offerID)
	if err != nil {
		return err
	}
	if entry.Type != "spell" {
		return fmt.Errorf("shop offer is not a spell")
	}

	_, spell, sb, err := g.validateSpellLearningLocked(charName, entry.ItemID)
	if err != nil {
		return err
	}

	if g.inv.Gold < entry.Price {
		return fmt.Errorf("need %d gold, have %d", entry.Price, g.inv.Gold)
	}

	err = sb.LearnSpell(entry.ItemID, spell.SpellLevel, g.gd.Spells.ChargeTable.MaxSpellsPerLvl)
	if err != nil {
		return err
	}

	g.inv.Gold -= entry.Price
	entry.Version++
	return nil
}

func (g *Game) spellLearnersForShop(spellID string) []SpellLearnerState {
	learners := make([]SpellLearnerState, 0, len(g.party))
	for _, member := range g.party {
		if member == nil {
			continue
		}
		canLearn, reason := g.spellLearningStatusLocked(member.Name, spellID)
		learners = append(learners, SpellLearnerState{
			Name:     member.Name,
			CanLearn: canLearn,
			Reason:   reason,
		})
	}
	return learners
}

func (g *Game) validateSpellLearningLocked(charName, spellID string) (*character.Character, *gamedata.Spell, *magic.SpellBook, error) {
	spell := g.gd.SpellByID(spellID)
	if spell == nil {
		return nil, nil, nil, fmt.Errorf("spell not found")
	}

	caster := g.partyMemberByName(charName)
	if caster == nil {
		return nil, nil, nil, fmt.Errorf("character not found")
	}

	sb, ok := g.spellBooks[charName]
	if !ok {
		return nil, nil, nil, fmt.Errorf("%s cannot learn spells", charName)
	}

	if canLearn, reason := g.spellLearningStatusLocked(charName, spellID); !canLearn {
		switch reason {
		case "wrong class":
			return nil, nil, nil, fmt.Errorf("%s cannot learn %s magic", charName, spell.School)
		case "level too low":
			minLevel := g.minCharacterLevelForSpellLevel(spell.SpellLevel)
			return nil, nil, nil, fmt.Errorf("level too low: %s is level %d; level %d required for level %d spells", charName, caster.Level, minLevel, spell.SpellLevel)
		default:
			return nil, nil, nil, fmt.Errorf("%s", reason)
		}
	}

	return caster, spell, sb, nil
}

func (g *Game) spellLearningStatusLocked(charName, spellID string) (bool, string) {
	spell := g.gd.SpellByID(spellID)
	if spell == nil {
		return false, "spell not found"
	}

	member := g.partyMemberByName(charName)
	if member == nil {
		return false, "character not found"
	}

	sb, ok := g.spellBooks[charName]
	if !ok {
		return false, "wrong class"
	}

	class := g.gd.ClassByID(member.ClassID)
	if class == nil {
		return false, "wrong class"
	}
	if !slices.Contains(class.Magic.Schools, spell.School) || spell.SpellLevel > class.Magic.MaxSpellLevel {
		return false, "wrong class"
	}

	if member.Level < g.minCharacterLevelForSpellLevel(spell.SpellLevel) {
		return false, "level too low"
	}

	for _, known := range sb.KnownSpells[spell.SpellLevel] {
		if known == spellID {
			return false, "already known"
		}
	}
	if len(sb.KnownSpells[spell.SpellLevel]) >= g.gd.Spells.ChargeTable.MaxSpellsPerLvl {
		return false, "spell level full"
	}

	return true, ""
}

func (g *Game) partyMemberByName(name string) *character.Character {
	for _, member := range g.party {
		if member != nil && member.Name == name {
			return member
		}
	}
	return nil
}

func (g *Game) minCharacterLevelForSpellLevel(spellLevel int) int {
	if spellLevel <= 1 {
		return 1
	}

	minLevel := 0
	for levelKey, charges := range g.gd.Spells.ChargeTable.Table {
		level, err := strconv.Atoi(levelKey)
		if err != nil || spellLevel-1 >= len(charges) || charges[spellLevel-1] <= 0 {
			continue
		}
		if minLevel == 0 || level < minLevel {
			minLevel = level
		}
	}
	if minLevel == 0 {
		return 1
	}
	return minLevel
}
