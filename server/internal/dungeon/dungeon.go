// Package dungeon loads authored adventures and their Tiled maps. It contains
// navigation data and validation; the API owns player state and combat.
package dungeon

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/settlements"
)

type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}
type Reward struct {
	ItemID  string `json:"item_id,omitempty"`
	Count   int    `json:"count,omitempty"`
	Level   int    `json:"level,omitempty"`
	Sockets int    `json:"sockets,omitempty"`
	Gold    int    `json:"gold,omitempty"`
}
type Encounter struct {
	Monsters  []string `json:"monsters"`
	FullParty []string `json:"full_party,omitempty"`
	Level     int      `json:"level"`
	Boss      bool     `json:"boss,omitempty"`
}
type Action struct {
	ID          string     `json:"id"`
	Label       string     `json:"label"`
	Kind        string     `json:"kind"`
	Position    Point      `json:"position"`
	Destination string     `json:"destination,omitempty"`
	Arrival     Point      `json:"arrival,omitempty"`
	Requires    []string   `json:"requires,omitempty"`
	Reason      string     `json:"reason,omitempty"`
	Flag        string     `json:"flag,omitempty"`
	Text        string     `json:"text,omitempty"`
	Repeatable  bool       `json:"repeatable,omitempty"`
	Reward      *Reward    `json:"reward,omitempty"`
	Encounter   *Encounter `json:"encounter,omitempty"`
}
type VisualVariant struct {
	Requires string `json:"requires"`
	Image    string `json:"image"`
}

type Room struct {
	VisualVariants []VisualVariant  `json:"visual_variants,omitempty"`
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	Description    string           `json:"description"`
	MapFile        string           `json:"map_file"`
	Map            *settlements.Map `json:"-"`
	Actions        []Action         `json:"actions"`
}
type Objective struct {
	Until string `json:"until"`
	Text  string `json:"text"`
}
type Definition struct {
	ID            string      `json:"id"`
	Title         string      `json:"title"`
	EntryLabel    string      `json:"entry_label"`
	Description   string      `json:"description"`
	EntryRoom     string      `json:"entry_room"`
	EntryPosition Point       `json:"entry_position"`
	CompleteFlag  string      `json:"complete_flag"`
	ReturnText    string      `json:"return_text"`
	RetreatText   string      `json:"retreat_text"`
	DefeatText    string      `json:"defeat_text"`
	Payoff        Reward      `json:"payoff"`
	Objectives    []Objective `json:"objectives"`
	Rooms         []Room      `json:"rooms"`
}

func Load(sharedDir string) ([]Definition, error) {
	data, err := os.ReadFile(filepath.Join(sharedDir, "dungeons", "adventures.json"))
	if err != nil {
		return nil, fmt.Errorf("read adventures: %w", err)
	}
	var defs []Definition
	if err := json.Unmarshal(data, &defs); err != nil {
		return nil, fmt.Errorf("parse adventures: %w", err)
	}
	ids := map[string]bool{}
	for i := range defs {
		d := &defs[i]
		if ids[d.ID] || d.ID == "" {
			return nil, fmt.Errorf("duplicate or empty adventure id %q", d.ID)
		}
		ids[d.ID] = true
		for j := range d.Rooms {
			r := &d.Rooms[j]
			if filepath.Base(r.MapFile) != r.MapFile || !strings.HasSuffix(r.MapFile, ".json") {
				return nil, fmt.Errorf("invalid room map %q", r.MapFile)
			}
			b, err := os.ReadFile(filepath.Join(sharedDir, "dungeons", "maps", r.MapFile))
			if err != nil {
				return nil, err
			}
			r.Map = &settlements.Map{}
			if err := json.Unmarshal(b, r.Map); err != nil {
				return nil, fmt.Errorf("room %s: %w", r.ID, err)
			}
		}
		if err := d.Validate(); err != nil {
			return nil, fmt.Errorf("adventure %s: %w", d.ID, err)
		}
	}
	return defs, nil
}

func (d *Definition) Room(id string) *Room {
	for i := range d.Rooms {
		if d.Rooms[i].ID == id {
			return &d.Rooms[i]
		}
	}
	return nil
}

// Presentation selects art from authoritative persistent flags. It never
// mutates the shared base map or changes navigation geometry.
func (r *Room) Presentation(flags map[string]bool) *settlements.Map {
	for i := len(r.VisualVariants) - 1; i >= 0; i-- {
		v := r.VisualVariants[i]
		if flags[v.Requires] {
			result := *r.Map
			result.Layers = append([]settlements.Layer(nil), r.Map.Layers...)
			result.Layer("ground").Image = v.Image
			return &result
		}
	}
	return r.Map
}

func (r *Room) Action(id string) *Action {
	for i := range r.Actions {
		if r.Actions[i].ID == id {
			return &r.Actions[i]
		}
	}
	return nil
}
func (r *Room) Walkable(p Point) bool {
	m := r.Map
	if m == nil || p.X < 0 || p.Y < 0 || p.X >= m.Width || p.Y >= m.Height {
		return false
	}
	x, y := float64(p.X*m.TileWidth+m.TileWidth/2), float64(p.Y*m.TileHeight+m.TileHeight/2)
	if l := m.Layer("collision"); l != nil {
		for _, o := range l.Objects {
			if x >= o.X && x < o.X+o.Width && y >= o.Y && y < o.Y+o.Height {
				return false
			}
		}
	}
	return true
}

func (d *Definition) Validate() error {
	if d.Title == "" || d.EntryLabel == "" || d.Description == "" || len(d.Rooms) == 0 {
		return fmt.Errorf("title, entry label, description and rooms required")
	}
	roomIDs, actionIDs, flags := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for i := range d.Rooms {
		r := &d.Rooms[i]
		m := r.Map
		if r.ID == "" || roomIDs[r.ID] {
			return fmt.Errorf("duplicate or empty room %q", r.ID)
		}
		roomIDs[r.ID] = true
		if m == nil || m.Type != "map" || m.Orientation != "orthogonal" || m.Width < 1 || m.Height < 1 || m.Width > 100 || m.Height > 100 || m.TileWidth != 32 || m.TileHeight != 32 {
			return fmt.Errorf("room %s requires bounded orthogonal 32px map", r.ID)
		}
		names := []string{"ground", "terrain-detail", "roads-and-water", "structures", "props-below-player", "collision", "interactions", "npc-spawns", "player-spawns", "foreground", "lighting-and-atmosphere"}
		if len(m.Layers) != len(names) {
			return fmt.Errorf("room %s missing layer contract", r.ID)
		}
		for j, name := range names {
			if m.Layers[j].Name != name {
				return fmt.Errorf("room %s layer %d must be %s", r.ID, j, name)
			}
		}
		if m.Layer("ground").Image == "" {
			return fmt.Errorf("room %s has no art", r.ID)
		}
		for _, a := range r.Actions {
			if a.ID == "" || actionIDs[a.ID] || a.Label == "" {
				return fmt.Errorf("duplicate, empty, or unlabeled action %q", a.ID)
			}
			actionIDs[a.ID] = true
			if !r.Walkable(a.Position) {
				return fmt.Errorf("room %s action %s is blocked", r.ID, a.ID)
			}
			if (a.Kind == "treasure" || a.Kind == "encounter") && a.Repeatable {
				return fmt.Errorf("reward action %s cannot repeat", a.ID)
			}

			switch a.Kind {
			case "door", "exit", "hint", "switch", "treasure", "rest", "encounter":
			default:
				return fmt.Errorf("unknown action kind %q", a.Kind)
			}
			if a.Kind == "door" && a.Destination == "" {
				return fmt.Errorf("door %s needs destination", a.ID)
			}
			if a.Flag != "" {
				if flags[a.Flag] {
					return fmt.Errorf("duplicate flag producer %s", a.Flag)
				}
				flags[a.Flag] = true
			}
			if (a.Kind == "treasure" || a.Kind == "encounter" || a.Kind == "switch") && a.Flag == "" {
				return fmt.Errorf("action %s needs persistent flag", a.ID)
			}
			if a.Kind == "encounter" && (a.Encounter == nil || len(a.Encounter.Monsters) == 0 || a.Encounter.Level < 1) {
				return fmt.Errorf("action %s missing encounter", a.ID)
			}
			if a.Reward != nil && (a.Reward.Count < 0 || a.Reward.Gold < 0 || a.Reward.Sockets < 0) {
				return fmt.Errorf("action %s invalid reward", a.ID)
			}
		}
	}
	entry := d.Room(d.EntryRoom)
	if entry == nil || !entry.Walkable(d.EntryPosition) {
		return fmt.Errorf("invalid adventure entry")
	}
	for i := range d.Rooms {
		for _, v := range d.Rooms[i].VisualVariants {
			if !flags[v.Requires] || !strings.HasPrefix(v.Image, "/api/data/dungeons/art/") || filepath.Base(v.Image) == "." {
				return fmt.Errorf("room %s invalid visual variant", d.Rooms[i].ID)
			}
		}
		for _, a := range d.Rooms[i].Actions {
			if a.Kind == "door" {
				dest := d.Room(a.Destination)
				if dest == nil || !dest.Walkable(a.Arrival) {
					return fmt.Errorf("door %s has invalid arrival", a.ID)
				}
			}
			for _, f := range a.Requires {
				if !flags[f] {
					return fmt.Errorf("action %s requires unknown flag %s", a.ID, f)
				}
			}
		}
	}
	if d.CompleteFlag != "" && !flags[d.CompleteFlag] {
		return fmt.Errorf("unknown complete flag")
	}
	return nil
}
