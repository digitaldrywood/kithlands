package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
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
		Slot   int    `json:"slot"`    // party slot 0-3
		ItemID string `json:"item_id"` // weapon or armor ID
		Type   string `json:"type"`    // weapon, armor
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	err := game.EquipItem(req.Slot, req.ItemID, req.Type)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	state := game.State()
	jsonResp(w, state)
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
			ID:      w.ID,
			Name:    w.Name,
			Type:    "weapon",
			Price:   w.BuyPrice,
			Power:   w.Power,
			Classes: strings.Join(w.Classes, ", "),
		})
	}

	// Armor
	for _, a := range g.gd.Items.Armor {
		if a.Tier > maxTier {
			continue
		}
		items = append(items, ShopItemState{
			ID:      a.ID,
			Name:    a.Name,
			Type:    "armor",
			Price:   a.BuyPrice,
			Absorb:  a.Absorb,
			Classes: strings.Join(a.Classes, ", "),
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
					ID:    sp.ID,
					Name:  sp.Name,
					Type:  "spell",
					Price: sp.SpellLevel * 100,
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
	}
	return fmt.Errorf("unknown item: %s", itemID)
}

func (g *Game) EquipItem(slot int, itemID, itemType string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if slot < 0 || slot >= len(g.party) {
		return fmt.Errorf("invalid slot")
	}

	classID := g.party[slot].ClassID

	switch itemType {
	case "weapon":
		prev, err := g.inv.EquipWeapon(slot, itemID, classID, g.gd)
		if err != nil {
			return err
		}
		// Put previous weapon back in inventory
		if prev != "" {
			g.inv.Consumables["wpn_"+prev]++
		}
		// Remove new weapon from inventory
		key := "wpn_" + itemID
		if g.inv.Consumables[key] > 0 {
			g.inv.Consumables[key]--
			if g.inv.Consumables[key] == 0 {
				delete(g.inv.Consumables, key)
			}
		}
		return nil
	case "armor":
		prev, err := g.inv.EquipArmor(slot, itemID, classID, g.gd)
		if err != nil {
			return err
		}
		if prev != "" {
			g.inv.Consumables["arm_"+prev]++
		}
		key := "arm_" + itemID
		if g.inv.Consumables[key] > 0 {
			g.inv.Consumables[key]--
			if g.inv.Consumables[key] == 0 {
				delete(g.inv.Consumables, key)
			}
		}
		return nil
	}
	return fmt.Errorf("unknown equip type: %s", itemType)
}

func (g *Game) LearnSpell(charName, spellID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	spell := g.gd.SpellByID(spellID)
	if spell == nil {
		return fmt.Errorf("spell not found")
	}

	sb, ok := g.spellBooks[charName]
	if !ok {
		return fmt.Errorf("%s cannot learn spells", charName)
	}

	// Check if character's class can learn this spell school
	var ch *gamedata.Class
	for _, c := range g.party {
		if c.Name == charName {
			ch = g.gd.ClassByID(c.ClassID)
			break
		}
	}
	if ch == nil {
		return fmt.Errorf("character not found")
	}

	canLearn := false
	for _, school := range ch.Magic.Schools {
		if school == spell.School {
			canLearn = true
			break
		}
	}
	if !canLearn {
		return fmt.Errorf("%s cannot learn %s magic", charName, spell.School)
	}

	// Check spell level cap
	if spell.SpellLevel > ch.Magic.MaxSpellLevel {
		return fmt.Errorf("spell level %d exceeds max %d for %s", spell.SpellLevel, ch.Magic.MaxSpellLevel, ch.Name)
	}

	// Price: spell level * 100 gold
	price := spell.SpellLevel * 100
	if g.inv.Gold < price {
		return fmt.Errorf("need %d gold, have %d", price, g.inv.Gold)
	}

	err := sb.LearnSpell(spellID, spell.SpellLevel, g.gd.Spells.ChargeTable.MaxSpellsPerLvl)
	if err != nil {
		return err
	}

	g.inv.Gold -= price
	return nil
}
