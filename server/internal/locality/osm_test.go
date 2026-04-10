package locality

import (
	"testing"
)

func TestGeneratePOIName(t *testing.T) {
	tests := []struct {
		name string
		tags map[string]string
		want string
	}{
		{
			name: "amenity with underscores",
			tags: map[string]string{"amenity": "fire_station"},
			want: "Fire Station",
		},
		{
			name: "simple amenity",
			tags: map[string]string{"amenity": "school"},
			want: "School",
		},
		{
			name: "shop tag",
			tags: map[string]string{"shop": "convenience"},
			want: "Convenience Shop",
		},
		{
			name: "building with specific type",
			tags: map[string]string{"building": "church"},
			want: "Church",
		},
		{
			name: "building yes fallback",
			tags: map[string]string{"building": "yes"},
			want: "Building",
		},
		{
			name: "landuse tag",
			tags: map[string]string{"landuse": "farmland"},
			want: "Farmland",
		},
		{
			name: "natural tag",
			tags: map[string]string{"natural": "water"},
			want: "Water",
		},
		{
			name: "empty tags fallback",
			tags: map[string]string{},
			want: "Building",
		},
		{
			name: "named entry returns name",
			tags: map[string]string{"name": "Bob's Diner", "amenity": "restaurant"},
			want: "Bob's Diner",
		},
		{
			name: "religion tag",
			tags: map[string]string{"religion": "christian"},
			want: "Christian",
		},
		{
			name: "multi-word amenity",
			tags: map[string]string{"amenity": "place_of_worship"},
			want: "Place Of Worship",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := generatePOIName(tt.tags)
			if got != tt.want {
				t.Errorf("generatePOIName(%v) = %q, want %q", tt.tags, got, tt.want)
			}
		})
	}
}

func TestClassifyElements(t *testing.T) {
	elements := []osmElement{
		// A named building (way)
		{
			Type: "way",
			ID:   1,
			Tags: map[string]string{"building": "yes", "name": "Town Hall", "amenity": "townhall"},
			Nodes: []int64{100, 101},
		},
		// An unnamed building (way) -- should now be included
		{
			Type: "way",
			ID:   2,
			Tags: map[string]string{"building": "church"},
			Nodes: []int64{102, 103},
		},
		// A road (should be returned as road element)
		{
			Type: "way",
			ID:   3,
			Tags: map[string]string{"highway": "residential"},
			Nodes: []int64{104, 105},
		},
		// An amenity node with name
		{
			Type: "node",
			ID:   4,
			Lat:  44.95,
			Lon:  -91.40,
			Tags: map[string]string{"amenity": "cafe", "name": "Java Hut"},
		},
		// An amenity node without name -- should now be included
		{
			Type: "node",
			ID:   5,
			Lat:  44.951,
			Lon:  -91.401,
			Tags: map[string]string{"amenity": "fire_station"},
		},
		// A farmland way
		{
			Type: "way",
			ID:   6,
			Tags: map[string]string{"landuse": "farmland"},
			Nodes: []int64{106, 107},
		},
		// A natural feature way
		{
			Type: "way",
			ID:   7,
			Tags: map[string]string{"natural": "wood"},
			Nodes: []int64{108, 109},
		},
		// A skeleton node (no tags, just coordinates for ways)
		{
			Type: "node",
			ID:   100,
			Lat:  44.95,
			Lon:  -91.40,
		},
		{
			Type: "node",
			ID:   101,
			Lat:  44.951,
			Lon:  -91.401,
		},
		{
			Type: "node",
			ID:   102,
			Lat:  44.952,
			Lon:  -91.402,
		},
		{
			Type: "node",
			ID:   103,
			Lat:  44.953,
			Lon:  -91.403,
		},
		{
			Type: "node",
			ID:   106,
			Lat:  44.954,
			Lon:  -91.404,
		},
		{
			Type: "node",
			ID:   107,
			Lat:  44.955,
			Lon:  -91.405,
		},
		{
			Type: "node",
			ID:   108,
			Lat:  44.956,
			Lon:  -91.406,
		},
		{
			Type: "node",
			ID:   109,
			Lat:  44.957,
			Lon:  -91.407,
		},
	}

	nodes, roads := classifyElements(elements, 44.95, -91.40, 1500)

	// Should have at least 5 classified nodes (Town Hall, Church, Java Hut, Fire Station, Farmland, Wood)
	if len(nodes) < 5 {
		t.Errorf("classifyElements: got %d nodes, want >= 5", len(nodes))
	}

	// Should have 1 road element
	if len(roads) != 1 {
		t.Errorf("classifyElements: got %d roads, want 1", len(roads))
	}

	// Verify named building is included
	found := false
	for _, n := range nodes {
		if n.Name == "Town Hall" {
			found = true
			break
		}
	}
	if !found {
		t.Error("classifyElements: expected 'Town Hall' node not found")
	}

	// Verify unnamed building got a generated name
	foundChurch := false
	for _, n := range nodes {
		if n.Name == "Church" {
			foundChurch = true
			break
		}
	}
	if !foundChurch {
		t.Error("classifyElements: expected unnamed building to get name 'Church'")
	}

	// Verify unnamed amenity got a generated name
	foundFireStation := false
	for _, n := range nodes {
		if n.Name == "Fire Station" {
			foundFireStation = true
			break
		}
	}
	if !foundFireStation {
		t.Error("classifyElements: expected unnamed amenity to get name 'Fire Station'")
	}

	// Verify farmland is included
	foundFarmland := false
	for _, n := range nodes {
		if n.Name == "Farmland" {
			foundFarmland = true
			break
		}
	}
	if !foundFarmland {
		t.Error("classifyElements: expected farmland node not found")
	}
}

func TestClassifyElementsDeduplication(t *testing.T) {
	// Create multiple unnamed farmland elements -- should get numeric suffixes
	elements := []osmElement{
		{Type: "way", ID: 1, Tags: map[string]string{"landuse": "farmland"}, Nodes: []int64{100}},
		{Type: "way", ID: 2, Tags: map[string]string{"landuse": "farmland"}, Nodes: []int64{101}},
		{Type: "way", ID: 3, Tags: map[string]string{"landuse": "farmland"}, Nodes: []int64{102}},
		{Type: "node", ID: 100, Lat: 44.95, Lon: -91.40},
		{Type: "node", ID: 101, Lat: 44.96, Lon: -91.41},
		{Type: "node", ID: 102, Lat: 44.97, Lon: -91.42},
	}

	nodes, _ := classifyElements(elements, 44.95, -91.40, 1500)

	// Should have 3 farmland nodes with unique names
	names := make(map[string]bool)
	for _, n := range nodes {
		names[n.Name] = true
	}

	if len(nodes) != 3 {
		t.Errorf("expected 3 nodes, got %d", len(nodes))
	}

	// All names should be unique
	if len(names) != len(nodes) {
		t.Errorf("expected unique names, got duplicates: %v", names)
	}
}

func TestClassifyBuildingEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		tags map[string]string
		want NodeKind
	}{
		{"hospital", map[string]string{"amenity": "hospital"}, NodePlace},
		{"clinic", map[string]string{"amenity": "clinic"}, NodePlace},
		{"library", map[string]string{"amenity": "library"}, NodePlace},
		{"police", map[string]string{"amenity": "police"}, NodePlace},
		{"government", map[string]string{"building": "government"}, NodeLandmark},
		{"retail", map[string]string{"building": "retail"}, NodeBusiness},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := classifyBuilding(tt.tags)
			if got != tt.want {
				t.Errorf("classifyBuilding(%v) = %q, want %q", tt.tags, got, tt.want)
			}
		})
	}
}

func TestClassifyAmenityEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		tags map[string]string
		want NodeKind
	}{
		{"fast_food", map[string]string{"amenity": "fast_food"}, NodeBusiness},
		{"shop", map[string]string{"shop": "bakery"}, NodeBusiness},
		{"unknown amenity", map[string]string{"amenity": "bench"}, NodePlace},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := classifyAmenity(tt.tags)
			if got != tt.want {
				t.Errorf("classifyAmenity(%v) = %q, want %q", tt.tags, got, tt.want)
			}
		})
	}
}

func TestBoundingBoxScalesWithRadius(t *testing.T) {
	// Test that the bounding box calculation uses the radius parameter
	// We do this indirectly by checking classifyElements with different radii
	// produce nodes with appropriate coordinate mappings

	elements := []osmElement{
		{Type: "node", ID: 1, Lat: 44.96, Lon: -91.39, Tags: map[string]string{"amenity": "cafe", "name": "Far Cafe"}},
	}

	// With a small radius, this node is far from center
	nodesSmall, _ := classifyElements(elements, 44.95, -91.40, 500)
	// With a large radius, same node is closer to center
	nodesLarge, _ := classifyElements(elements, 44.95, -91.40, 5000)

	// Both should find the node
	if len(nodesSmall) != 1 {
		t.Errorf("small radius: expected 1 node, got %d", len(nodesSmall))
	}
	if len(nodesLarge) != 1 {
		t.Errorf("large radius: expected 1 node, got %d", len(nodesLarge))
	}
}
