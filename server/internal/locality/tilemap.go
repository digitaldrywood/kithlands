package locality

import "math"

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

// TileMap is the rendered map sent to the Phaser client.
type TileMap struct {
	Width    int        `json:"width"`
	Height   int        `json:"height"`
	TileSize int        `json:"tile_size"`
	Tiles    [][]int    `json:"tiles"`
	Spawns   []MapSpawn `json:"spawns"`
	PlayerX  int        `json:"player_x"`
	PlayerY  int        `json:"player_y"`
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
func GenerateTileMap(loc *Locality, spawnID string) *TileMap {
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

	// Draw paths between connected nodes
	for _, edge := range loc.Edges {
		var fromPos, toPos *nodePos
		for i := range nodePositions {
			if nodePositions[i].nodeID == edge.From {
				fromPos = &nodePositions[i]
			}
			if nodePositions[i].nodeID == edge.To {
				toPos = &nodePositions[i]
			}
		}
		if fromPos != nil && toPos != nil {
			drawWidePath(tiles, fromPos.x, fromPos.y+2, toPos.x, toPos.y+2, mapW, mapH)
		}
	}

	// Draw OSM roads if available
	if len(loc.Roads()) > 0 {
		margin := 8
		usableW := mapW - 2*margin
		usableH := mapH - 2*margin
		for _, road := range loc.Roads() {
			for j := 1; j < len(road.Points); j++ {
				x1 := margin + int(road.Points[j-1].X*float64(usableW))
				y1 := margin + int(road.Points[j-1].Y*float64(usableH))
				x2 := margin + int(road.Points[j].X*float64(usableW))
				y2 := margin + int(road.Points[j].Y*float64(usableH))
				drawWidePath(tiles, x1, y1, x2, y2, mapW, mapH)
			}
		}
	}

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
		Width:    mapW,
		Height:   mapH,
		TileSize: tileSize,
		Tiles:    tiles,
		Spawns:   spawns,
		PlayerX:  playerX,
		PlayerY:  playerY,
	}
}

// fillTerrain generates procedural terrain using simple hash-based noise.
func fillTerrain(tiles [][]int, w, h int, seed uint64) {
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			// Simple noise at multiple scales
			n1 := noise(x, y, seed, 20)       // large features
			n2 := noise(x, y, seed+99, 8)     // medium features
			n3 := noise(x, y, seed+777, 3)    // small features
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

// drawWidePath draws a 2-tile wide path between two points.
func drawWidePath(tiles [][]int, x1, y1, x2, y2, w, h int) {
	// Bresenham-like walk with width
	dx := x2 - x1
	dy := y2 - y1
	steps := int(math.Max(math.Abs(float64(dx)), math.Abs(float64(dy))))
	if steps == 0 {
		return
	}

	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		x := x1 + int(float64(dx)*t)
		y := y1 + int(float64(dy)*t)

		// 2-tile wide path
		for pw := -1; pw <= 0; pw++ {
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
		if n.Coord.Lat < minLat { minLat = n.Coord.Lat }
		if n.Coord.Lat > maxLat { maxLat = n.Coord.Lat }
		if n.Coord.Lng < minLng { minLng = n.Coord.Lng }
		if n.Coord.Lng > maxLng { maxLng = n.Coord.Lng }
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
			x = margin + (placed*usableW/(len(loc.Nodes)+1))
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
