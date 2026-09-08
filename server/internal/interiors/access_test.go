package interiors

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestLibraryHas100DistinctAccessibleTemplates(t *testing.T) {
	r, err := LoadDir("../../../shared")
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Templates) != 100 {
		t.Fatalf("got %d templates, want 100", len(r.Templates))
	}
	for family, templates := range r.ByBuildingType {
		if len(templates) != 25 {
			t.Errorf("%s has %d templates, want 25", family, len(templates))
		}
	}
	seen := make(map[string]string)
	for _, template := range r.Templates {
		var floors []string
		for _, floor := range template.Floors {
			floors = append(floors, strings.Join(floor.Rows, "\n"))
		}
		key := strings.Join(floors, "\n---\n")
		if other := seen[key]; other != "" {
			t.Errorf("%s duplicates %s", template.ID, other)
		}
		seen[key] = template.ID
	}
	data, err := os.ReadFile("../../../shared/interior_library_design.json")
	if err != nil {
		t.Fatal(err)
	}
	var design struct {
		Originals []Template `json:"originals"`
	}
	if err := json.Unmarshal(data, &design); err != nil {
		t.Fatal(err)
	}
	for _, original := range design.Originals {
		current := r.ByID(original.BuildingType, original.ID)
		if current == nil {
			t.Fatalf("lost legacy template %s", original.ID)
		}
		identities := func(template *Template) map[int][]string {
			result := make(map[int][]string)
			for _, floor := range template.Floors {
				result[floor.FloorID] = nil
				for _, chest := range floor.ChestAnchors {
					result[floor.FloorID] = append(result[floor.FloorID], chest.ID)
				}
			}
			return result
		}
		if !reflect.DeepEqual(identities(&original), identities(current)) {
			t.Errorf("legacy floor/treasure identities changed for %s", original.ID)
		}
	}
}

func TestAccessRejectsUnreachableTreasure(t *testing.T) {
	template := Template{ID: "blocked", Floors: []Floor{{FloorID: 0, Width: 5, Height: 5,
		Rows:     []string{"WWWWW", "W...W", "WWWWW", "WW.WW", "WWDWW"},
		Entrance: &Entrance{X: 2, Y: 4}, ChestAnchors: []ChestAnchor{{ID: "treasure", X: 2, Y: 1}}}}}
	if err := template.validateAccess(); err == nil {
		t.Fatal("accepted sealed treasure chamber")
	}
}
