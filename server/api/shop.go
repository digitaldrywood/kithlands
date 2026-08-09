package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"

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

	items := game.GetShopItems(nodeID)
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
		ItemID string `json:"item_id"`
		Type   string `json:"type"` // weapon, armor, consumable
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	err := game.BuyItem(req.ItemID, req.Type)
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
		SpellID  string `json:"spell_id"`
		CharName string `json:"char_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	err := game.LearnSpell(req.CharName, req.SpellID)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	state := game.State()
	jsonResp(w, state)
}

// GetShopItems returns available items for a shop node, scaled to party level.
func (g *Game) GetShopItems(nodeID string) []ShopItemState {
	g.mu.Lock()
	defer g.mu.Unlock()

	avgLevel := 0
	for _, c := range g.party {
		avgLevel += c.Level
	}
	avgLevel /= max(len(g.party), 1)

	// Max weapon/armor tier based on level
	maxTier := 1 + avgLevel/4
	if maxTier > 3 {
		maxTier = 3
	}

	var items []ShopItemState

	// Weapons
	for _, w := range g.gd.Items.Weapons {
		if w.Tier > maxTier {
			continue
		}
		items = append(items, ShopItemState{
			ID:       w.ID,
			Name:     w.Name,
			IconKey:  w.IconKey,
			Type:     "weapon",
			Price:    w.BuyPrice,
			Power:    w.Power,
			HitPct:   w.HitPct,
			CritPct:  w.CritPct,
			Element:  w.Element,
			Classes:  strings.Join(w.Classes, ", "),
			ClassIDs: append([]string(nil), w.Classes...),
		})
	}

	// Armor
	for _, a := range g.gd.Items.Armor {
		if a.Tier > maxTier {
			continue
		}
		items = append(items, ShopItemState{
			ID:           a.ID,
			Name:         a.Name,
			IconKey:      a.IconKey,
			Type:         "armor",
			Price:        a.BuyPrice,
			Absorb:       a.Absorb,
			MagicDefense: a.MagicDefense,
			EvadePenalty: a.EvadePenalty,
			Element:      a.ElementResist,
			Classes:      strings.Join(a.Classes, ", "),
			ClassIDs:     append([]string(nil), a.Classes...),
		})
	}

	// Expanded slots share the armor storefront but keep their authored
	// category so the client can compare against the correct paper-doll slot.
	for _, gear := range g.gd.Items.Gear {
		if gear.Tier > maxTier {
			continue
		}
		items = append(items, ShopItemState{
			ID:       gear.ID,
			Name:     gear.Name,
			IconKey:  gear.IconKey,
			Type:     "equipment",
			Category: gear.Category,
			Stats:    cloneStats(gear.Stats),
			Price:    gear.BuyPrice,
			Classes:  strings.Join(gear.Classes, ", "),
			ClassIDs: append([]string(nil), gear.Classes...),
		})
	}

	// Consumables
	for _, c := range g.gd.Items.Consumables {
		items = append(items, ShopItemState{
			ID:    c.ID,
			Name:  c.Name,
			Type:  "consumable",
			Price: c.BuyPrice,
		})
	}

	// Key items (skip items already owned)
	for _, ki := range g.gd.Items.KeyItems {
		if ki.BuyPrice > 0 && !g.inv.HasKeyItem(ki.ID) {
			items = append(items, ShopItemState{
				ID:    ki.ID,
				Name:  ki.Name,
				Type:  "key_item",
				Price: ki.BuyPrice,
			})
		}
	}

	// Spells (at magic shops)
	node := g.loc.NodeByID(nodeID)
	if node != nil {
		for _, tag := range node.Tags {
			if tag == "commerce" || tag == "rest" {
				// Regular shop, no spells
				break
			}
		}
		// All shops sell spells for now (demo cut)
		for _, sp := range g.gd.Spells.Spells {
			if sp.SpellLevel <= maxTier {
				items = append(items, ShopItemState{
					ID:         sp.ID,
					Name:       sp.Name,
					Type:       "spell",
					Price:      sp.SpellLevel * 100,
					School:     sp.School,
					SpellLevel: sp.SpellLevel,
					Learners:   g.spellLearnersForShop(sp.ID),
				})
			}
		}
	}

	return items
}

func (g *Game) BuyItem(itemID, itemType string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	switch itemType {
	case "consumable":
		for _, c := range g.gd.Items.Consumables {
			if c.ID == itemID {
				if g.inv.Gold < c.BuyPrice {
					return fmt.Errorf("need %d gold, have %d", c.BuyPrice, g.inv.Gold)
				}
				g.inv.Gold -= c.BuyPrice
				g.inv.Consumables[itemID]++
				return nil
			}
		}
	case "weapon":
		w := g.gd.WeaponByID(itemID)
		if w == nil {
			return fmt.Errorf("weapon not found")
		}
		if g.inv.Gold < w.BuyPrice {
			return fmt.Errorf("need %d gold, have %d", w.BuyPrice, g.inv.Gold)
		}
		g.inv.Gold -= w.BuyPrice
		// Store weapon in consumables as a simple inventory
		g.inv.Consumables["wpn_"+itemID]++
		return nil
	case "armor":
		a := g.gd.ArmorByID(itemID)
		if a == nil {
			return fmt.Errorf("armor not found")
		}
		if g.inv.Gold < a.BuyPrice {
			return fmt.Errorf("need %d gold, have %d", a.BuyPrice, g.inv.Gold)
		}
		g.inv.Gold -= a.BuyPrice
		g.inv.Consumables["arm_"+itemID]++
		return nil
	case "equipment":
		base := g.gd.EquipmentBaseByID(itemID)
		if base == nil || base.Category == "weapon" || base.Category == "armor" {
			return fmt.Errorf("expanded equipment not found: %s", itemID)
		}
		if g.inv.Gold < base.BuyPrice {
			return fmt.Errorf("need %d gold, have %d", base.BuyPrice, g.inv.Gold)
		}
		grant, err := g.grantLoot(itemID, g.maxPartyLevel(), 0)
		if err != nil {
			return err
		}
		if grant.InstanceID == "" {
			return fmt.Errorf("buying %q did not create equipment", itemID)
		}
		g.inv.Gold -= base.BuyPrice
		return nil
	case "key_item":
		ki := g.gd.KeyItemByID(itemID)
		if ki == nil {
			return fmt.Errorf("key item not found: %s", itemID)
		}
		if g.inv.HasKeyItem(itemID) {
			return fmt.Errorf("already own %s", ki.Name)
		}
		if g.inv.Gold < ki.BuyPrice {
			return fmt.Errorf("need %d gold, have %d", ki.BuyPrice, g.inv.Gold)
		}
		g.inv.Gold -= ki.BuyPrice
		g.inv.AddKeyItem(itemID)
		return nil
	}
	return fmt.Errorf("unknown item: %s", itemID)
}

func (g *Game) EquipItem(slot int, itemID, itemType string) error {
	return g.EquipItemAt(slot, "", itemID, itemType)
}

// EquipItemAt equips an item into an authored loadout slot. Legacy clients may
// omit equipmentSlot for weapons and body armor.
func (g *Game) EquipItemAt(slot int, equipmentSlot, itemID, itemType string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if slot < 0 || slot >= len(g.party) {
		return fmt.Errorf("invalid slot")
	}

	classID := g.party[slot].ClassID
	if instance := g.inv.Instance(itemID); instance != nil {
		if instance.Kind != itemType {
			return fmt.Errorf("equipment %q is not %s", itemID, itemType)
		}
		var previous inventory.EquipmentSlots
		var err error
		if equipmentSlot == "" {
			previous, err = g.inv.EquipInstance(slot, itemID, classID, g.party[slot].Level, g.gd)
		} else {
			previous, err = g.inv.EquipInstanceAt(slot, equipmentSlot, itemID, classID, g.party[slot].Level, g.gd)
		}
		if err != nil {
			return err
		}
		if itemType == "weapon" && previous.WeaponID != "" && previous.WeaponInstanceID == "" {
			g.inv.Consumables["wpn_"+previous.WeaponID]++
		}
		if itemType == "armor" && previous.ArmorID != "" && previous.ArmorInstanceID == "" {
			g.inv.Consumables["arm_"+previous.ArmorID]++
		}
		return nil
	}

	switch itemType {
	case "weapon":
		if equipmentSlot != "" && equipmentSlot != inventory.MainHandSlot {
			return fmt.Errorf("static weapons can only be equipped in %s", inventory.MainHandSlot)
		}
		key := "wpn_" + itemID
		if g.inv.Consumables[key] <= 0 {
			return fmt.Errorf("weapon %q not owned", itemID)
		}
		previous := g.inv.Equipment[slot]
		prev, err := g.inv.EquipWeapon(slot, itemID, classID, g.gd)
		if err != nil {
			return err
		}
		// Put previous weapon back in inventory
		if prev != "" && previous.WeaponInstanceID == "" {
			g.inv.Consumables["wpn_"+prev]++
		}
		// Remove new weapon from inventory
		g.inv.Consumables[key]--
		if g.inv.Consumables[key] == 0 {
			delete(g.inv.Consumables, key)
		}
		return nil
	case "armor":
		if equipmentSlot != "" && equipmentSlot != inventory.BodySlot {
			return fmt.Errorf("static armor can only be equipped in %s", inventory.BodySlot)
		}
		key := "arm_" + itemID
		if g.inv.Consumables[key] <= 0 {
			return fmt.Errorf("armor %q not owned", itemID)
		}
		previous := g.inv.Equipment[slot]
		prev, err := g.inv.EquipArmor(slot, itemID, classID, g.gd)
		if err != nil {
			return err
		}
		if prev != "" && previous.ArmorInstanceID == "" {
			g.inv.Consumables["arm_"+prev]++
		}
		g.inv.Consumables[key]--
		if g.inv.Consumables[key] == 0 {
			delete(g.inv.Consumables, key)
		}
		return nil
	}
	return fmt.Errorf("unknown equip type: %s", itemType)
}

// UnequipItem returns a slot's static item to the legacy inventory map or
// simply clears a rolled instance reference; owned instances are never deleted.
func (g *Game) UnequipItem(slot int, equipmentSlot string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
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
	if ref.InstanceID != "" {
		return nil
	}
	if base := g.gd.EquipmentBaseByID(ref.ItemID); base != nil {
		switch base.Category {
		case "weapon":
			g.inv.Consumables["wpn_"+base.ID]++
		case "armor":
			g.inv.Consumables["arm_"+base.ID]++
		}
	}
	return nil
}

func (g *Game) LearnSpell(charName, spellID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	_, spell, sb, err := g.validateSpellLearningLocked(charName, spellID)
	if err != nil {
		return err
	}

	price := spell.SpellLevel * 100
	if g.inv.Gold < price {
		return fmt.Errorf("need %d gold, have %d", price, g.inv.Gold)
	}

	err = sb.LearnSpell(spellID, spell.SpellLevel, g.gd.Spells.ChargeTable.MaxSpellsPerLvl)
	if err != nil {
		return err
	}

	g.inv.Gold -= price
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
