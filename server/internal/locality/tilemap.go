package locality

// TileType represents what kind of tile is at a map position.
type TileType int

const (
	TileGrass    TileType = 0
	TilePath     TileType = 1
	TileWater    TileType = 2
	TileTree     TileType = 3
	TileBuilding TileType = 4
	TileDoor     TileType = 5
	TileFloor    TileType = 6
	TileRock     TileType = 7
	TileBush     TileType = 8
	TileDarkGrass TileType = 9
)

// TileMap is the rendered map sent to the Phaser client.
type TileMap struct {
	Width    int            `json:"width"`
	Height   int            `json:"height"`
	TileSize int            `json:"tile_size"`
	Tiles    [][]int        `json:"tiles"`
	Spawns   []MapSpawn     `json:"spawns"`    // named locations on the map
	PlayerX  int            `json:"player_x"`
	PlayerY  int            `json:"player_y"`
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

// GenerateTileMap creates a simple procedural map from a locality graph.
// Places buildings for nodes, paths between connected nodes, fills with terrain.
func GenerateTileMap(loc *Locality, spawnID string) *TileMap {
	const mapW, mapH = 40, 30
	const tileSize = 16

	tiles := make([][]int, mapH)
	for y := range tiles {
		tiles[y] = make([]int, mapW)
	}

	// Fill with grass, add some variety
	for y := 0; y < mapH; y++ {
		for x := 0; x < mapW; x++ {
			tiles[y][x] = int(TileGrass)
		}
	}

	// Add tree border
	for x := 0; x < mapW; x++ {
		tiles[0][x] = int(TileTree)
		tiles[mapH-1][x] = int(TileTree)
	}
	for y := 0; y < mapH; y++ {
		tiles[y][0] = int(TileTree)
		tiles[y][mapW-1] = int(TileTree)
	}

	// Scatter trees and bushes for texture
	positions := []struct{ x, y int }{
		{3, 3}, {7, 2}, {12, 4}, {18, 3}, {25, 5}, {33, 4}, {36, 7},
		{5, 12}, {10, 15}, {30, 10}, {35, 14}, {8, 22}, {15, 25},
		{28, 20}, {33, 24}, {4, 8}, {20, 8}, {37, 18}, {2, 18},
		{22, 22}, {14, 10}, {26, 15}, {32, 8}, {6, 26}, {38, 26},
	}
	for _, p := range positions {
		if p.x > 0 && p.x < mapW-1 && p.y > 0 && p.y < mapH-1 {
			tiles[p.y][p.x] = int(TileTree)
		}
	}
	bushes := []struct{ x, y int }{
		{4, 5}, {9, 8}, {16, 6}, {23, 3}, {31, 6}, {11, 20},
		{19, 18}, {27, 23}, {35, 20}, {7, 16}, {24, 12},
	}
	for _, p := range bushes {
		if p.x > 0 && p.x < mapW-1 && p.y > 0 && p.y < mapH-1 {
			tiles[p.y][p.x] = int(TileBush)
		}
	}

	// Add a water feature
	for x := 28; x <= 32; x++ {
		for y := 12; y <= 16; y++ {
			tiles[y][x] = int(TileWater)
		}
	}

	// Place nodes as buildings/landmarks on the map
	// Distribute nodes across the map grid
	nodePositions := distributeNodes(loc.Nodes, mapW, mapH)

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
			playerY = y + 2
		}

		// Draw building based on node kind
		switch node.Kind {
		case NodePlace, NodeBusiness, NodeLandmark:
			// 3x2 building with door
			for bx := x - 1; bx <= x+1; bx++ {
				for by := y - 1; by <= y; by++ {
					if bx >= 0 && bx < mapW && by >= 0 && by < mapH {
						tiles[by][bx] = int(TileBuilding)
					}
				}
			}
			if y+1 < mapH {
				tiles[y+1][x] = int(TileDoor)
			}
		case NodePerson:
			// Small house 2x1 with door
			if x-1 >= 0 && x+1 < mapW && y >= 0 && y < mapH {
				tiles[y][x-1] = int(TileBuilding)
				tiles[y][x] = int(TileBuilding)
				tiles[y][x+1] = int(TileBuilding)
			}
			if y+1 < mapH {
				tiles[y+1][x] = int(TileDoor)
			}
		case NodeNatural:
			// Rocks/wilderness marker
			tiles[y][x] = int(TileRock)
			if x-1 >= 0 {
				tiles[y][x-1] = int(TileDarkGrass)
			}
			if x+1 < mapW {
				tiles[y][x+1] = int(TileDarkGrass)
			}
		}

		// Draw paths from this node to connected nodes
		for _, edge := range loc.Edges {
			var otherID string
			if edge.From == node.ID {
				otherID = edge.To
			} else if edge.To == node.ID {
				otherID = edge.From
			} else {
				continue
			}

			// Find other node position
			for _, onp := range nodePositions {
				if onp.nodeID == otherID {
					drawPath(tiles, x, y+2, onp.x, onp.y+2, mapW, mapH)
					break
				}
			}
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

type nodePos struct {
	nodeID string
	x, y   int
}

func distributeNodes(nodes []Node, mapW, mapH int) []nodePos {
	var result []nodePos

	// Pre-defined positions spread across the map
	slots := []struct{ x, y int }{
		{mapW / 2, mapH / 4},           // top center (central building)
		{mapW/4, mapH/2},               // left middle
		{3*mapW/4, mapH/2},             // right middle
		{mapW/4, mapH/4},               // top left
		{3*mapW/4, mapH/4},             // top right
		{mapW/2, 3*mapH/4},             // bottom center
		{mapW/4, 3*mapH/4},             // bottom left
		{3*mapW/4, 3*mapH/4},           // bottom right
		{mapW/3, mapH/3},               // inner left
		{2*mapW/3, mapH/3},             // inner right
		{mapW/3, 2*mapH/3},             // inner bottom left
		{2*mapW/3, 2*mapH/3},           // inner bottom right
		{mapW/2, mapH/2},               // dead center
	}

	for i, node := range nodes {
		if i >= len(slots) {
			break
		}
		s := slots[i]
		// Clamp to safe area
		x := clamp(s.x, 3, mapW-4)
		y := clamp(s.y, 3, mapH-4)
		result = append(result, nodePos{nodeID: node.ID, x: x, y: y})
	}

	return result
}

func drawPath(tiles [][]int, x1, y1, x2, y2, mapW, mapH int) {
	// Simple L-shaped path: horizontal then vertical
	xStep := 1
	if x2 < x1 {
		xStep = -1
	}
	for x := x1; x != x2; x += xStep {
		if x >= 0 && x < mapW && y1 >= 0 && y1 < mapH {
			if tiles[y1][x] == int(TileGrass) || tiles[y1][x] == int(TileDarkGrass) {
				tiles[y1][x] = int(TilePath)
			}
		}
	}
	yStep := 1
	if y2 < y1 {
		yStep = -1
	}
	for y := y1; y != y2; y += yStep {
		if x2 >= 0 && x2 < mapW && y >= 0 && y < mapH {
			if tiles[y][x2] == int(TileGrass) || tiles[y][x2] == int(TileDarkGrass) {
				tiles[y][x2] = int(TilePath)
			}
		}
	}
}

func clamp(v, lo, hi int) int {
	if v < lo { return lo }
	if v > hi { return hi }
	return v
}
