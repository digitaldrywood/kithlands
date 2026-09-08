package locality

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestFootbridgesShortenRiverDetours(t *testing.T) {
	const w, h = 100, 100
	tiles := blankTiles(w, h)
	for y := 2; y < h-2; y++ {
		for x := 45; x < 48; x++ {
			tiles[y][x] = int(TileRiver)
		}
	}
	// The original road crossing should remain, but cannot serve this whole river.
	for x := 45; x < 48; x++ {
		tiles[80][x] = int(TileBridge)
	}
	before := blankTiles(w, h)
	for y := range tiles {
		copy(before[y], tiles[y])
	}
	addRiverFootbridges(tiles, []MapSpawn{{X: 42, Y: 15}}, w, h)
	count := 0
	for y := 2; y < h-2; y++ {
		if tiles[y][45] == int(TileBridge) {
			count++
		}
		// Every pair of open banks must now have a reasonably nearby crossing.
		nearest := h
		for by := 2; by < h-2; by++ {
			if tiles[by][45] == int(TileBridge) && abs(by-y) < nearest {
				nearest = abs(by - y)
			}
		}
		if nearest*2+4 > maxRiverDetour {
			t.Fatalf("row %d still needs %d walking steps", y, nearest*2+4)
		}
	}
	if count < 3 || count > 6 {
		t.Fatalf("expected spaced crossings, got %d", count)
	}
	if tiles[15][45] != int(TileBridge) {
		t.Fatal("did not prioritize the settlement")
	}
	for y := range tiles {
		for x, v := range tiles[y] {
			if v != before[y][x] && (before[y][x] != int(TileRiver) || v != int(TileBridge)) {
				t.Fatalf("changed non-river at %d,%d", x, y)
			}
		}
	}
	once := blankTiles(w, h)
	for y := range tiles {
		copy(once[y], tiles[y])
	}
	addRiverFootbridges(tiles, []MapSpawn{{X: 42, Y: 15}}, w, h)
	if !reflect.DeepEqual(once, tiles) {
		t.Fatal("second pass added redundant bridges")
	}
}

func TestFootbridgesKeepTransportBarriers(t *testing.T) {
	for _, tt := range []struct {
		name    string
		tile    TileType
		width   int
		blocked bool
	}{
		{"lake", TileLake, 3, false}, {"open water", TileWater, 3, false}, {"wide river", TileRiver, 8, false}, {"blocked banks", TileRiver, 3, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			tiles := blankTiles(80, 80)
			for y := 0; y < 80; y++ {
				for x := 30; x < 30+tt.width; x++ {
					tiles[y][x] = int(tt.tile)
				}
				if tt.blocked {
					tiles[y][29] = int(TileForest)
				}
			}
			addRiverFootbridges(tiles, nil, 80, 80)
			for _, row := range tiles {
				for _, v := range row {
					if v == int(TileBridge) {
						t.Fatal("bridged a protected barrier")
					}
				}
			}
		})
	}
}

func TestFootbridgesReuseNearbyRoadCrossing(t *testing.T) {
	tiles := blankTiles(40, 40)
	for y := 2; y < 38; y++ {
		tiles[y][20] = int(TileRiver)
	}
	tiles[20][20] = int(TileBridge)
	addRiverFootbridges(tiles, nil, 40, 40)
	count := 0
	for _, row := range tiles {
		for _, v := range row {
			if v == int(TileBridge) {
				count++
			}
		}
	}
	if count != 1 {
		t.Fatalf("added redundant crossings: %d", count)
	}
}

func TestGeneratedFootbridgesDeterministicAndLegacyStable(t *testing.T) {
	loc := &Locality{Name: "tributary regression", Nodes: []Node{{ID: "home", Kind: NodePlace}}, WaterwaySegments: []Waterway{{Kind: "stream", Points: []struct{ X, Y float64 }{{.5, 0}, {.5, 1}}}}}
	old := GenerateTileMapBeforeFootbridges(loc, "home", nil)
	first := GenerateTileMap(loc, "home", nil)
	second := GenerateTileMap(loc, "home", nil)
	if !reflect.DeepEqual(first, second) {
		t.Fatal("generation is not deterministic")
	}
	if !reflect.DeepEqual(first.Spawns, old.Spawns) || first.PlayerX != old.PlayerX || first.PlayerY != old.PlayerY {
		t.Fatal("crossings moved existing locations")
	}
	changed := 0
	for y, row := range first.Tiles {
		for x, v := range row {
			if v != old.Tiles[y][x] {
				changed++
				if v != int(TileBridge) || old.Tiles[y][x] != int(TileRiver) {
					t.Fatal("legacy terrain changed beyond crossings")
				}
			}
		}
	}
	if changed == 0 {
		t.Fatal("fixture did not exercise extra crossings")
	}
}

// Exercise a branching network and the locality JSON boundary together.
func TestRiverNetworkVisualFixture(t *testing.T) {
	loc := &Locality{Name: "River junction", Nodes: []Node{{ID: "home", Name: "Riverbank Village", Kind: NodePlace}, {ID: "inn", Name: "Crossing Inn", Kind: NodeBusiness}},
		RoadSegments: []Road{seg("primary", 0, .75, 1, .75)},
	}
	for _, x := range []float64{.25, .5, .75} {
		loc.WaterwaySegments = append(loc.WaterwaySegments, Waterway{Kind: "stream", Points: []struct{ X, Y float64 }{{x, 0}, {x - .08, .35}, {x + .07, .6}, {x, 1}}})
	}
	loc.WaterwaySegments = append(loc.WaterwaySegments, Waterway{Kind: "river", Points: []struct{ X, Y float64 }{{0, .4}, {.5, .55}, {1, .45}}})
	before := GenerateTileMapBeforeFootbridges(loc, "home", nil)
	after := GenerateTileMap(loc, "home", nil)
	bridges := 0
	for y, row := range after.Tiles {
		for x, v := range row {
			if v == int(TileBridge) && before.Tiles[y][x] == int(TileRiver) {
				bridges++
			}
		}
	}
	if bridges < 6 {
		t.Fatalf("branching network has too few new crossing tiles: %d", bridges)
	}
	encoded, err := json.Marshal(loc)
	if err != nil {
		t.Fatal(err)
	}
	var restored Locality
	if err := json.Unmarshal(encoded, &restored); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(after, GenerateTileMap(&restored, "home", nil)) {
		t.Fatal("roads, waterways or crossings changed through JSON save/load")
	}
}
