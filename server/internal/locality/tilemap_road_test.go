package locality

import "testing"

// blankTiles returns a mapW x mapH grid filled with TileGrass.
func blankTiles(mapW, mapH int) [][]int {
	tiles := make([][]int, mapH)
	for y := range tiles {
		tiles[y] = make([]int, mapW)
	}
	return tiles
}

// countPathTiles returns the number of TilePath tiles in the grid.
func countPathTiles(tiles [][]int) int {
	n := 0
	for _, row := range tiles {
		for _, t := range row {
			if t == int(TilePath) {
				n++
			}
		}
	}
	return n
}

// seg builds a single two-point road between normalized 0-1 coordinates.
func seg(class string, x1, y1, x2, y2 float64) Road {
	return Road{
		Class: class,
		Points: []struct{ X, Y float64 }{
			{X: x1, Y: y1},
			{X: x2, Y: y2},
		},
	}
}

func TestRasterizeRoads_FiltersMinorRoadsByClass(t *testing.T) {
	const mapW, mapH = 200, 150

	// Urban mix: two majors, one residential, and a swarm of footways/service roads.
	mixed := []Road{
		seg("primary", 0.1, 0.5, 0.9, 0.5),
		seg("secondary", 0.5, 0.1, 0.5, 0.9),
		seg("residential", 0.2, 0.2, 0.8, 0.2),
		seg("footway", 0.1, 0.15, 0.9, 0.15),
		seg("footway", 0.1, 0.25, 0.9, 0.25),
		seg("footway", 0.1, 0.35, 0.9, 0.35),
		seg("footway", 0.1, 0.65, 0.9, 0.65),
		seg("footway", 0.1, 0.75, 0.9, 0.75),
		seg("service", 0.15, 0.4, 0.85, 0.4),
		seg("service", 0.15, 0.6, 0.85, 0.6),
		seg("path", 0.2, 0.85, 0.8, 0.85),
		seg("track", 0.3, 0.1, 0.7, 0.9),
	}

	filtered := blankTiles(mapW, mapH)
	rasterizeRoads(filtered, mixed, mapW, mapH)
	filteredCount := countPathTiles(filtered)

	// Baseline: pretend every road in the mix is primary so the filter cannot drop any of them.
	asPrimary := make([]Road, len(mixed))
	for i, r := range mixed {
		asPrimary[i] = Road{Class: "primary", Points: r.Points}
	}
	baseline := blankTiles(mapW, mapH)
	rasterizeRoads(baseline, asPrimary, mapW, mapH)
	baselineCount := countPathTiles(baseline)

	if filteredCount == 0 {
		t.Fatalf("major roads should still paint tiles, got 0")
	}
	if filteredCount >= baselineCount {
		t.Fatalf("filtered road tiles (%d) must be less than baseline (%d)", filteredCount, baselineCount)
	}
	// Minor-road filtering should cut at least half of the road tiles versus an
	// unfiltered rasterization of the same segments. Locks in the "major reduction"
	// acceptance criterion from issue #55.
	if filteredCount*2 > baselineCount {
		t.Fatalf("expected at least 50%% reduction in road tiles after filter, got filtered=%d baseline=%d", filteredCount, baselineCount)
	}
}

func TestRasterizeRoads_DropsMinorClassesWhenMajorsExist(t *testing.T) {
	const mapW, mapH = 200, 150

	justMajor := []Road{
		seg("primary", 0.1, 0.5, 0.9, 0.5),
		seg("secondary", 0.5, 0.1, 0.5, 0.9),
	}
	withMinors := append([]Road{}, justMajor...)
	withMinors = append(withMinors,
		seg("residential", 0.2, 0.2, 0.8, 0.2),
		seg("footway", 0.2, 0.8, 0.8, 0.8),
		seg("service", 0.3, 0.3, 0.7, 0.3),
		seg("path", 0.3, 0.7, 0.7, 0.7),
	)

	a := blankTiles(mapW, mapH)
	rasterizeRoads(a, justMajor, mapW, mapH)
	aCount := countPathTiles(a)

	b := blankTiles(mapW, mapH)
	rasterizeRoads(b, withMinors, mapW, mapH)
	bCount := countPathTiles(b)

	if aCount != bCount {
		t.Fatalf("residential/footway/service must be dropped when majors exist: justMajor=%d withMinors=%d", aCount, bCount)
	}
}

func TestRasterizeRoads_ResidentialFallbackForTinyHamlet(t *testing.T) {
	const mapW, mapH = 200, 150

	// A tiny village: zero major routes, just residential streets and footpaths.
	hamlet := []Road{
		seg("residential", 0.1, 0.5, 0.9, 0.5),
		seg("residential", 0.5, 0.2, 0.5, 0.8),
		seg("footway", 0.2, 0.3, 0.8, 0.3),
		seg("service", 0.2, 0.7, 0.8, 0.7),
	}

	tiles := blankTiles(mapW, mapH)
	rasterizeRoads(tiles, hamlet, mapW, mapH)
	if got := countPathTiles(tiles); got == 0 {
		t.Fatalf("residential fallback must paint at least one road when no majors exist, got 0 tiles")
	}

	// Footway-only hamlet: nothing in the fallback set → zero road tiles.
	footOnly := []Road{
		seg("footway", 0.1, 0.5, 0.9, 0.5),
		seg("path", 0.5, 0.1, 0.5, 0.9),
	}
	tiles2 := blankTiles(mapW, mapH)
	rasterizeRoads(tiles2, footOnly, mapW, mapH)
	if got := countPathTiles(tiles2); got != 0 {
		t.Fatalf("footway-only set must paint zero road tiles, got %d", got)
	}
}

func TestParseRoads_PopulatesHighwayClass(t *testing.T) {
	nodes := map[int64]osmNode{
		1: {lat: 45.0, lon: -91.0},
		2: {lat: 45.01, lon: -91.01},
	}
	ways := []osmElement{
		{Type: "way", Nodes: []int64{1, 2}, Tags: map[string]string{"highway": "primary"}},
		{Type: "way", Nodes: []int64{1, 2}, Tags: map[string]string{"highway": "residential"}},
		{Type: "way", Nodes: []int64{1, 2}, Tags: map[string]string{"highway": "footway"}},
	}
	roads := parseRoads(ways, nodes, 44.9, 45.1, -91.1, -90.9)
	if len(roads) != 3 {
		t.Fatalf("expected 3 roads parsed, got %d", len(roads))
	}
	want := []string{"primary", "residential", "footway"}
	for i, w := range want {
		if roads[i].Class != w {
			t.Errorf("roads[%d].Class = %q, want %q", i, roads[i].Class, w)
		}
	}
}

func TestParseWaterways_PopulatesKind(t *testing.T) {
	nodes := map[int64]osmNode{
		1: {lat: 45.0, lon: -91.0},
		2: {lat: 45.01, lon: -91.01},
		3: {lat: 45.02, lon: -91.02},
	}
	ways := []osmElement{
		{Type: "way", Nodes: []int64{1, 2}, Tags: map[string]string{"waterway": "river"}},
		{Type: "way", Nodes: []int64{2, 3}, Tags: map[string]string{"waterway": "stream"}},
		{Type: "way", Nodes: []int64{1, 3}, Tags: map[string]string{"waterway": "canal"}},
	}
	waters := parseWaterways(ways, nodes, 44.9, 45.1, -91.1, -90.9)
	if len(waters) != 3 {
		t.Fatalf("expected 3 waterways parsed, got %d", len(waters))
	}
	want := []string{"river", "stream", "canal"}
	for i, w := range want {
		if waters[i].Kind != w {
			t.Errorf("waters[%d].Kind = %q, want %q", i, waters[i].Kind, w)
		}
	}
}

// countWaterTiles returns the number of TileWater tiles in the grid.
func countWaterTiles(tiles [][]int) int {
	n := 0
	for _, row := range tiles {
		for _, t := range row {
			if t == int(TileWater) {
				n++
			}
		}
	}
	return n
}

func TestRasterizeWaterways_StampsTileWater(t *testing.T) {
	const mapW, mapH = 40, 40
	tiles := blankTiles(mapW, mapH)

	// Single river spanning most of the map diagonally.
	waters := []Waterway{
		{
			Kind: "river",
			Points: []struct{ X, Y float64 }{
				{X: 0.1, Y: 0.1},
				{X: 0.9, Y: 0.9},
			},
		},
	}
	rasterizeWaterways(tiles, waters, mapW, mapH)

	if got := countWaterTiles(tiles); got == 0 {
		t.Fatalf("expected at least one TileWater tile after rasterizeWaterways, got 0")
	}
}

// Drains and ditches should NOT be rendered as blocking water — they clutter
// town maps with tiny drainage lines the issue never asked for.
func TestRasterizeWaterways_SkipsDrainAndDitch(t *testing.T) {
	const mapW, mapH = 40, 40
	tiles := blankTiles(mapW, mapH)

	diag := []struct{ X, Y float64 }{{X: 0.1, Y: 0.1}, {X: 0.9, Y: 0.9}}
	waters := []Waterway{
		{Kind: "drain", Points: diag},
		{Kind: "ditch", Points: diag},
		{Kind: "wash", Points: diag},
	}
	rasterizeWaterways(tiles, waters, mapW, mapH)

	if got := countWaterTiles(tiles); got != 0 {
		t.Fatalf("expected 0 TileWater tiles for drain/ditch/wash, got %d", got)
	}
}

// Roads already rasterized before rasterizeWaterways runs must remain TilePath
// at crossings so players (and quest routing) can still traverse bridges.
func TestRasterizeWaterways_PreservesRoadCrossings(t *testing.T) {
	const mapW, mapH = 40, 40
	tiles := blankTiles(mapW, mapH)

	// Horizontal road across the middle of the map.
	roadY := 20
	for x := 0; x < mapW; x++ {
		tiles[roadY][x] = int(TilePath)
	}

	// Vertical river straight down the middle, guaranteed to cross the road.
	waters := []Waterway{
		{
			Kind: "river",
			Points: []struct{ X, Y float64 }{
				{X: 0.5, Y: 0.0},
				{X: 0.5, Y: 1.0},
			},
		},
	}
	rasterizeWaterways(tiles, waters, mapW, mapH)

	// The entire road row must remain TilePath — no water stamped over it.
	for x := 0; x < mapW; x++ {
		if tiles[roadY][x] != int(TilePath) {
			t.Fatalf("road row %d clobbered at x=%d: got tile %d, want TilePath", roadY, x, tiles[roadY][x])
		}
	}
	// The river should still exist elsewhere (not a no-op test).
	if countWaterTiles(tiles) == 0 {
		t.Fatal("expected river to stamp water tiles outside the road row")
	}
}
