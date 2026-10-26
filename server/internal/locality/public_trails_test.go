package locality

import (
	"reflect"
	"testing"
)

func trailFixture() (*Locality, *WalkResult, []MapSpawn, [][]int) {
	loc := &Locality{Source: "wizard", Nodes: []Node{{ID: "home"}, {ID: "inn"}, {ID: "neighbor"}, {ID: "discovery"}}, Edges: []Edge{{From: "home", To: "inn"}, {From: "inn", To: "neighbor"}, {From: "neighbor", To: "discovery"}}}
	walk := Walk(loc, "home")
	spawns := []MapSpawn{{NodeID: "home", X: 5, Y: 5}, {NodeID: "inn", X: 35, Y: 5}, {NodeID: "neighbor", X: 35, Y: 25}, {NodeID: "discovery", X: 5, Y: 25}}
	tiles := make([][]int, 35)
	for y := range tiles {
		tiles[y] = make([]int, 50)
		tiles[y][20] = int(TileForest)
	}
	for x := range tiles[15] {
		tiles[15][x] = int(TileRiver)
	}
	tiles[15][35] = int(TileBridge)
	return loc, walk, spawns, tiles
}

func TestPublicTrailsConnectCloseNodesWithoutChangingBarriersOrDiscoveries(t *testing.T) {
	t.Parallel()
	loc, walk, spawns, tiles := trailFixture()
	hidden := &HiddenPathInfo{Tiles: [][2]int{{10, 10}, {10, 11}}}
	tiles[10][10], tiles[11][10] = int(TileDarkGrass), int(TileDarkGrass)
	addPublicTrails(tiles, loc, walk, spawns, hidden, 50, 35)
	// Follow only public path/bridge cells from home: every close approach must
	// belong to one continuous network, including across the existing bridge.
	queue := [][2]int{{5, 7}}
	seen := map[[2]int]bool{queue[0]: true}
	for i := 0; i < len(queue); i++ {
		p := queue[i]
		for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			n := [2]int{p[0] + d[0], p[1] + d[1]}
			if n[0] < 0 || n[0] >= 50 || n[1] < 0 || n[1] >= 35 || seen[n] {
				continue
			}
			v := TileType(tiles[n[1]][n[0]])
			if v == TilePath || v == TileBridge {
				seen[n] = true
				queue = append(queue, n)
			}
		}
	}
	for _, p := range [][2]int{{35, 7}, {35, 27}} {
		if !seen[p] {
			t.Errorf("close approach %v has no connected public trail", p)
		}
	}
	if tiles[7][20] != int(TilePath) {
		t.Fatal("forest crossing has no visible clearing")
	}
	for x, v := range tiles[15] {
		want := int(TileRiver)
		if x == 35 {
			want = int(TileBridge)
		}
		if v != want {
			t.Fatalf("changed water/bridge at x=%d: %d", x, v)
		}
	}
	for _, p := range hidden.Tiles {
		if tiles[p[1]][p[0]] != int(TileDarkGrass) {
			t.Fatal("exposed hidden shortcut")
		}
	}
	for y := 21; y <= 29; y++ {
		for x := 1; x <= 9; x++ {
			if tiles[y][x] == int(TilePath) {
				t.Fatal("road enters distant discovery area")
			}
		}
	}
}

func TestPublicTrailsPreserveImportedRoads(t *testing.T) {
	t.Parallel()
	for _, source := range []string{"osm", "hybrid"} {
		t.Run(source, func(t *testing.T) {
			loc, walk, spawns, tiles := trailFixture()
			loc.Source = source
			if source == "hybrid" {
				loc.RoadSegments = []Road{{Class: "primary"}}
			}
			before := make([][]int, len(tiles))
			for y := range tiles {
				before[y] = append([]int(nil), tiles[y]...)
			}
			addPublicTrails(tiles, loc, walk, spawns, nil, 50, 35)
			if !reflect.DeepEqual(before, tiles) {
				t.Fatal("public trail changed surveyed road terrain")
			}
		})
	}
}

func TestPublicTrailMapPreservesLegacyLandmarksAndWalkableTiles(t *testing.T) {
	t.Parallel()
	loc := BuildFromWizard(WizardInput{TownName: "Cadott", People: []WizardPerson{{Name: "Alice", Relation: "friend"}, {Name: "Bob", Relation: "friend"}}, Places: []string{"Square"}, BigBuilding: "Keep", Flavor: "medieval", Difficulty: "normal"})
	walk := Walk(loc, "central")
	old := GenerateTileMapBeforePublicTrails(loc, "central", walk)
	current := GenerateTileMap(loc, "central", walk)
	if !reflect.DeepEqual(old.Spawns, current.Spawns) || old.PlayerX != current.PlayerX || old.PlayerY != current.PlayerY || !reflect.DeepEqual(old.HiddenPath, current.HiddenPath) {
		t.Fatal("public trails moved landmarks, spawn or shortcut")
	}
	changed := 0
	for y, row := range old.Tiles {
		for x, v := range row {
			if v == current.Tiles[y][x] {
				continue
			}
			changed++
			if current.Tiles[y][x] != int(TilePath) || tileCost(TileType(v)) < 0 {
				t.Fatalf("unexpected migration at %d,%d: %d -> %d", x, y, v, current.Tiles[y][x])
			}
		}
	}
	if changed < 20 {
		t.Fatalf("fixture has only %d new trail tiles", changed)
	}
	if !reflect.DeepEqual(current, GenerateTileMap(loc, "central", walk)) {
		t.Fatal("public routes are not deterministic")
	}
}

func BenchmarkPublicTrailMap(b *testing.B) {
	loc := BuildFromWizard(WizardInput{TownName: "Cadott", People: []WizardPerson{{Name: "Alice", Relation: "friend"}, {Name: "Bob", Relation: "friend"}}, Places: []string{"Square"}, BigBuilding: "Keep", Flavor: "medieval", Difficulty: "normal"})
	walk := Walk(loc, "central")
	for _, version := range []string{"before", "public"} {
		b.Run(version, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				if version == "before" {
					GenerateTileMapBeforePublicTrails(loc, "central", walk)
				} else {
					GenerateTileMap(loc, "central", walk)
				}
			}
		})
	}
}
