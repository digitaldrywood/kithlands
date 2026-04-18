package interiors

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

type Registry struct {
	Templates      []*Template
	ByBuildingType map[string][]*Template
}

type Template struct {
	ID           string  `json:"id"`
	BuildingType string  `json:"building_type"`
	MusicID      string  `json:"music_id,omitempty"`
	Floors       []Floor `json:"floors"`
}

type Floor struct {
	FloorID      int           `json:"floor_id"`
	Width        int           `json:"width"`
	Height       int           `json:"height"`
	Rows         []string      `json:"rows"`
	Entrance     *Entrance     `json:"entrance,omitempty"`
	Stairs       []Stair       `json:"stairs,omitempty"`
	ChestAnchors []ChestAnchor `json:"chest_anchors,omitempty"`
	NPCAnchors   []NPCAnchor   `json:"npc_anchors,omitempty"`
}

type Entrance struct {
	X    int    `json:"x"`
	Y    int    `json:"y"`
	From string `json:"from,omitempty"`
}

type Stair struct {
	X       int    `json:"x"`
	Y       int    `json:"y"`
	ToFloor int    `json:"to_floor"`
	ToX     int    `json:"to_x"`
	ToY     int    `json:"to_y"`
	Kind    string `json:"kind"`
}

type ChestAnchor struct {
	ID string `json:"id"`
	X  int    `json:"x"`
	Y  int    `json:"y"`
}

type NPCAnchor struct {
	Role string `json:"role"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
}

func LoadDir(sharedDir string) (*Registry, error) {
	dir := filepath.Join(sharedDir, "interiors")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return &Registry{ByBuildingType: map[string][]*Template{}}, nil
		}
		return nil, fmt.Errorf("reading interiors dir: %w", err)
	}

	registry := &Registry{
		ByBuildingType: make(map[string][]*Template),
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", entry.Name(), err)
		}

		var template Template
		if err := json.Unmarshal(data, &template); err != nil {
			return nil, fmt.Errorf("parsing %s: %w", entry.Name(), err)
		}
		if err := template.validate(); err != nil {
			return nil, fmt.Errorf("validating %s: %w", entry.Name(), err)
		}

		registry.Templates = append(registry.Templates, &template)
		registry.ByBuildingType[template.BuildingType] = append(
			registry.ByBuildingType[template.BuildingType],
			&template,
		)
	}

	sort.Slice(registry.Templates, func(i, j int) bool {
		return registry.Templates[i].ID < registry.Templates[j].ID
	})
	for buildingType := range registry.ByBuildingType {
		sort.Slice(registry.ByBuildingType[buildingType], func(i, j int) bool {
			return registry.ByBuildingType[buildingType][i].ID < registry.ByBuildingType[buildingType][j].ID
		})
	}

	return registry, nil
}

func (r *Registry) Pick(buildingType string, seed int64) *Template {
	if r == nil {
		return nil
	}
	templates := r.ByBuildingType[buildingType]
	if len(templates) == 0 {
		return nil
	}
	idx := int(seed % int64(len(templates)))
	if idx < 0 {
		idx += len(templates)
	}
	return templates[idx]
}

func (t *Template) validate() error {
	if t.ID == "" {
		return fmt.Errorf("template id required")
	}
	if t.BuildingType == "" {
		return fmt.Errorf("template %q missing building_type", t.ID)
	}
	if len(t.Floors) == 0 {
		return fmt.Errorf("template %q has no floors", t.ID)
	}

	chestIDs := make(map[string]bool)
	floorsByID := make(map[int]*Floor, len(t.Floors))
	for i := range t.Floors {
		floor := &t.Floors[i]
		if _, exists := floorsByID[floor.FloorID]; exists {
			return fmt.Errorf("template %q duplicates floor_id %d", t.ID, floor.FloorID)
		}
		floorsByID[floor.FloorID] = floor

		if floor.Width <= 0 || floor.Height <= 0 {
			return fmt.Errorf("template %q floor %d has invalid dimensions %dx%d", t.ID, floor.FloorID, floor.Width, floor.Height)
		}
		if len(floor.Rows) != floor.Height {
			return fmt.Errorf("template %q floor %d row count %d does not match height %d", t.ID, floor.FloorID, len(floor.Rows), floor.Height)
		}
		for y, row := range floor.Rows {
			if len(row) != floor.Width {
				return fmt.Errorf("template %q floor %d row %d length %d does not match width %d", t.ID, floor.FloorID, y, len(row), floor.Width)
			}
		}
		if floor.FloorID == 0 && floor.Entrance == nil {
			return fmt.Errorf("template %q floor 0 missing entrance", t.ID)
		}
		if floor.Entrance != nil && !withinBounds(floor.Entrance.X, floor.Entrance.Y, floor.Width, floor.Height) {
			return fmt.Errorf("template %q floor %d entrance out of bounds", t.ID, floor.FloorID)
		}

		for _, anchor := range floor.ChestAnchors {
			if anchor.ID == "" {
				return fmt.Errorf("template %q floor %d has chest anchor with empty id", t.ID, floor.FloorID)
			}
			if chestIDs[anchor.ID] {
				return fmt.Errorf("template %q repeats chest anchor id %q", t.ID, anchor.ID)
			}
			chestIDs[anchor.ID] = true
			if !withinBounds(anchor.X, anchor.Y, floor.Width, floor.Height) {
				return fmt.Errorf("template %q chest anchor %q out of bounds", t.ID, anchor.ID)
			}
		}

		for _, anchor := range floor.NPCAnchors {
			if anchor.Role == "" {
				return fmt.Errorf("template %q floor %d has npc anchor with empty role", t.ID, floor.FloorID)
			}
			if !withinBounds(anchor.X, anchor.Y, floor.Width, floor.Height) {
				return fmt.Errorf("template %q npc anchor %q out of bounds", t.ID, anchor.Role)
			}
		}
	}

	for _, floor := range t.Floors {
		for _, stair := range floor.Stairs {
			if !withinBounds(stair.X, stair.Y, floor.Width, floor.Height) {
				return fmt.Errorf("template %q floor %d stair out of bounds", t.ID, floor.FloorID)
			}
			target := floorsByID[stair.ToFloor]
			if target == nil {
				return fmt.Errorf("template %q floor %d stair targets missing floor %d", t.ID, floor.FloorID, stair.ToFloor)
			}
			if !withinBounds(stair.ToX, stair.ToY, target.Width, target.Height) {
				return fmt.Errorf("template %q floor %d stair target out of bounds", t.ID, floor.FloorID)
			}
		}
	}

	return nil
}

func withinBounds(x, y, width, height int) bool {
	return x >= 0 && x < width && y >= 0 && y < height
}
