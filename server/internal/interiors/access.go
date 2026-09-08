package interiors

import "fmt"

type cell struct{ x, y int }

func floorWalkable(f *Floor, p cell) bool {
	if !withinBounds(p.x, p.y, f.Width, f.Height) {
		return false
	}
	switch f.Rows[p.y][p.x] {
	case '.', 'D', 'R', 'U', 'V', 'S':
		return true
	default:
		return false
	}
}

func adjacent(p cell) []cell {
	return []cell{{p.x - 1, p.y}, {p.x + 1, p.y}, {p.x, p.y - 1}, {p.x, p.y + 1}}
}

// validateAccess checks the paths that remain after actors and treasure occupy
// their tiles. Secret wall symbols are walk-through passages, as at runtime.
func (t *Template) validateAccess() error {
	for i := range t.Floors {
		f := &t.Floors[i]
		occupied := make(map[cell]bool)
		for _, npc := range f.NPCAnchors {
			p := cell{npc.X, npc.Y}
			if occupied[p] {
				return fmt.Errorf("template %q floor %d overlapping NPC", t.ID, f.FloorID)
			}
			occupied[p] = true
		}
		for _, chest := range f.ChestAnchors {
			p := cell{chest.X, chest.Y}
			if occupied[p] {
				return fmt.Errorf("template %q floor %d overlapping chest %q", t.ID, f.FloorID, chest.ID)
			}
			occupied[p] = true
		}
		var start cell
		if f.Entrance != nil {
			start = cell{f.Entrance.X, f.Entrance.Y}
		} else if len(f.Stairs) > 0 {
			start = cell{f.Stairs[0].X, f.Stairs[0].Y}
		} else {
			return fmt.Errorf("template %q floor %d has no entrance or stairs", t.ID, f.FloorID)
		}
		if !floorWalkable(f, start) || occupied[start] {
			return fmt.Errorf("template %q floor %d has blocked entrance", t.ID, f.FloorID)
		}
		reached := map[cell]bool{start: true}
		queue := []cell{start}
		for index := 0; index < len(queue); index++ {
			for _, next := range adjacent(queue[index]) {
				if reached[next] || occupied[next] || !floorWalkable(f, next) {
					continue
				}
				reached[next] = true
				queue = append(queue, next)
			}
		}
		for y := range f.Height {
			for x := range f.Width {
				p := cell{x, y}
				if floorWalkable(f, p) && !occupied[p] && !reached[p] {
					return fmt.Errorf("template %q floor %d unreachable floor at %d,%d", t.ID, f.FloorID, x, y)
				}
			}
		}
		for _, chest := range f.ChestAnchors {
			accessible := false
			for _, p := range adjacent(cell{chest.X, chest.Y}) {
				accessible = accessible || reached[p]
			}
			if !accessible {
				return fmt.Errorf("template %q floor %d unreachable chest %q", t.ID, f.FloorID, chest.ID)
			}
		}
		for _, npc := range f.NPCAnchors {
			accessible := false
			for p := range reached {
				dx, dy := p.x-npc.X, p.y-npc.Y
				if dx < 0 {
					dx = -dx
				}
				if dy < 0 {
					dy = -dy
				}
				accessible = accessible || dx+dy <= 2
			}
			if !accessible {
				return fmt.Errorf("template %q floor %d unreachable NPC %q", t.ID, f.FloorID, npc.Role)
			}
		}
		for _, stair := range f.Stairs {
			if !reached[cell{stair.X, stair.Y}] {
				return fmt.Errorf("template %q floor %d unreachable stairs", t.ID, f.FloorID)
			}
			for j := range t.Floors {
				target := &t.Floors[j]
				if target.FloorID != stair.ToFloor {
					continue
				}
				for _, npc := range target.NPCAnchors {
					if npc.X == stair.ToX && npc.Y == stair.ToY {
						return fmt.Errorf("template %q stairs land on NPC", t.ID)
					}
				}
				for _, chest := range target.ChestAnchors {
					if chest.X == stair.ToX && chest.Y == stair.ToY {
						return fmt.Errorf("template %q stairs land on chest", t.ID)
					}
				}
				if !floorWalkable(target, cell{stair.ToX, stair.ToY}) {
					return fmt.Errorf("template %q floor %d stairs land on blocked tile", t.ID, f.FloorID)
				}
			}
		}
	}
	return nil
}
