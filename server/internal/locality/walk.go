package locality

// GraphWalk performs the BFS walk from a spawn node per Section 9.3.
// Returns nodes grouped by distance from spawn.
type WalkResult struct {
	Spawn          *Node
	Close          []*Node // within 2 edges
	Medium         []*Node // within 4 edges
	Far            []*Node // within 6 edges
	BigBad         *Node   // highest importance far node
	DistanceMap    map[string]int // nodeID -> distance from spawn
}

// Walk performs a BFS from the spawn node and groups nodes by distance.
func Walk(loc *Locality, spawnID string) *WalkResult {
	result := &WalkResult{
		Spawn:       loc.NodeByID(spawnID),
		DistanceMap: make(map[string]int),
	}

	if result.Spawn == nil {
		return result
	}

	// BFS
	visited := map[string]bool{spawnID: true}
	result.DistanceMap[spawnID] = 0
	queue := []string{spawnID}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		currentDist := result.DistanceMap[current]

		for _, neighborID := range loc.Neighbors(current) {
			if visited[neighborID] {
				continue
			}
			visited[neighborID] = true
			dist := currentDist + 1
			result.DistanceMap[neighborID] = dist
			queue = append(queue, neighborID)

			node := loc.NodeByID(neighborID)
			if node == nil {
				continue
			}

			switch {
			case dist <= 2:
				result.Close = append(result.Close, node)
			case dist <= 4:
				result.Medium = append(result.Medium, node)
			case dist <= 6:
				result.Far = append(result.Far, node)
			}
		}
	}

	// Pick big bad: highest importance among far nodes
	var maxImportance int
	for _, n := range result.Far {
		if n.Importance > maxImportance {
			maxImportance = n.Importance
			result.BigBad = n
		}
	}
	// If no far nodes, pick from medium
	if result.BigBad == nil {
		for _, n := range result.Medium {
			if n.Importance > maxImportance {
				maxImportance = n.Importance
				result.BigBad = n
			}
		}
	}

	return result
}
