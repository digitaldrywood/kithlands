package gamedata

import "fmt"

type GatheringData struct {
	SpacingTiles  int                 `json:"spacing_tiles"`
	NodesPerRoute int                 `json:"nodes_per_route"`
	MaxRoutes     int                 `json:"max_routes"`
	Resources     []GatheringResource `json:"resources"`
	Recipes       []FieldRecipe       `json:"recipes"`
}
type GatheringResource struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	MaterialID   string `json:"material_id"`
	MaterialName string `json:"material_name"`
	Quantity     int    `json:"quantity"`
	Visual       string `json:"visual"`
}
type FieldIngredient struct {
	MaterialID string `json:"material_id"`
	Count      int    `json:"count"`
}
type FieldRecipe struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Description  string            `json:"description"`
	Inputs       []FieldIngredient `json:"inputs"`
	OutputVisual string            `json:"output_visual,omitempty"`
	OutputID     string            `json:"output_id"`
	OutputCount  int               `json:"output_count"`
	ItemLevel    int               `json:"item_level,omitempty"`
	Sockets      int               `json:"sockets,omitempty"`
	RarityID     string            `json:"rarity_id,omitempty"`
}

func (gd *GameData) ValidateGathering() error {
	cfg := gd.Gathering
	if cfg.SpacingTiles < 4 || cfg.SpacingTiles > 12 || cfg.NodesPerRoute < 1 || cfg.NodesPerRoute > 8 || cfg.MaxRoutes < 1 || cfg.MaxRoutes > 8 || len(cfg.Resources) == 0 {
		return fmt.Errorf("invalid gathering placement limits")
	}
	materials, ids := map[string]bool{}, map[string]bool{}
	for _, r := range cfg.Resources {
		if r.ID == "" || ids[r.ID] || r.Name == "" || r.MaterialID == "" || materials[r.MaterialID] || r.MaterialName == "" || r.Quantity < 1 || r.Quantity > 20 || (r.Visual != "herb" && r.Visual != "mineral") {
			return fmt.Errorf("invalid gathering resource %q", r.ID)
		}
		ids[r.ID], materials[r.MaterialID] = true, true
	}
	ids = map[string]bool{}
	for _, r := range cfg.Recipes {
		if r.ID == "" || ids[r.ID] || r.Name == "" || r.Description == "" || len(r.Inputs) == 0 || r.OutputCount < 1 || r.OutputCount > 20 {
			return fmt.Errorf("invalid field recipe %q", r.ID)
		}
		if r.OutputVisual != "" && r.OutputVisual != "potion" && r.OutputVisual != "gem" && r.OutputVisual != "sword" && r.OutputVisual != "shield" {
			return fmt.Errorf("invalid output visual in %q", r.ID)
		}
		ids[r.ID] = true
		seen := map[string]bool{}
		for _, input := range r.Inputs {
			if !materials[input.MaterialID] || seen[input.MaterialID] || input.Count < 1 || input.Count > 100 {
				return fmt.Errorf("invalid ingredient in %q", r.ID)
			}
			seen[input.MaterialID] = true
		}
		base := gd.EquipmentBaseByID(r.OutputID)
		if base == nil && gd.GemByID(r.OutputID) == nil && gd.ConsumableByID(r.OutputID) == nil {
			return fmt.Errorf("unknown output in %q", r.ID)
		}
		if base != nil {
			if r.OutputCount != 1 || r.ItemLevel < 1 || r.ItemLevel > 20 || r.Sockets < 0 || r.Sockets > 3 || gd.LootRarityByID(r.RarityID) == nil {
				return fmt.Errorf("invalid equipment output in %q", r.ID)
			}
		} else if r.ItemLevel != 0 || r.Sockets != 0 || r.RarityID != "" {
			return fmt.Errorf("non-equipment output has equipment fields in %q", r.ID)
		}
	}
	return nil
}
