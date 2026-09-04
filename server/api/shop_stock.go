package api

import (
	"fmt"
	"hash/fnv"
	"slices"
	"strconv"

	"github.com/digitaldrywood/kithlands/internal/inventory"
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
