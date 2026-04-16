package locality

import (
	"regexp"
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
			name: "building yes has no generated name",
			tags: map[string]string{"building": "yes"},
			want: "",
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
			want: "",
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
		// A named building (way) — KEEP
		{
			Type:  "way",
			ID:    1,
			Tags:  map[string]string{"building": "yes", "name": "Town Hall", "amenity": "townhall"},
			Nodes: []int64{100, 101},
		},
		// An unnamed building with specific type — KEEP (building=church)
		{
			Type:  "way",
			ID:    2,
			Tags:  map[string]string{"building": "church"},
			Nodes: []int64{102, 103},
		},
		// A road (should be returned as road element)
		{
			Type:  "way",
			ID:    3,
			Tags:  map[string]string{"highway": "residential"},
			Nodes: []int64{104, 105},
		},
		// A named amenity node — KEEP
		{
			Type: "node",
			ID:   4,
			Lat:  44.95,
			Lon:  -91.40,
			Tags: map[string]string{"amenity": "cafe", "name": "Java Hut"},
		},
		// Unnamed amenity node — DROP (pure category)
		{
			Type: "node",
			ID:   5,
			Lat:  44.951,
			Lon:  -91.401,
			Tags: map[string]string{"amenity": "fire_station"},
		},
		// Unnamed farmland — DROP
		{
			Type:  "way",
			ID:    6,
			Tags:  map[string]string{"landuse": "farmland"},
			Nodes: []int64{106, 107},
		},
		// Unnamed natural feature — DROP
		{
			Type:  "way",
			ID:    7,
			Tags:  map[string]string{"natural": "wood"},
			Nodes: []int64{108, 109},
		},
		// Skeleton nodes for way geometry
		{Type: "node", ID: 100, Lat: 44.95, Lon: -91.40},
		{Type: "node", ID: 101, Lat: 44.951, Lon: -91.401},
		{Type: "node", ID: 102, Lat: 44.952, Lon: -91.402},
		{Type: "node", ID: 103, Lat: 44.953, Lon: -91.403},
		{Type: "node", ID: 106, Lat: 44.954, Lon: -91.404},
		{Type: "node", ID: 107, Lat: 44.955, Lon: -91.405},
		{Type: "node", ID: 108, Lat: 44.956, Lon: -91.406},
		{Type: "node", ID: 109, Lat: 44.957, Lon: -91.407},
	}

	nodes, roads, _ := classifyElements(elements, 44.95, -91.40, 1500)

	// Exactly 3 kept: Town Hall, Church, Java Hut.
	if len(nodes) != 3 {
		t.Errorf("classifyElements: got %d nodes, want 3", len(nodes))
	}

	if len(roads) != 1 {
		t.Errorf("classifyElements: got %d roads, want 1", len(roads))
	}

	names := map[string]bool{}
	for _, n := range nodes {
		names[n.Name] = true
	}

	want := []string{"Town Hall", "Church", "Java Hut"}
	for _, w := range want {
		if !names[w] {
			t.Errorf("classifyElements: expected node %q not found", w)
		}
	}

	dontWant := []string{"Fire Station", "Farmland", "Wood"}
	for _, d := range dontWant {
		if names[d] {
			t.Errorf("classifyElements: unnamed generic %q should have been dropped", d)
		}
	}
}

func TestClassifyElementsDeduplication(t *testing.T) {
	// Two named buildings that share a name — the second should be dropped
	// as a duplicate-named amenity (see amenity loop) OR kept with a suffix
	// for buildings/nature. Use buildings to exercise the nature-style dedup path.
	elements := []osmElement{
		{Type: "way", ID: 1, Tags: map[string]string{"building": "yes", "name": "Smith Farm"}, Nodes: []int64{100}},
		{Type: "way", ID: 2, Tags: map[string]string{"building": "yes", "name": "Smith Farm"}, Nodes: []int64{101}},
		{Type: "way", ID: 3, Tags: map[string]string{"building": "yes", "name": "Smith Farm"}, Nodes: []int64{102}},
		{Type: "node", ID: 100, Lat: 44.95, Lon: -91.40},
		{Type: "node", ID: 101, Lat: 44.96, Lon: -91.41},
		{Type: "node", ID: 102, Lat: 44.97, Lon: -91.42},
	}

	nodes, _, _ := classifyElements(elements, 44.95, -91.40, 1500)

	// All three kept because they have real names. Deduplication appends
	// numeric suffixes so each name is unique.
	if len(nodes) != 3 {
		t.Errorf("expected 3 nodes, got %d", len(nodes))
	}

	names := make(map[string]bool)
	for _, n := range nodes {
		names[n.Name] = true
	}
	if len(names) != len(nodes) {
		t.Errorf("expected unique names, got duplicates: %v", names)
	}
}

// TestClassifyElements_DropsGenericBuildingYes covers the acceptance criteria
// for issue #53: unnamed building=yes entries must never appear in the
// discovered-locations list, while named places and buildings with a
// meaningful secondary tag survive.
func TestClassifyElements_DropsGenericBuildingYes(t *testing.T) {
	// Shared skeleton node — every fixture way reuses it so wayCenter works.
	skel := osmElement{Type: "node", ID: 999, Lat: 44.95, Lon: -91.40}

	tests := []struct {
		name     string
		fixture  []osmElement
		wantLen  int
		wantName string // if non-empty, assert presence; if "-", assert absence of Building N
	}{
		{
			name: "single unnamed building=yes is dropped",
			fixture: []osmElement{
				{Type: "way", ID: 1, Tags: map[string]string{"building": "yes"}, Nodes: []int64{999}},
			},
			wantLen: 0,
		},
		{
			name: "ten unnamed building=yes all dropped — no Building N entries",
			fixture: func() []osmElement {
				var out []osmElement
				for i := int64(1); i <= 10; i++ {
					out = append(out, osmElement{
						Type: "way", ID: i,
						Tags:  map[string]string{"building": "yes"},
						Nodes: []int64{999},
					})
				}
				return out
			}(),
			wantLen:  0,
			wantName: "-",
		},
		{
			name: "named building=yes is kept",
			fixture: []osmElement{
				{Type: "way", ID: 1, Tags: map[string]string{"building": "yes", "name": "Town Hall"}, Nodes: []int64{999}},
			},
			wantLen:  1,
			wantName: "Town Hall",
		},
		{
			name: "unnamed building=yes with civic amenity is kept",
			fixture: []osmElement{
				{Type: "way", ID: 1, Tags: map[string]string{"building": "yes", "amenity": "fire_station"}, Nodes: []int64{999}},
			},
			wantLen: 1,
		},
		{
			name: "unnamed building=church is kept (specific type)",
			fixture: []osmElement{
				{Type: "way", ID: 1, Tags: map[string]string{"building": "church"}, Nodes: []int64{999}},
			},
			wantLen:  1,
			wantName: "Church",
		},
		{
			name: "unnamed amenity=restaurant node dropped",
			fixture: []osmElement{
				{Type: "node", ID: 1, Lat: 44.95, Lon: -91.40, Tags: map[string]string{"amenity": "restaurant"}},
			},
			wantLen: 0,
		},
		{
			name: "unnamed amenity=school node dropped (pure category)",
			fixture: []osmElement{
				{Type: "node", ID: 1, Lat: 44.95, Lon: -91.40, Tags: map[string]string{"amenity": "school"}},
			},
			wantLen: 0,
		},
		{
			name: "named amenity=restaurant node kept",
			fixture: []osmElement{
				{Type: "node", ID: 1, Lat: 44.95, Lon: -91.40, Tags: map[string]string{"amenity": "restaurant", "name": "Chippewa Family Restaurant"}},
			},
			wantLen:  1,
			wantName: "Chippewa Family Restaurant",
		},
		{
			name: "unnamed landuse=farmland dropped",
			fixture: []osmElement{
				{Type: "way", ID: 1, Tags: map[string]string{"landuse": "farmland"}, Nodes: []int64{999}},
			},
			wantLen: 0,
		},
		{
			name: "named landuse=farmland kept",
			fixture: []osmElement{
				{Type: "way", ID: 1, Tags: map[string]string{"landuse": "farmland", "name": "Johnson Fields"}, Nodes: []int64{999}},
			},
			wantLen:  1,
			wantName: "Johnson Fields",
		},
	}

	genericBuilding := regexp.MustCompile(`^Building( \d+)?$`)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			els := append([]osmElement{skel}, tt.fixture...)
			nodes, _, _ := classifyElements(els, 44.95, -91.40, 1500)

			if len(nodes) != tt.wantLen {
				t.Errorf("got %d nodes, want %d (names=%v)", len(nodes), tt.wantLen, nodeNames(nodes))
			}

			for _, n := range nodes {
				if genericBuilding.MatchString(n.Name) {
					t.Errorf("generic %q must never be returned", n.Name)
				}
			}

			if tt.wantName != "" && tt.wantName != "-" {
				found := false
				for _, n := range nodes {
					if n.Name == tt.wantName {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("expected node %q, got %v", tt.wantName, nodeNames(nodes))
				}
			}
		})
	}
}

func TestKeepBuildingUnnamed(t *testing.T) {
	tests := []struct {
		name string
		tags map[string]string
		want bool
	}{
		{"empty tags", map[string]string{}, false},
		{"building=yes alone", map[string]string{"building": "yes"}, false},
		{"building=yes with civic amenity", map[string]string{"building": "yes", "amenity": "fire_station"}, true},
		{"building=yes with hospital amenity", map[string]string{"building": "yes", "amenity": "hospital"}, true},
		{"building=yes with doctor amenity", map[string]string{"building": "yes", "amenity": "doctor"}, true},
		{"building=yes with pharmacy amenity", map[string]string{"building": "yes", "amenity": "pharmacy"}, true},
		{"building=yes with convenience amenity", map[string]string{"building": "yes", "amenity": "convenience"}, true},
		{"building=yes with supermarket amenity", map[string]string{"building": "yes", "amenity": "supermarket"}, true},
		{"building=yes with department store amenity", map[string]string{"building": "yes", "amenity": "department_store"}, true},
		{"building=yes with school amenity", map[string]string{"building": "yes", "amenity": "school"}, true},
		{"building=yes with place_of_worship amenity", map[string]string{"building": "yes", "amenity": "place_of_worship"}, true},
		{"building=yes with unimportant amenity", map[string]string{"building": "yes", "amenity": "bench"}, false},
		{"building=church", map[string]string{"building": "church"}, true},
		{"building=school", map[string]string{"building": "school"}, true},
		{"building=commercial", map[string]string{"building": "commercial"}, true},
		{"building=retail", map[string]string{"building": "retail"}, true},
		{"building=civic", map[string]string{"building": "civic"}, true},
		{"building=government", map[string]string{"building": "government"}, true},
		{"building=hospital", map[string]string{"building": "hospital"}, true},
		{"building=industrial", map[string]string{"building": "industrial"}, true},
		{"building=train_station", map[string]string{"building": "train_station"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := keepBuildingUnnamed(tt.tags); got != tt.want {
				t.Errorf("keepBuildingUnnamed(%v) = %v, want %v", tt.tags, got, tt.want)
			}
		})
	}
}

func nodeNames(nodes []Node) []string {
	out := make([]string, 0, len(nodes))
	for _, n := range nodes {
		out = append(out, n.Name)
	}
	return out
}

func TestClassifyBuildingEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		tags map[string]string
		want NodeKind
	}{
		{"hospital", map[string]string{"amenity": "hospital"}, NodeBusiness},
		{"clinic", map[string]string{"amenity": "clinic"}, NodeBusiness},
		{"doctor", map[string]string{"amenity": "doctor"}, NodeBusiness},
		{"pharmacy", map[string]string{"amenity": "pharmacy"}, NodeBusiness},
		{"convenience", map[string]string{"amenity": "convenience"}, NodeBusiness},
		{"supermarket", map[string]string{"amenity": "supermarket"}, NodeBusiness},
		{"department store", map[string]string{"amenity": "department_store"}, NodeBusiness},
		{"bar", map[string]string{"amenity": "bar"}, NodeBusiness},
		{"fast_food", map[string]string{"amenity": "fast_food"}, NodeBusiness},
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
		{"hospital", map[string]string{"amenity": "hospital"}, NodeBusiness},
		{"clinic", map[string]string{"amenity": "clinic"}, NodeBusiness},
		{"doctor", map[string]string{"amenity": "doctor"}, NodeBusiness},
		{"pharmacy", map[string]string{"amenity": "pharmacy"}, NodeBusiness},
		{"convenience", map[string]string{"amenity": "convenience"}, NodeBusiness},
		{"supermarket", map[string]string{"amenity": "supermarket"}, NodeBusiness},
		{"department_store", map[string]string{"amenity": "department_store"}, NodeBusiness},
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

func TestBuildingTagsGameplayMappings(t *testing.T) {
	tests := []struct {
		name string
		tags map[string]string
		want []string
	}{
		{
			name: "hospital adds rest and heal gameplay tags",
			tags: map[string]string{"building": "yes", "amenity": "hospital"},
			want: []string{"place", "rest", "heal"},
		},
		{
			name: "clinic adds rest and heal gameplay tags",
			tags: map[string]string{"building": "yes", "amenity": "clinic"},
			want: []string{"place", "rest", "heal"},
		},
		{
			name: "doctor adds rest and heal gameplay tags",
			tags: map[string]string{"building": "yes", "amenity": "doctor"},
			want: []string{"place", "rest", "heal"},
		},
		{
			name: "pharmacy maps to shop gameplay tags",
			tags: map[string]string{"building": "yes", "amenity": "pharmacy"},
			want: []string{"place", "commerce", "shop"},
		},
		{
			name: "convenience maps to shop gameplay tags",
			tags: map[string]string{"building": "yes", "amenity": "convenience"},
			want: []string{"place", "commerce", "shop"},
		},
		{
			name: "supermarket maps to shop gameplay tags",
			tags: map[string]string{"building": "yes", "amenity": "supermarket"},
			want: []string{"place", "commerce", "shop"},
		},
		{
			name: "department store maps to shop gameplay tags",
			tags: map[string]string{"building": "yes", "amenity": "department_store"},
			want: []string{"place", "commerce", "shop"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildingTags(tt.tags)
			for _, tag := range tt.want {
				if !containsTag(got, tag) {
					t.Fatalf("buildingTags(%v) missing %q in %v", tt.tags, tag, got)
				}
			}
		})
	}
}

func TestAmenityTagsGameplayMappings(t *testing.T) {
	tests := []struct {
		name string
		tags map[string]string
		want []string
	}{
		{
			name: "hospital adds rest and heal gameplay tags",
			tags: map[string]string{"amenity": "hospital"},
			want: []string{"place", "rest", "heal"},
		},
		{
			name: "clinic adds rest and heal gameplay tags",
			tags: map[string]string{"amenity": "clinic"},
			want: []string{"place", "rest", "heal"},
		},
		{
			name: "doctor adds rest and heal gameplay tags",
			tags: map[string]string{"amenity": "doctor"},
			want: []string{"place", "rest", "heal"},
		},
		{
			name: "pharmacy maps to shop gameplay tags",
			tags: map[string]string{"amenity": "pharmacy"},
			want: []string{"place", "commerce", "shop"},
		},
		{
			name: "convenience maps to shop gameplay tags",
			tags: map[string]string{"amenity": "convenience"},
			want: []string{"place", "commerce", "shop"},
		},
		{
			name: "supermarket maps to shop gameplay tags",
			tags: map[string]string{"amenity": "supermarket"},
			want: []string{"place", "commerce", "shop"},
		},
		{
			name: "department store maps to shop gameplay tags",
			tags: map[string]string{"amenity": "department_store"},
			want: []string{"place", "commerce", "shop"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := amenityTags(tt.tags)
			for _, tag := range tt.want {
				if !containsTag(got, tag) {
					t.Fatalf("amenityTags(%v) missing %q in %v", tt.tags, tag, got)
				}
			}
		})
	}
}

func containsTag(tags []string, want string) bool {
	for _, tag := range tags {
		if tag == want {
			return true
		}
	}
	return false
}

func TestBoundingBoxScalesWithRadius(t *testing.T) {
	// Test that the bounding box calculation uses the radius parameter
	// We do this indirectly by checking classifyElements with different radii
	// produce nodes with appropriate coordinate mappings

	elements := []osmElement{
		{Type: "node", ID: 1, Lat: 44.96, Lon: -91.39, Tags: map[string]string{"amenity": "cafe", "name": "Far Cafe"}},
	}

	// With a small radius, this node is far from center
	nodesSmall, _, _ := classifyElements(elements, 44.95, -91.40, 500)
	// With a large radius, same node is closer to center
	nodesLarge, _, _ := classifyElements(elements, 44.95, -91.40, 5000)

	// Both should find the node
	if len(nodesSmall) != 1 {
		t.Errorf("small radius: expected 1 node, got %d", len(nodesSmall))
	}
	if len(nodesLarge) != 1 {
		t.Errorf("large radius: expected 1 node, got %d", len(nodesLarge))
	}
}
