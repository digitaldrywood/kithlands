package api

import "github.com/digitaldrywood/kithlands/internal/inventory"

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
