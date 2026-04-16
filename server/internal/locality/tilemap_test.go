package locality_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// TestBuildingTypeFromTags verifies that BuildingTypeFromTags maps tag sets
// to the correct building type string.
func TestBuildingTypeFromTags(t *testing.T) {
	tests := []struct {
		name string
		tags []string
		want string
	}{
		{name: "rest tag gives inn", tags: []string{"rest"}, want: "inn"},
		{name: "commerce+rest gives inn", tags: []string{"commerce", "rest"}, want: "inn"},
		{name: "shop tag gives shop", tags: []string{"shop"}, want: "shop"},
		{name: "commerce tag gives shop", tags: []string{"commerce"}, want: "shop"},
		{name: "temple tag gives temple", tags: []string{"temple"}, want: "temple"},
		{name: "revive tag gives temple", tags: []string{"revive"}, want: "temple"},
		{name: "no matching tags gives house", tags: []string{"wilderness", "danger"}, want: "house"},
		{name: "empty tags give house", tags: []string{}, want: "house"},
		{name: "nil tags give house", tags: nil, want: "house"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := locality.BuildingTypeFromTags(tt.tags)
			if got != tt.want {
				t.Errorf("BuildingTypeFromTags(%v) = %q, want %q", tt.tags, got, tt.want)
			}
		})
	}
}

// TestMapSpawnEnrichment verifies that GenerateTileMap populates BuildingType
// and InteriorSeed on spawns built from a wizard locality.
func TestMapSpawnEnrichment(t *testing.T) {
	input := locality.WizardInput{
		TownName:    "Testville",
		People:      []locality.WizardPerson{{Name: "Alice", Relation: "friendly"}},
		Places:      []string{"Town Square"},
		BigBuilding: "Castle Keep",
		Flavor:      "medieval",
		Difficulty:  "normal",
	}

	loc := locality.BuildFromWizard(input)
	tm := locality.GenerateTileMap(loc, "central", nil)

	// Build a lookup map from node ID to spawn.
	spawnByID := make(map[string]locality.MapSpawn, len(tm.Spawns))
	for _, s := range tm.Spawns {
		spawnByID[s.NodeID] = s
	}

	tests := []struct {
		name     string
		nodeID   string
		wantType string
	}{
		{name: "inn spawn", nodeID: "inn", wantType: "inn"},
		{name: "shop spawn", nodeID: "shop", wantType: "shop"},
		{name: "temple spawn", nodeID: "temple", wantType: "temple"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spawn, ok := spawnByID[tt.nodeID]
			if !ok {
				t.Fatalf("spawn with node_id %q not found in tilemap", tt.nodeID)
			}

			if spawn.BuildingType != tt.wantType {
				t.Errorf("spawn %q BuildingType = %q, want %q", tt.nodeID, spawn.BuildingType, tt.wantType)
			}

			if spawn.InteriorSeed == 0 {
				t.Errorf("spawn %q InteriorSeed should not be zero", tt.nodeID)
			}
		})
	}
}
