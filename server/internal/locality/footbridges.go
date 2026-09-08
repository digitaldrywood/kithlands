package locality

import "sort"

// River crossings are deliberately short: lakes, open water, and broad rivers
// remain transport barriers. A crossing is useful only if walking around it
// would take more than 48 tiles. Rechecking after each placement prevents
// adjacent bridges and lets existing road bridges satisfy the same budget.
const maxFootbridgeSpan = 6
const maxRiverDetour = 48

type riverCrossing struct {
	x, y, dx, dy, span, priority int
}

func addRiverFootbridges(tiles [][]int, spawns []MapSpawn, w, h int) {
	var candidates []riverCrossing
	for y := 3; y < h-3; y++ {
		for x := 3; x < w-3; x++ {
			if !footbridgeBank(TileType(tiles[y][x])) {
				continue
			}
			for _, dir := range [][2]int{{1, 0}, {0, 1}} {
				dx, dy := dir[0], dir[1]
				// Require a clear approach on both banks, not a landing trapped
				// between a river and an impassable forest or mountain.
				if !footbridgeBank(TileType(tiles[y-dy][x-dx])) {
					continue
				}
				span := 0
				for span <= maxFootbridgeSpan {
					nx, ny := x+dx*(span+1), y+dy*(span+1)
					if nx >= w-3 || ny >= h-3 || TileType(tiles[ny][nx]) != TileRiver {
						break
					}
					span++
				}
				ex, ey := x+dx*(span+1), y+dy*(span+1)
				if span == 0 || span > maxFootbridgeSpan || ex >= w-3 || ey >= h-3 ||
					!footbridgeBank(TileType(tiles[ey][ex])) || !footbridgeBank(TileType(tiles[ey+dy][ex+dx])) {
					continue
				}
				priority := w + h
				for _, s := range spawns {
					distance := abs(x-s.X) + abs(y-s.Y)
					if distance < priority {
						priority = distance
					}
				}
				candidates = append(candidates, riverCrossing{x, y, dx, dy, span, priority})
			}
		}
	}
	// Stable ordering gives settlements first choice, then shorter spans, with
	// row/column order breaking ties. No random seed or map iteration involved.
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].priority != candidates[j].priority {
			return candidates[i].priority < candidates[j].priority
		}
		return candidates[i].span < candidates[j].span
	})
	seen := make([]int, w*h)
	queue := make([][3]int, 0, w*h)
	for i, c := range candidates {
		ex, ey := c.x+c.dx*(c.span+1), c.y+c.dy*(c.span+1)
		queue = queue[:0]
		queue = append(queue, [3]int{c.x, c.y, 0})
		seen[c.y*w+c.x] = i + 1
		found := false
		for head := 0; head < len(queue); head++ {
			p := queue[head]
			if p[0] == ex && p[1] == ey {
				found = true
				break
			}
			if p[2] == maxRiverDetour {
				continue
			}
			for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
				nx, ny := p[0]+d[0], p[1]+d[1]
				if nx < 2 || ny < 2 || nx >= w-2 || ny >= h-2 || seen[ny*w+nx] == i+1 || !footbridgeWalkable(TileType(tiles[ny][nx])) {
					continue
				}
				seen[ny*w+nx] = i + 1
				queue = append(queue, [3]int{nx, ny, p[2] + 1})
			}
		}
		if !found {
			for step := 1; step <= c.span; step++ {
				tiles[c.y+c.dy*step][c.x+c.dx*step] = int(TileBridge)
			}
		}
	}
}

func footbridgeBank(t TileType) bool {
	switch t {
	case TileGrass, TilePath, TileDarkGrass, TileHill, TileSand, TileMarsh, TileSnow:
		return true
	default:
		return false
	}
}

func footbridgeWalkable(t TileType) bool {
	return footbridgeBank(t) || t == TileBridge || t == TileBuilding || t == TileDoor || t == TileFloor
}
