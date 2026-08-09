// Package settlements loads the intentionally small Tiled JSON subset used by
// authored settlement exteriors. Phaser renders the resulting data, while Go
// validates and owns every location transition.
package settlements

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var requiredLayerOrder = []string{
	"ground", "terrain-detail", "roads-and-water", "structures",
	"props-below-player", "collision", "interactions", "npc-spawns",
	"player-spawns", "foreground", "lighting-and-atmosphere",
}

var reviewedNPCSprites = map[string]bool{
	"npc_elder": true,
	"npc_guard": true,
}

type Registry struct {
	Maps       []*Map
	ByID       map[string]*Map
	ByLocality map[string]*Map
}

// Map is the image-layer and object-layer subset of an orthogonal Tiled map.
type Map struct {
	Type        string     `json:"type"`
	Orientation string     `json:"orientation"`
	Width       int        `json:"width"`
	Height      int        `json:"height"`
	TileWidth   int        `json:"tilewidth"`
	TileHeight  int        `json:"tileheight"`
	Properties  []Property `json:"properties"`
	Layers      []Layer    `json:"layers"`
}

type Layer struct {
	ID      int      `json:"id"`
	Name    string   `json:"name"`
	Type    string   `json:"type"`
	Image   string   `json:"image,omitempty"`
	Objects []Object `json:"objects,omitempty"`
}

type Object struct {
	ID         int        `json:"id"`
	Name       string     `json:"name"`
	Type       string     `json:"type"`
	X          float64    `json:"x"`
	Y          float64    `json:"y"`
	Width      float64    `json:"width,omitempty"`
	Height     float64    `json:"height,omitempty"`
	Point      bool       `json:"point,omitempty"`
	Properties []Property `json:"properties,omitempty"`
}

type Property struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value string `json:"value"`
}

func LoadDir(sharedDir string) (*Registry, error) {
	dir := filepath.Join(sharedDir, "settlements")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading settlements dir: %w", err)
	}

	registry := &Registry{ByID: make(map[string]*Map), ByLocality: make(map[string]*Map)}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", entry.Name(), err)
		}
		var townMap Map
		if err := json.Unmarshal(data, &townMap); err != nil {
			return nil, fmt.Errorf("parsing %s: %w", entry.Name(), err)
		}
		if err := townMap.Validate(); err != nil {
			return nil, fmt.Errorf("validating %s: %w", entry.Name(), err)
		}
		id := townMap.Property("id")
		locality := normalizeLocality(townMap.Property("locality"))
		if registry.ByID[id] != nil {
			return nil, fmt.Errorf("duplicate settlement id %q", id)
		}
		if registry.ByLocality[locality] != nil {
			return nil, fmt.Errorf("duplicate settlement locality %q", locality)
		}
		registry.Maps = append(registry.Maps, &townMap)
		registry.ByID[id] = &townMap
		registry.ByLocality[locality] = &townMap
	}
	sort.Slice(registry.Maps, func(i, j int) bool {
		return registry.Maps[i].Property("id") < registry.Maps[j].Property("id")
	})
	if len(registry.Maps) == 0 {
		return nil, fmt.Errorf("no settlement maps found")
	}
	return registry, nil
}

func (r *Registry) ForLocality(name string) *Map {
	if r == nil {
		return nil
	}
	return r.ByLocality[normalizeLocality(name)]
}

func (m *Map) Property(name string) string {
	for _, property := range m.Properties {
		if property.Name == name {
			return property.Value
		}
	}
	return ""
}

func (m *Map) Layer(name string) *Layer {
	for i := range m.Layers {
		if m.Layers[i].Name == name {
			return &m.Layers[i]
		}
	}
	return nil
}

func (l *Layer) Object(name string) *Object {
	if l == nil {
		return nil
	}
	for i := range l.Objects {
		if l.Objects[i].Name == name {
			return &l.Objects[i]
		}
	}
	return nil
}

func (o *Object) Property(name string) string {
	if o == nil {
		return ""
	}
	for _, property := range o.Properties {
		if property.Name == name {
			return property.Value
		}
	}
	return ""
}

func (m *Map) Validate() error {
	if m.Type != "map" || m.Orientation != "orthogonal" {
		return fmt.Errorf("map must be an orthogonal Tiled map")
	}
	if m.Width <= 0 || m.Height <= 0 || m.TileWidth <= 0 || m.TileHeight <= 0 {
		return fmt.Errorf("map dimensions and tile size must be positive")
	}
	if m.Property("id") == "" || m.Property("locality") == "" || m.Property("kind") != "town" {
		return fmt.Errorf("map requires id, locality, and kind=town properties")
	}
	if len(m.Layers) != len(requiredLayerOrder) {
		return fmt.Errorf("map has %d layers, want %d", len(m.Layers), len(requiredLayerOrder))
	}
	for i, name := range requiredLayerOrder {
		layer := &m.Layers[i]
		if layer.Name != name {
			return fmt.Errorf("layer %d is %q, want %q", i, layer.Name, name)
		}
		wantType := "objectgroup"
		if name == "ground" {
			wantType = "imagelayer"
		}
		if layer.Type != wantType {
			return fmt.Errorf("layer %q has type %q, want %q", name, layer.Type, wantType)
		}
	}
	if m.Layer("ground").Image == "" {
		return fmt.Errorf("ground image required")
	}
	if err := m.validateStructures(); err != nil {
		return err
	}
	if err := m.validateRectangles("collision"); err != nil {
		return err
	}
	if err := m.validateTransitions(); err != nil {
		return err
	}
	return m.validateSpawns()
}

func (m *Map) validateStructures() error {
	required := map[string]bool{"shop": false, "inn": false, "house": false, "civic": false}
	for _, structure := range m.Layer("structures").Objects {
		if err := m.validateObjectBounds(structure, false); err != nil {
			return fmt.Errorf("structure %q: %w", structure.Name, err)
		}
		if _, ok := required[structure.Type]; ok {
			required[structure.Type] = true
		}
	}
	for role, found := range required {
		if !found {
			return fmt.Errorf("structures layer missing %s building", role)
		}
	}
	return nil
}

func (m *Map) validateRectangles(layerName string) error {
	layer := m.Layer(layerName)
	if len(layer.Objects) == 0 {
		return fmt.Errorf("%s layer is empty", layerName)
	}
	for _, object := range layer.Objects {
		if err := m.validateObjectBounds(object, false); err != nil {
			return fmt.Errorf("%s %q: %w", layerName, object.Name, err)
		}
	}
	return nil
}

func (m *Map) validateTransitions() error {
	seen := make(map[string]bool)
	hasWorldExit := false
	for _, object := range m.Layer("interactions").Objects {
		if object.Name == "" || seen[object.Name] {
			return fmt.Errorf("interaction names must be unique and non-empty")
		}
		seen[object.Name] = true
		if object.Type != "door" && object.Type != "exit" {
			return fmt.Errorf("interaction %q has unsupported type %q", object.Name, object.Type)
		}
		if err := m.validateObjectBounds(object, false); err != nil {
			return fmt.Errorf("interaction %q: %w", object.Name, err)
		}
		for _, property := range []string{"destination_id", "destination_kind", "display_name", "return_anchor"} {
			if object.Property(property) == "" {
				return fmt.Errorf("interaction %q missing %s", object.Name, property)
			}
		}
		if object.Type == "door" {
			if object.Property("destination_kind") != "interior" || object.Property("building_type") == "" || object.Property("tags") == "" {
				return fmt.Errorf("door %q requires interior destination, building_type, and tags", object.Name)
			}
		} else if object.Property("destination_kind") == "world" {
			hasWorldExit = true
		}
	}
	if !hasWorldExit {
		return fmt.Errorf("interactions layer missing world exit")
	}
	return nil
}

func (m *Map) validateSpawns() error {
	spawns := m.Layer("player-spawns")
	seen := make(map[string]bool, len(spawns.Objects))
	for _, spawn := range spawns.Objects {
		if spawn.Name == "" || seen[spawn.Name] {
			return fmt.Errorf("player spawn names must be unique and non-empty")
		}
		seen[spawn.Name] = true
		if err := m.validateObjectBounds(spawn, true); err != nil {
			return fmt.Errorf("player spawn %q: %w", spawn.Name, err)
		}
		if collision := m.collisionAt(spawn.X, spawn.Y); collision != nil {
			return fmt.Errorf("player spawn %q overlaps collision %q", spawn.Name, collision.Name)
		}
		direction := spawn.Property("direction")
		if direction != "up" && direction != "down" && direction != "left" && direction != "right" {
			return fmt.Errorf("player spawn %q has invalid direction %q", spawn.Name, direction)
		}
	}
	for _, interaction := range m.Layer("interactions").Objects {
		if !seen[interaction.Property("return_anchor")] {
			return fmt.Errorf("interaction %q references missing return anchor %q", interaction.Name, interaction.Property("return_anchor"))
		}
	}
	for _, npc := range m.Layer("npc-spawns").Objects {
		if err := m.validateObjectBounds(npc, true); err != nil {
			return fmt.Errorf("npc spawn %q: %w", npc.Name, err)
		}
		if collision := m.collisionAt(npc.X, npc.Y); collision != nil {
			return fmt.Errorf("npc spawn %q overlaps collision %q", npc.Name, collision.Name)
		}
		if npc.Property("role") == "" || npc.Property("sprite") == "" {
			return fmt.Errorf("npc spawn %q requires role and sprite", npc.Name)
		}
		if sprite := npc.Property("sprite"); !reviewedNPCSprites[sprite] {
			return fmt.Errorf("npc spawn %q uses unreviewed sprite %q", npc.Name, sprite)
		}
	}
	return nil
}

func (m *Map) collisionAt(x, y float64) *Object {
	collisions := m.Layer("collision")
	for i := range collisions.Objects {
		collision := &collisions.Objects[i]
		if x >= collision.X && x < collision.X+collision.Width && y >= collision.Y && y < collision.Y+collision.Height {
			return collision
		}
	}
	return nil
}

func (m *Map) validateObjectBounds(object Object, point bool) error {
	mapWidth := float64(m.Width * m.TileWidth)
	mapHeight := float64(m.Height * m.TileHeight)
	if object.X < 0 || object.Y < 0 || object.X >= mapWidth || object.Y >= mapHeight {
		return fmt.Errorf("origin is out of bounds")
	}
	if point {
		if !object.Point {
			return fmt.Errorf("must be a Tiled point object")
		}
		return nil
	}
	if object.Width <= 0 || object.Height <= 0 || object.X+object.Width > mapWidth || object.Y+object.Height > mapHeight {
		return fmt.Errorf("rectangle is out of bounds")
	}
	return nil
}

func normalizeLocality(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	if before, _, found := strings.Cut(name, ","); found {
		return strings.TrimSpace(before)
	}
	return name
}
