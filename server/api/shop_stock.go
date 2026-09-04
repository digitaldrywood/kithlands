package api

import (
	"fmt"
	"hash/fnv"
	"slices"
	"strconv"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/loot"
)

// ShopStock is the save-owned inventory first rolled when a shop is visited.
type ShopStock struct {
	Entries []ShopStockEntry `json:"entries"`
}

// ShopStockEntry keeps the authoritative price and, for expanded equipment,
// the exact rolled instance that will be transferred to the player.
type ShopStockEntry struct {
	ItemID   string                       `json:"item_id"`
	Type     string                       `json:"type"`
	Price    int                          `json:"price"`
	Version  uint64                       `json:"version,omitempty"`
	Reusable bool                         `json:"reusable,omitempty"`
	Sold     bool                         `json:"sold,omitempty"`
	Instance *inventory.EquipmentInstance `json:"instance,omitempty"`
}

func (g *Game) requireCurrentShopLocked(nodeID string) error {
	if g.phase != "world" && g.phase != "quest_complete" {
		return fmt.Errorf("shop purchases are unavailable during %s", g.phase)
	}
	if g.location.Kind != LocationInterior || g.location.Interior == nil {
		return fmt.Errorf("enter a shop before buying")
	}
	interior := g.location.Interior
	if nodeID == "" || g.location.MapID != nodeID || interior.NodeID != nodeID {
		return fmt.Errorf("current shop does not match %q", nodeID)
	}
	if interior.BuildingType != "shop" ||
		(!slices.Contains(interior.Tags, "shop") && !slices.Contains(interior.Tags, "commerce")) {
		return fmt.Errorf("current interior is not a shop")
	}
	return nil
}

func shopOfferID(nodeID string, index int, entry *ShopStockEntry) string {
	h := fnv.New64a()
	_, _ = h.Write([]byte(nodeID))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write([]byte(entry.Type))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write([]byte(entry.ItemID))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write([]byte(strconv.Itoa(index)))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write([]byte(strconv.FormatUint(entry.Version, 10)))
	return fmt.Sprintf("offer_%016x", h.Sum64())
}

func (g *Game) currentStockEntryLocked(nodeID, offerID string) (*ShopStockEntry, error) {
	stock := g.shopStocks[nodeID]
	if stock == nil {
		return nil, fmt.Errorf("shop stock is unavailable; reopen the shop")
	}
	for i := range stock.Entries {
		entry := &stock.Entries[i]
		if !entry.Sold && shopOfferID(nodeID, i, entry) == offerID {
			return entry, nil
		}
	}
	return nil, fmt.Errorf("shop offer is stale or already purchased")
}

func (g *Game) ensureShopStockLocked(nodeID string) (*ShopStock, error) {
	if stock := g.shopStocks[nodeID]; stock != nil {
		return stock, nil
	}
	if g.shopStocks == nil {
		g.shopStocks = make(map[string]*ShopStock)
	}
	avgLevel := 0
	for _, member := range g.party {
		avgLevel += member.Level
	}
	avgLevel /= max(len(g.party), 1)
	maxTier := min(1+avgLevel/4, 3)
	stock := &ShopStock{}
	add := func(itemID, itemType string, price int, reusable bool) {
		stock.Entries = append(stock.Entries, ShopStockEntry{
			ItemID: itemID, Type: itemType, Price: price, Version: 1, Reusable: reusable,
		})
	}
	for _, item := range g.gd.Items.Weapons {
		if item.Tier <= maxTier {
			add(item.ID, "weapon", item.BuyPrice, true)
		}
	}
	for _, item := range g.gd.Items.Armor {
		if item.Tier <= maxTier {
			add(item.ID, "armor", item.BuyPrice, true)
		}
	}
	for _, item := range g.gd.Items.Gear {
		if item.Tier > maxTier {
			continue
		}
		entryIndex := len(stock.Entries)
		rolled, err := loot.RollEquipment(
			g.gd, item.ID, g.maxPartyLevel(), 0,
			loot.RNGFor(g.rngSeed, shopStockStream(nodeID, entryIndex, item.ID)),
		)
		if err != nil {
			return nil, fmt.Errorf("rolling shop equipment %q: %w", item.ID, err)
		}
		rolled.ID = shopInstanceID(g.rngSeed, nodeID, entryIndex, item.ID)
		stock.Entries = append(stock.Entries, ShopStockEntry{
			ItemID: item.ID, Type: "equipment", Price: item.BuyPrice, Version: 1, Instance: &rolled,
		})
	}
	for _, item := range g.gd.Items.Consumables {
		add(item.ID, "consumable", item.BuyPrice, true)
	}
	for _, item := range g.gd.Items.KeyItems {
		if item.BuyPrice > 0 {
			add(item.ID, "key_item", item.BuyPrice, false)
		}
	}
	for _, spell := range g.gd.Spells.Spells {
		if spell.SpellLevel <= maxTier {
			add(spell.ID, "spell", spell.SpellLevel*100, true)
		}
	}
	g.shopStocks[nodeID] = stock
	return stock, nil
}

func shopStockStream(nodeID string, index int, itemID string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte("shop-stock\x00" + nodeID + "\x00" + strconv.Itoa(index) + "\x00" + itemID))
	return h.Sum64()
}

func shopInstanceID(saveSeed int64, nodeID string, index int, itemID string) string {
	h := fnv.New64a()
	_, _ = h.Write([]byte(strconv.FormatInt(saveSeed, 10) + "\x00" + nodeID + "\x00" + strconv.Itoa(index) + "\x00" + itemID))
	return fmt.Sprintf("gear_shop_%016x", h.Sum64())
}

func (g *Game) shopItemStateLocked(nodeID string, index int, entry *ShopStockEntry) (ShopItemState, error) {
	item := ShopItemState{
		StockID: shopOfferID(nodeID, index, entry), ID: entry.ItemID,
		Type: entry.Type, Price: entry.Price,
	}
	switch entry.Type {
	case "weapon":
		base := g.gd.WeaponByID(entry.ItemID)
		if base == nil {
			return ShopItemState{}, fmt.Errorf("shop weapon %q not found", entry.ItemID)
		}
		item.Name, item.IconKey = base.Name, base.IconKey
		item.Power, item.HitPct, item.CritPct, item.Element = base.Power, base.HitPct, base.CritPct, base.Element
		item.Classes, item.ClassIDs = formatShopClasses(base.Classes)
	case "armor":
		base := g.gd.ArmorByID(entry.ItemID)
		if base == nil {
			return ShopItemState{}, fmt.Errorf("shop armor %q not found", entry.ItemID)
		}
		item.Name, item.IconKey = base.Name, base.IconKey
		item.Absorb, item.MagicDefense, item.EvadePenalty, item.Element = base.Absorb, base.MagicDefense, base.EvadePenalty, base.ElementResist
		item.Classes, item.ClassIDs = formatShopClasses(base.Classes)
	case "equipment":
		if entry.Instance == nil {
			return ShopItemState{}, fmt.Errorf("shop equipment %q has no roll", entry.ItemID)
		}
		view, err := g.rolledItemState(entry.Instance.ID, entry.Instance)
		if err != nil {
			return ShopItemState{}, fmt.Errorf("resolving shop equipment %q: %w", entry.ItemID, err)
		}
		item.InstanceID, item.Name, item.IconKey = view.InstanceID, view.Name, view.IconKey
		item.Category, item.Stats, item.Rarity = view.Category, cloneStats(view.Stats), view.Rarity
		item.ItemLevel, item.RequiredLevel = view.ItemLevel, view.RequiredLevel
		item.Power, item.Absorb = view.Power, view.Absorb
		item.Affixes = append([]ItemAffixState(nil), view.Affixes...)
		item.Sockets = append([]ItemSocketState(nil), view.Sockets...)
		item.Classes, item.ClassIDs = formatShopClasses(view.AllowedClasses)
	case "consumable":
		base := g.findConsumable(entry.ItemID)
		if base == nil {
			return ShopItemState{}, fmt.Errorf("shop consumable %q not found", entry.ItemID)
		}
		item.Name = base.Name
	case "key_item":
		base := g.gd.KeyItemByID(entry.ItemID)
		if base == nil {
			return ShopItemState{}, fmt.Errorf("shop key item %q not found", entry.ItemID)
		}
		item.Name = base.Name
		item.Owned = g.inv.HasKeyItem(entry.ItemID)
	case "spell":
		base := g.gd.SpellByID(entry.ItemID)
		if base == nil {
			return ShopItemState{}, fmt.Errorf("shop spell %q not found", entry.ItemID)
		}
		item.Name, item.School, item.SpellLevel = base.Name, base.School, base.SpellLevel
		item.Learners = g.spellLearnersForShop(base.ID)
	default:
		return ShopItemState{}, fmt.Errorf("unsupported shop item type %q", entry.Type)
	}
	return item, nil
}

func formatShopClasses(classIDs []string) (string, []string) {
	copy := append([]string(nil), classIDs...)
	return strings.Join(copy, ", "), copy
}
