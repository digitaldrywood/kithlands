package api

import "github.com/digitaldrywood/kithlands/internal/locality"

// Route anchors retain their old identities for existing depletion records.
// Only rendered/interactive positions move to nearby reachable habitat ground.
func (g *Game) placeResourceHabitats(nodes []ResourceNodeState) {
	start := WorldPosition{X: g.tileMap.PlayerX, Y: g.tileMap.PlayerY}
	reachable := map[WorldPosition]bool{start: true}
	queue := []WorldPosition{start}
	for i := 0; i < len(queue); i++ {
		p := queue[i]
		for _, d := range []WorldPosition{{X: 1}, {X: -1}, {Y: 1}, {Y: -1}} {
			n := WorldPosition{X: p.X + d.X, Y: p.Y + d.Y}
			if reachable[n] || !worldPositionInBounds(g.tileMap, n) || !worldTileTraversable(locality.TileType(g.tileMap.Tiles[n.Y][n.X]), worldTraversal{}) {
				continue
			}
			reachable[n] = true
			queue = append(queue, n)
		}
	}
	occupied := map[WorldPosition]bool{}
	placed := []ResourceNodeState{}
	for i := range nodes {
		node := &nodes[i]
		var resourceHabitat string
		for _, r := range g.gd.Gathering.Resources {
			if r.MaterialID == node.MaterialID {
				resourceHabitat = r.Habitat
				node.RespawnSeconds = r.RespawnSeconds
				break
			}
		}
		node.Habitat = resourceHabitat
		h := g.gd.Gathering.Habitats[resourceHabitat]
		node.SurfaceTile = h.SurfaceTile
		anchor := WorldPosition{X: node.X, Y: node.Y}
		best, bestScore := anchor, -100000
		for dy := -h.SearchRadius; dy <= h.SearchRadius; dy++ {
			for dx := -h.SearchRadius; dx <= h.SearchRadius; dx++ {
				p := WorldPosition{X: anchor.X + dx, Y: anchor.Y + dy}
				distance := checkpointAbs(dx) + checkpointAbs(dy)
				if distance > h.SearchRadius || !reachable[p] || occupied[p] {
					continue
				}
				tooClose := false
				for _, other := range placed {
					if other.Habitat != resourceHabitat && checkpointAbs(p.X-other.X)+checkpointAbs(p.Y-other.Y) < 4 {
						tooClose = true
						break
					}
				}
				if tooClose {
					continue
				}
				if !hasHabitatTile(h.GroundTiles, g.tileMap.Tiles[p.Y][p.X]) {
					continue
				}
				nearDoor := false
				for _, door := range g.tileMap.Spawns {
					if checkpointAbs(p.X-door.X)+checkpointAbs(p.Y-door.Y) < 2 {
						nearDoor = true
						break
					}
				}
				if nearDoor {
					continue
				}
				score := -distance * 3
				for oy := -2; oy <= 2; oy++ {
					for ox := -2; ox <= 2; ox++ {
						q := WorldPosition{X: p.X + ox, Y: p.Y + oy}
						if worldPositionInBounds(g.tileMap, q) && hasHabitatTile(h.NearTiles, g.tileMap.Tiles[q.Y][q.X]) {
							score += 8
						}
					}
				}
				if score > bestScore {
					best, bestScore = p, score
				}
			}
		}
		if bestScore == -100000 {
			continue
		}
		occupied[best] = true
		node.X, node.Y = best.X, best.Y
		placed = append(placed, *node)
		// Ground detail never changes collisions, roads, doors, or water. These
		// contiguous patches explain fallback resources on otherwise sparse maps.
		for dy := -h.PatchRadius; dy <= h.PatchRadius; dy++ {
			for dx := -h.PatchRadius; dx <= h.PatchRadius; dx++ {
				if dx*dx+dy*dy > h.PatchRadius*h.PatchRadius {
					continue
				}
				p := WorldPosition{X: best.X + dx, Y: best.Y + dy}
				if worldPositionInBounds(g.tileMap, p) && hasHabitatTile(h.GroundTiles, g.tileMap.Tiles[p.Y][p.X]) {
					node.HabitatTiles = append(node.HabitatTiles, p)
				}
			}
		}
	}
}

func hasHabitatTile(tiles []int, tile int) bool {
	for _, t := range tiles {
		if t == tile {
			return true
		}
	}
	return false
}
