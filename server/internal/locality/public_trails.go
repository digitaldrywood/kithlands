package locality

import "sort"

// Wizard/CSV worlds have relationship graphs but no surveyed road network.
// Give close destinations a public walking route. Medium/far destinations and
// the hidden shortcut remain discoveries, and imported roads stay authoritative.
func addPublicTrails(tiles [][]int, loc *Locality, walk *WalkResult, spawns []MapSpawn, hidden *HiddenPathInfo, w, h int) {
	if walk == nil || walk.Spawn == nil || loc.Source == "osm" || len(loc.RoadSegments) > 0 {
		return
	}
	positions := make(map[string][2]int, len(spawns))
	for _, spawn := range spawns {
		// Buildings already have a cleared approach below their symbolic marker.
		positions[spawn.NodeID] = [2]int{spawn.X, spawn.Y + 2}
	}
	forbidden := make([][]bool, h)
	for y := range forbidden {
		forbidden[y] = make([]bool, w)
	}
	publicNodes := map[string]bool{walk.Spawn.ID: true}
	for _, node := range walk.Close {
		publicNodes[node.ID] = true
	}
	for _, spawn := range spawns {
		if publicNodes[spawn.NodeID] {
			continue
		}
		// Do not route through an unrelated discovery's arrival/interaction area.
		for dy := -4; dy <= 4; dy++ {
			for dx := -4; dx <= 4; dx++ {
				x, y := spawn.X+dx, spawn.Y+dy
				if x >= 0 && x < w && y >= 0 && y < h {
					forbidden[y][x] = true
				}
			}
		}
	}
	if hidden != nil {
		for _, p := range hidden.Tiles {
			forbidden[p[1]][p[0]] = true
		}
	}
	nodes := append([]*Node(nil), walk.Close...)
	sort.Slice(nodes, func(i, j int) bool {
		a, b := nodes[i].ID, nodes[j].ID
		if walk.DistanceMap[a] != walk.DistanceMap[b] {
			return walk.DistanceMap[a] < walk.DistanceMap[b]
		}
		return a < b
	})
	for _, node := range nodes {
		to, ok := positions[node.ID]
		if !ok || to[1] >= h-2 || tileCost(TileType(tiles[to[1]][to[0]])) < 0 {
			continue
		}
		parentID := ""
		bestDistance := w + h
		for _, id := range loc.Neighbors(node.ID) {
			from, exists := positions[id]
			distance := abs(from[0]-to[0]) + abs(from[1]-to[1])
			if exists && walk.DistanceMap[id]+1 == walk.DistanceMap[node.ID] &&
				(distance < bestDistance || (distance == bestDistance && id < parentID)) {
				parentID, bestDistance = id, distance
			}
		}
		from, exists := positions[parentID]
		if !exists || from[1] >= h-2 || tileCost(TileType(tiles[from[1]][from[0]])) < 0 {
			continue
		}
		path := astarPath(tiles, forbidden, from[0], from[1], to[0], to[1], w, h)
		for _, p := range path {
			// Bridges remain bridges. A* cannot cross water, rock, mountains or
			// buildings; forest crossings become visible, walkable clearings.
			if TileType(tiles[p[1]][p[0]]) != TileBridge {
				tiles[p[1]][p[0]] = int(TilePath)
			}
		}
		if len(path) > 0 && TileType(tiles[from[1]][from[0]]) != TileBridge {
			tiles[from[1]][from[0]] = int(TilePath)
		}
	}
}
