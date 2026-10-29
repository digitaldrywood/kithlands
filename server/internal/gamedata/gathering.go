package gamedata

import "fmt"

type GatheringHabitat struct {
	SurfaceTile  int   `json:"surface_tile"`
	GroundTiles  []int `json:"ground_tiles"`
	NearTiles    []int `json:"near_tiles"`
	SearchRadius int   `json:"search_radius"`
	PatchRadius  int   `json:"patch_radius"`
}

type GatheringData struct {
	Habitats      map[string]GatheringHabitat `json:"habitats"`
	SpacingTiles  int                         `json:"spacing_tiles"`
	NodesPerRoute int                         `json:"nodes_per_route"`
	MaxRoutes     int                         `json:"max_routes"`
	Materials     []CraftMaterial             `json:"materials,omitempty"`
	Resources     []GatheringResource         `json:"resources"`
	Recipes       []FieldRecipe               `json:"recipes"`
}
type CraftMaterial struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Visual   string `json:"visual"`
	Source   string `json:"source"`
	BuyPrice int    `json:"buy_price,omitempty"`
}

func (gd *GameData) CraftMaterialByID(id string) *CraftMaterial {
	for _, m := range gd.Gathering.Materials {
		if m.ID == id {
			return &m
		}
	}
	for _, r := range gd.Gathering.Resources {
		if r.MaterialID == id {
			return &CraftMaterial{ID: id, Name: r.MaterialName, Visual: r.Visual, Source: r.Source}
		}
	}
	return nil
}

type GatheringResource struct {
	RespawnSeconds int    `json:"respawn_seconds"`
	Habitat        string `json:"habitat"`
	Placement      string `json:"placement,omitempty"`
	MaxPerMap      int    `json:"max_per_map,omitempty"`
	RequiredLevel  int    `json:"required_level,omitempty"`
	Source         string `json:"source"`
	ID             string `json:"id"`
	Name           string `json:"name"`
	MaterialID     string `json:"material_id"`
	MaterialName   string `json:"material_name"`
	Quantity       int    `json:"quantity"`
	Visual         string `json:"visual"`
}
type FieldIngredient struct {
	MaterialID string `json:"material_id"`
	Count      int    `json:"count"`
}
type FieldRecipe struct {
	RequiredLevel int               `json:"required_level,omitempty"`
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	Inputs        []FieldIngredient `json:"inputs"`
	OutputVisual  string            `json:"output_visual,omitempty"`
	OutputID      string            `json:"output_id"`
	OutputCount   int               `json:"output_count"`
	ItemLevel     int               `json:"item_level,omitempty"`
	Sockets       int               `json:"sockets,omitempty"`
	RarityID      string            `json:"rarity_id,omitempty"`
}

func (gd *GameData) ValidateGathering() error {
	cfg := gd.Gathering
	if cfg.SpacingTiles < 4 || cfg.SpacingTiles > 12 || cfg.NodesPerRoute < 1 || cfg.NodesPerRoute > 8 || cfg.MaxRoutes < 1 || cfg.MaxRoutes > 8 || len(cfg.Resources) == 0 {
		return fmt.Errorf("invalid gathering placement limits")
	}
	for id, h := range cfg.Habitats {
		if (id != "meadow" && id != "woodland" && id != "rocky") || len(h.GroundTiles) == 0 || len(h.NearTiles) == 0 || h.SurfaceTile != 0 && h.SurfaceTile != 9 && h.SurfaceTile != 11 || h.SearchRadius < 1 || h.SearchRadius > 24 || h.PatchRadius < 1 || h.PatchRadius > 3 {
			return fmt.Errorf("invalid gathering habitat %q", id)
		}
		for _, tiles := range [][]int{h.GroundTiles, h.NearTiles} {
			for _, t := range tiles {
				if t < 0 || t > 18 {
					return fmt.Errorf("invalid habitat terrain %q", id)
				}
			}
		}
	}
	primaryCount := 0
	materials, ids := map[string]bool{}, map[string]bool{}
	for _, r := range cfg.Resources {
		if r.ID == "" || ids[r.ID] || r.Name == "" || r.MaterialID == "" || materials[r.MaterialID] || r.MaterialName == "" || r.Quantity < 1 || r.Quantity > 20 || (r.Visual != "herb" && r.Visual != "mineral" && r.Visual != "wood") || (r.Placement != "" && r.Placement != "route_end") || r.MaxPerMap < 0 || r.MaxPerMap > 8 || r.RequiredLevel < 0 || r.RequiredLevel > 20 || r.Source == "" || r.RespawnSeconds < 60 || r.RespawnSeconds > 86400 || (r.Habitat != "meadow" && r.Habitat != "woodland" && r.Habitat != "rocky") {
			return fmt.Errorf("invalid gathering resource %q", r.ID)
		}
		if r.Placement == "" {
			primaryCount++
		}
		if _, ok := cfg.Habitats[r.Habitat]; !ok {
			return fmt.Errorf("missing habitat %q", r.Habitat)
		}
		ids[r.ID], materials[r.MaterialID] = true, true
	}
	if primaryCount == 0 {
		return fmt.Errorf("gathering needs primary resources")
	}
	for _, m := range cfg.Materials {
		if m.ID == "" || materials[m.ID] || m.Name == "" || m.Source == "" || (m.Visual != "wood" && m.Visual != "mineral" && m.Visual != "gem") || m.BuyPrice < 0 || m.BuyPrice > 1000 {
			return fmt.Errorf("invalid crafting material %q", m.ID)
		}
		materials[m.ID] = true
	}
	ids = map[string]bool{}
	for _, r := range cfg.Recipes {
		if r.ID == "" || ids[r.ID] || r.Name == "" || r.Description == "" || len(r.Inputs) == 0 || r.OutputCount < 1 || r.OutputCount > 20 || r.RequiredLevel < 0 || r.RequiredLevel > 20 {
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
