package locality

import (
	"container/heap"
	"math"
)

// TileType represents what kind of tile is at a map position.
type TileType int

const (
	TileGrass     TileType = 0
	TilePath      TileType = 1
	TileWater     TileType = 2
	TileTree      TileType = 3
	TileBuilding  TileType = 4
	TileDoor      TileType = 5
	TileFloor     TileType = 6
	TileRock      TileType = 7
	TileBush      TileType = 8
	TileDarkGrass TileType = 9
	TileForest    TileType = 10
	TileHill      TileType = 11
	TileSand      TileType = 12
)

// majorHighway is the set of OSM highway classes that are always rasterized
// onto the world map. Everything else (residential, service, footway, path,
// track, cycleway, steps, ...) is treated as minor and filtered out so the
// TAB-key world map stays readable. Link variants are included so on/off-ramps
// aren't orphaned when their parent route is drawn.
var majorHighway = map[string]bool{
	"motorway":       true,
	"trunk":          true,
	"primary":        true,
	"secondary":      true,
	"tertiary":       true,
	"motorway_link":  true,
	"trunk_link":     true,
	"primary_link":   true,
	"secondary_link": true,
	"tertiary_link":  true,
}

// fallbackHighway is the tier used when no majorHighway roads are present in a
// locality (tiny villages, hamlets). It keeps the world map from ending up
// completely roadless when a town only has residential streets.
var fallbackHighway = map[string]bool{
	"residential":   true,
	"unclassified":  true,
	"living_street": true,
}

// roadWidth returns the tile width used when rasterizing a road of the given
// OSM highway class. Width scales with road importance so primary routes stand
// out against the residential fallback tier.
func roadWidth(class string) int {
	switch class {
	case "motorway", "trunk", "primary":
		return 3
	case "secondary", "tertiary",
		"motorway_link", "trunk_link", "primary_link",
		"secondary_link", "tertiary_link":
		return 2
	default:
		return 1
	}
}

// HiddenPathInfo records a carved secret path between two node areas.
type HiddenPathInfo struct {
	FromNodeID string   `json:"from_node_id"`
	ToNodeID   string   `json:"to_node_id"`
	Tiles      [][2]int `json:"tiles"` // (x,y) pairs of carved tiles
}

// TileMap is the rendered map sent to the Phaser client.
type TileMap struct {
	Width      int             `json:"width"`
	Height     int             `json:"height"`
	TileSize   int             `json:"tile_size"`
	Tiles      [][]int         `json:"tiles"`
	Spawns     []MapSpawn      `json:"spawns"`
	PlayerX    int             `json:"player_x"`
	PlayerY    int             `json:"player_y"`
	HiddenPath *HiddenPathInfo `json:"hidden_path,omitempty"`
}

// MapSpawn marks where a locality node appears on the map.
type MapSpawn struct {
	NodeID string   `json:"node_id"`
	Name   string   `json:"name"`
	Kind   string   `json:"kind"`
	Tags   []string `json:"tags"`
	X      int      `json:"x"`
	Y      int      `json:"y"`
}

// GenerateTileMap creates a large procedural map from a locality graph.
// Map scales with node count. Nodes are spread across the map with
// wilderness, forests, water, and paths between them.
func GenerateTileMap(loc *Locality, spawnID string, walk *WalkResult) *TileMap {
	nodeCount := len(loc.Nodes)
	mapW := clamp(nodeCount*18, 120, 250)
	mapH := mapW * 3 / 4
	const tileSize = 16

	tiles := make([][]int, mapH)
	for y := range tiles {
		tiles[y] = make([]int, mapW)
	}

	// Procedural terrain using simple noise
	seed := hashString(loc.Name)
	fillTerrain(tiles, mapW, mapH, seed)

	// Place nodes -- use real coordinates if OSM, otherwise grid layout
	var nodePositions []nodePos
	if loc.Source == "osm" {
		nodePositions = distributeNodesOSM(loc, mapW, mapH)
	} else {
		nodePositions = distributeNodes(loc.Nodes, mapW, mapH)
	}

	var spawns []MapSpawn
	playerX, playerY := mapW/2, mapH/2

	for _, np := range nodePositions {
		node := loc.NodeByID(np.nodeID)
		if node == nil {
			continue
		}

		x, y := np.x, np.y

		spawns = append(spawns, MapSpawn{
			NodeID: node.ID,
			Name:   node.Name,
			Kind:   string(node.Kind),
			Tags:   node.Tags,
			X:      x,
			Y:      y,
		})

		if node.ID == spawnID {
			playerX = x
			playerY = y + 3
		}

		// Clear area around each node for the town
		clearArea(tiles, x, y, mapW, mapH, node.Kind)

		// Draw building based on node kind
		switch node.Kind {
		case NodePlace, NodeBusiness, NodeLandmark:
			drawTownCluster(tiles, x, y, mapW, mapH)
		case NodePerson:
			drawSmallHouse(tiles, x, y, mapW, mapH)
		case NodeNatural:
			drawWildernessMarker(tiles, x, y, mapW, mapH)
		}
	}

	// Draw OSM roads if available, filtered by highway class.
	rasterizeRoads(tiles, loc.Roads(), mapW, mapH)
	// Draw OSM waterways (rivers, streams, canals).
	rasterizeWaterways(tiles, loc.Waterways(), mapW, mapH)

	// Carve hidden path connecting close-tier to far-tier node
	hiddenPath := carveHiddenPath(tiles, nodePositions, walk, mapW, mapH, seed)

	// Tree border
	for x := 0; x < mapW; x++ {
		for t := 0; t < 2; t++ {
			tiles[t][x] = int(TileForest)
			tiles[mapH-1-t][x] = int(TileForest)
		}
	}
	for y := 0; y < mapH; y++ {
		for t := 0; t < 2; t++ {
			tiles[y][t] = int(TileForest)
			tiles[y][mapW-1-t] = int(TileForest)
		}
	}

	return &TileMap{
		Width:      mapW,
		Height:     mapH,
		TileSize:   tileSize,
		Tiles:      tiles,
		Spawns:     spawns,
		PlayerX:    playerX,
		PlayerY:    playerY,
		HiddenPath: hiddenPath,
	}
}

// fillTerrain generates procedural terrain using simple hash-based noise.
func fillTerrain(tiles [][]int, w, h int, seed uint64) {
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			// Simple noise at multiple scales
			n1 := noise(x, y, seed, 20)    // large features
			n2 := noise(x, y, seed+99, 8)  // medium features
			n3 := noise(x, y, seed+777, 3) // small features
			val := n1*0.5 + n2*0.3 + n3*0.2

			if val < 0.15 {
				tiles[y][x] = int(TileWater)
			} else if val < 0.22 {
				tiles[y][x] = int(TileSand)
			} else if val < 0.4 {
				tiles[y][x] = int(TileGrass)
			} else if val < 0.55 {
				tiles[y][x] = int(TileDarkGrass)
			} else if val < 0.7 {
				tiles[y][x] = int(TileTree)
			} else if val < 0.82 {
				tiles[y][x] = int(TileForest)
			} else {
				tiles[y][x] = int(TileHill)
			}
		}
	}
}

// noise returns a value 0-1 for a position using hash-based pseudo-noise.
func noise(x, y int, seed uint64, scale int) float64 {
	// Grid cell coordinates
	gx, gy := x/scale, y/scale
	// Fractional position within cell
	fx := float64(x%scale) / float64(scale)
	fy := float64(y%scale) / float64(scale)

	// Hash corners
	c00 := hashNoise(gx, gy, seed)
	c10 := hashNoise(gx+1, gy, seed)
	c01 := hashNoise(gx, gy+1, seed)
	c11 := hashNoise(gx+1, gy+1, seed)

	// Smooth interpolation
	sx := fx * fx * (3 - 2*fx)
	sy := fy * fy * (3 - 2*fy)

	top := c00*(1-sx) + c10*sx
	bot := c01*(1-sx) + c11*sx
	return top*(1-sy) + bot*sy
}

func hashNoise(x, y int, seed uint64) float64 {
	h := seed
	h ^= uint64(x) * 0x517cc1b727220a95
	h ^= uint64(y) * 0x6c62272e07bb0142
	h = h*0x2545F4914F6CDD1D + 1
	h ^= h >> 16
	h *= 0x45d9f3b
	h ^= h >> 16
	return float64(h%10000) / 10000.0
}

func hashString(s string) uint64 {
	var h uint64 = 5381
	for _, c := range s {
		h = h*33 + uint64(c)
	}
	return h
}

// clearArea clears terrain around a node for buildings.
func clearArea(tiles [][]int, cx, cy, w, h int, kind NodeKind) {
	radius := 4
	if kind == NodePlace || kind == NodeLandmark || kind == NodeBusiness {
		radius = 6
	}
	for dy := -radius; dy <= radius; dy++ {
		for dx := -radius; dx <= radius; dx++ {
			nx, ny := cx+dx, cy+dy
			if nx >= 2 && nx < w-2 && ny >= 2 && ny < h-2 {
				tiles[ny][nx] = int(TileGrass)
			}
		}
	}
}

// drawTownCluster creates a small town with multiple buildings.
func drawTownCluster(tiles [][]int, cx, cy, w, h int) {
	// Main building (3x2)
	for bx := cx - 1; bx <= cx+1; bx++ {
		for by := cy - 1; by <= cy; by++ {
			if inBounds(bx, by, w, h) {
				tiles[by][bx] = int(TileBuilding)
			}
		}
	}
	if inBounds(cx, cy+1, w, h) {
		tiles[cy+1][cx] = int(TileDoor)
	}

	// Side buildings
	offsets := [][2]int{{-4, -1}, {4, -1}, {-3, 3}, {3, 3}}
	for _, off := range offsets {
		bx, by := cx+off[0], cy+off[1]
		if inBounds(bx, by, w, h) && inBounds(bx+1, by, w, h) {
			tiles[by][bx] = int(TileBuilding)
			tiles[by][bx+1] = int(TileBuilding)
			if inBounds(bx, by+1, w, h) {
				tiles[by+1][bx] = int(TileDoor)
			}
		}
	}

	// Town square (paths around center)
	for dx := -2; dx <= 2; dx++ {
		if inBounds(cx+dx, cy+2, w, h) {
			tiles[cy+2][cx+dx] = int(TilePath)
		}
	}
}

// drawSmallHouse creates a single small house.
func drawSmallHouse(tiles [][]int, cx, cy, w, h int) {
	for bx := cx - 1; bx <= cx+1; bx++ {
		if inBounds(bx, cy, w, h) {
			tiles[cy][bx] = int(TileBuilding)
		}
	}
	if inBounds(cx, cy+1, w, h) {
		tiles[cy+1][cx] = int(TileDoor)
	}
}

// drawWildernessMarker creates rocks and dark grass.
func drawWildernessMarker(tiles [][]int, cx, cy, w, h int) {
	if inBounds(cx, cy, w, h) {
		tiles[cy][cx] = int(TileRock)
	}
	for _, d := range [][2]int{{-1, 0}, {1, 0}, {0, -1}, {0, 1}} {
		nx, ny := cx+d[0], cy+d[1]
		if inBounds(nx, ny, w, h) {
			tiles[ny][nx] = int(TileDarkGrass)
		}
	}
}

// drawWidePathN draws a path of the given tile width between two points. Width
// is stamped along the x axis (same as the pre-issue-55 behavior) and must be
// at least 1.
func drawWidePathN(tiles [][]int, x1, y1, x2, y2, w, h, width int) {
	if width < 1 {
		width = 1
	}
	dx := x2 - x1
	dy := y2 - y1
	steps := int(math.Max(math.Abs(float64(dx)), math.Abs(float64(dy))))
	if steps == 0 {
		return
	}

	lo := -(width / 2)
	hi := (width + 1) / 2
	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		x := x1 + int(float64(dx)*t)
		y := y1 + int(float64(dy)*t)

		for pw := lo; pw < hi; pw++ {
			nx := x + pw
			if inBounds(nx, y, w, h) {
				tile := tiles[y][nx]
				if tile != int(TileBuilding) && tile != int(TileDoor) {
					tiles[y][nx] = int(TilePath)
				}
			}
		}
	}
}

// rasterizeRoads stamps OSM road segments onto the tile grid, filtering minor
// roads by highway class. Only majorHighway classes are drawn in the base
// case; when a locality has no major routes at all (tiny hamlets) the
// fallbackHighway tier is drawn instead so the map is never completely empty.
// Roads whose class is in neither set (footway, service, path, track, ...) are
// skipped entirely. This is the fix for issue #55: the world map used to draw
// every highway tag identically and became an unreadable tan grid.
func rasterizeRoads(tiles [][]int, roads []Road, mapW, mapH int) {
	if len(roads) == 0 {
		return
	}

	margin := 8
	usableW := mapW - 2*margin
	usableH := mapH - 2*margin
	if usableW <= 0 || usableH <= 0 {
		return
	}

	var selected []int
	for i, r := range roads {
		if majorHighway[r.Class] {
			selected = append(selected, i)
		}
	}
	if len(selected) == 0 {
		for i, r := range roads {
			if fallbackHighway[r.Class] {
				selected = append(selected, i)
			}
		}
	}

	for _, idx := range selected {
		road := roads[idx]
		width := roadWidth(road.Class)
		for j := 1; j < len(road.Points); j++ {
			x1 := margin + int(road.Points[j-1].X*float64(usableW))
			y1 := margin + int(road.Points[j-1].Y*float64(usableH))
			x2 := margin + int(road.Points[j].X*float64(usableW))
			y2 := margin + int(road.Points[j].Y*float64(usableH))
			drawWidePathN(tiles, x1, y1, x2, y2, mapW, mapH, width)
		}
	}
}

// waterwayWidth returns the tile width for a given OSM waterway kind.
func waterwayWidth(kind string) int {
	switch kind {
	case "river":
		return 3
	case "canal":
		return 2
	default: // stream, drain, ditch, unknown
		return 1
	}
}

// rasterizeWaterways stamps linear waterway segments onto the tile grid.
func rasterizeWaterways(tiles [][]int, waters []Waterway, mapW, mapH int) {
	if len(waters) == 0 {
		return
	}
	margin := 8
	usableW := mapW - 2*margin
	usableH := mapH - 2*margin
	if usableW <= 0 || usableH <= 0 {
		return
	}
	for _, w := range waters {
		width := waterwayWidth(w.Kind)
		for j := 1; j < len(w.Points); j++ {
			x1 := margin + int(w.Points[j-1].X*float64(usableW))
			y1 := margin + int(w.Points[j-1].Y*float64(usableH))
			x2 := margin + int(w.Points[j].X*float64(usableW))
			y2 := margin + int(w.Points[j].Y*float64(usableH))
			drawWidePathWater(tiles, x1, y1, x2, y2, mapW, mapH, width)
		}
	}
}

// drawWidePathWater is drawWidePathN but stamps TileWater instead of TilePath.
// Skips TileBuilding/TileDoor to avoid rivers through houses.
func drawWidePathWater(tiles [][]int, x1, y1, x2, y2, w, h, width int) {
	if width < 1 {
		width = 1
	}
	dx := x2 - x1
	dy := y2 - y1
	steps := int(math.Max(math.Abs(float64(dx)), math.Abs(float64(dy))))
	if steps == 0 {
		return
	}

	lo := -(width / 2)
	hi := (width + 1) / 2
	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		x := x1 + int(float64(dx)*t)
		y := y1 + int(float64(dy)*t)

		for pw := lo; pw < hi; pw++ {
			nx := x + pw
			if inBounds(nx, y, w, h) {
				tile := tiles[y][nx]
				if tile != int(TileBuilding) && tile != int(TileDoor) {
					tiles[y][nx] = int(TileWater)
				}
			}
		}
	}
}

type nodePos struct {
	nodeID string
	x, y   int
}

func distributeNodes(nodes []Node, mapW, mapH int) []nodePos {
	var result []nodePos

	// Distribute nodes in a grid pattern across the map
	count := len(nodes)
	if count == 0 {
		return result
	}

	// Calculate grid dimensions
	cols := int(math.Ceil(math.Sqrt(float64(count) * float64(mapW) / float64(mapH))))
	rows := int(math.Ceil(float64(count) / float64(cols)))
	if cols < 1 {
		cols = 1
	}
	if rows < 1 {
		rows = 1
	}

	// Cell size with margins
	marginX := mapW / 8
	marginY := mapH / 8
	usableW := mapW - 2*marginX
	usableH := mapH - 2*marginY
	cellW := usableW / cols
	cellH := usableH / rows

	for i, node := range nodes {
		col := i % cols
		row := i / cols
		if row >= rows {
			break
		}

		// Center of cell with small jitter based on node name
		jitter := hashString(node.ID)
		jitterX := int(jitter%uint64(cellW/3)) - cellW/6
		jitterY := int((jitter/7)%uint64(cellH/3)) - cellH/6

		x := marginX + col*cellW + cellW/2 + jitterX
		y := marginY + row*cellH + cellH/2 + jitterY

		x = clamp(x, 5, mapW-6)
		y = clamp(y, 5, mapH-6)

		result = append(result, nodePos{nodeID: node.ID, x: x, y: y})
	}

	return result
}

// distributeNodesOSM places nodes at positions derived from real lat/lng coordinates.
func distributeNodesOSM(loc *Locality, mapW, mapH int) []nodePos {
	var result []nodePos

	// Find bounding box of all nodes with coordinates
	var minLat, maxLat, minLng, maxLng float64
	first := true
	for _, n := range loc.Nodes {
		if n.Coord == nil {
			continue
		}
		if first {
			minLat, maxLat = n.Coord.Lat, n.Coord.Lat
			minLng, maxLng = n.Coord.Lng, n.Coord.Lng
			first = true
		}
		if n.Coord.Lat < minLat {
			minLat = n.Coord.Lat
		}
		if n.Coord.Lat > maxLat {
			maxLat = n.Coord.Lat
		}
		if n.Coord.Lng < minLng {
			minLng = n.Coord.Lng
		}
		if n.Coord.Lng > maxLng {
			maxLng = n.Coord.Lng
		}
	}

	// Use center +/- 0.015 degrees (~1.5km) if no bbox
	if !first || maxLat-minLat < 0.001 {
		minLat = loc.Center.Lat - 0.015
		maxLat = loc.Center.Lat + 0.015
		minLng = loc.Center.Lng - 0.02
		maxLng = loc.Center.Lng + 0.02
	}

	// Add padding
	padLat := (maxLat - minLat) * 0.1
	padLng := (maxLng - minLng) * 0.1
	minLat -= padLat
	maxLat += padLat
	minLng -= padLng
	maxLng += padLng

	margin := 8
	usableW := mapW - 2*margin
	usableH := mapH - 2*margin

	placed := 0
	for _, n := range loc.Nodes {
		var x, y int
		if n.Coord != nil {
			// Map real coordinates to tile positions
			normX := (n.Coord.Lng - minLng) / (maxLng - minLng)
			normY := 1 - (n.Coord.Lat-minLat)/(maxLat-minLat) // invert Y
			x = margin + int(normX*float64(usableW))
			y = margin + int(normY*float64(usableH))
		} else {
			// Fallback: distribute without coords
			x = margin + (placed * usableW / (len(loc.Nodes) + 1))
			y = margin + usableH/2
		}

		x = clamp(x, 5, mapW-6)
		y = clamp(y, 5, mapH-6)

		result = append(result, nodePos{nodeID: n.ID, x: x, y: y})
		placed++
	}

	return result
}

func inBounds(x, y, w, h int) bool {
	return x >= 0 && x < w && y >= 0 && y < h
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// carveHiddenPath uses A* to find and carve a dark-grass corridor between a
// close-tier node and a far-tier node. Returns nil if no valid path exists.
func carveHiddenPath(tiles [][]int, nodePositions []nodePos, walk *WalkResult, mapW, mapH int, seed uint64) *HiddenPathInfo {
	if walk == nil || len(walk.Close) == 0 || len(walk.Far) == 0 {
		return nil
	}

	// Pick one close node and one far node deterministically from seed.
	closeIdx := int(seed % uint64(len(walk.Close)))
	farIdx := int((seed / 7) % uint64(len(walk.Far)))
	closeNode := walk.Close[closeIdx]
	farNode := walk.Far[farIdx]

	// Find tile positions for the chosen nodes.
	var fromX, fromY, toX, toY int
	foundFrom, foundTo := false, false
	for _, np := range nodePositions {
		if np.nodeID == closeNode.ID {
			fromX, fromY = np.x, np.y
			foundFrom = true
		}
		if np.nodeID == farNode.ID {
			toX, toY = np.x, np.y
			foundTo = true
		}
	}
	if !foundFrom || !foundTo {
		return nil
	}

	// Build proximity map: tiles within 3 of a building or door are forbidden.
	forbidden := make([][]bool, mapH)
	for y := range forbidden {
		forbidden[y] = make([]bool, mapW)
	}
	for y := 0; y < mapH; y++ {
		for x := 0; x < mapW; x++ {
			t := TileType(tiles[y][x])
			if t == TileBuilding || t == TileDoor {
				for dy := -3; dy <= 3; dy++ {
					for dx := -3; dx <= 3; dx++ {
						nx, ny := x+dx, y+dy
						if nx >= 0 && nx < mapW && ny >= 0 && ny < mapH {
							forbidden[ny][nx] = true
						}
					}
				}
			}
		}
	}

	path := astarPath(tiles, forbidden, fromX, fromY, toX, toY, mapW, mapH)
	if len(path) == 0 {
		return nil
	}

	// Carve: replace non-walkable tiles along the path with dark grass.
	carved := make([][2]int, 0, len(path))
	for _, p := range path {
		t := TileType(tiles[p[1]][p[0]])
		if t == TileTree || t == TileForest || t == TileBush || t == TileHill {
			tiles[p[1]][p[0]] = int(TileDarkGrass)
			carved = append(carved, p)
		}
	}

	return &HiddenPathInfo{
		FromNodeID: closeNode.ID,
		ToNodeID:   farNode.ID,
		Tiles:      carved,
	}
}

// A* priority queue types.

type astarNode struct {
	x, y, cost, est int
}

type astarHeap []astarNode

func (h astarHeap) Len() int           { return len(h) }
func (h astarHeap) Less(i, j int) bool { return h[i].est < h[j].est }
func (h astarHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *astarHeap) Push(x any)        { *h = append(*h, x.(astarNode)) }
func (h *astarHeap) Pop() any {
	old := *h
	n := len(old)
	item := old[n-1]
	*h = old[:n-1]
	return item
}

// astarPath finds a path from (sx,sy) to (tx,ty) on the tile grid.
// Traversal costs: dark grass/grass/path/sand = 1, tree/forest/bush/hill = 3.
// Water, border (rows/cols 0-1 and last 2), and forbidden tiles are impassable.
func astarPath(tiles [][]int, forbidden [][]bool, sx, sy, tx, ty, w, h int) [][2]int {
	type key struct{ x, y int }

	dist := make(map[key]int)
	prev := make(map[key]key)
	dist[key{sx, sy}] = 0

	pq := &astarHeap{{x: sx, y: sy, cost: 0, est: abs(tx-sx) + abs(ty-sy)}}
	heap.Init(pq)

	dirs := [4][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}}

	for pq.Len() > 0 {
		cur := heap.Pop(pq).(astarNode)
		k := key{cur.x, cur.y}

		if cur.x == tx && cur.y == ty {
			// Reconstruct path.
			var path [][2]int
			at := key{tx, ty}
			for at != (key{sx, sy}) {
				path = append(path, [2]int{at.x, at.y})
				at = prev[at]
			}
			// Reverse.
			for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
				path[i], path[j] = path[j], path[i]
			}
			return path
		}

		if d, ok := dist[k]; ok && cur.cost > d {
			continue
		}

		for _, dir := range dirs {
			nx, ny := cur.x+dir[0], cur.y+dir[1]
			// Stay inside map with 2-tile border margin.
			if nx < 2 || nx >= w-2 || ny < 2 || ny >= h-2 {
				continue
			}
			if forbidden[ny][nx] {
				continue
			}

			moveCost := tileCost(TileType(tiles[ny][nx]))
			if moveCost < 0 {
				continue // impassable
			}

			nk := key{nx, ny}
			newCost := cur.cost + moveCost
			if d, ok := dist[nk]; ok && newCost >= d {
				continue
			}
			dist[nk] = newCost
			prev[nk] = k
			est := newCost + abs(tx-nx) + abs(ty-ny)
			heap.Push(pq, astarNode{x: nx, y: ny, cost: newCost, est: est})
		}
	}

	return nil // no path found
}

// tileCost returns the traversal cost for A* pathfinding. Returns -1 for impassable.
func tileCost(t TileType) int {
	switch t {
	case TileDarkGrass, TileGrass, TilePath, TileSand, TileFloor:
		return 1
	case TileTree, TileForest, TileBush, TileHill:
		return 3
	default:
		return -1 // water, building, door, rock
	}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
