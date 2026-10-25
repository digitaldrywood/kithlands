package api

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// Keep the original search as a test oracle for shortest-path tie ordering.
// Resource identities derive from these route coordinates in existing saves.
func originalGatheringPath(tileMap *locality.TileMap, start, target WorldPosition) []WorldPosition {
	queue := []WorldPosition{start}
	previous := map[WorldPosition]WorldPosition{start: start}
	for index := 0; index < len(queue); index++ {
		current := queue[index]
		if current == target {
			path := []WorldPosition{current}
			for current != start {
				current = previous[current]
				path = append(path, current)
			}
			for a, b := 0, len(path)-1; a < b; a, b = a+1, b-1 {
				path[a], path[b] = path[b], path[a]
			}
			return path
		}
		for _, direction := range []WorldPosition{{X: 1}, {Y: 1}, {X: -1}, {Y: -1}} {
			next := WorldPosition{X: current.X + direction.X, Y: current.Y + direction.Y}
			if _, found := previous[next]; found || !worldPositionInBounds(tileMap, next) {
				continue
			}
			if !worldTileTraversable(locality.TileType(tileMap.Tiles[next.Y][next.X]), worldTraversal{}) {
				continue
			}
			previous[next] = current
			queue = append(queue, next)
		}
	}
	return nil
}

func TestGatheringPathsKeepOriginalTieOrder(t *testing.T) {
	for _, seed := range []int64{1, 42, 73, 941} {
		g := gatheringPerformanceGame(t, seed)
		start := WorldPosition{X: g.tileMap.PlayerX, Y: g.tileMap.PlayerY}
		for _, spawn := range g.tileMap.Spawns {
			target := WorldPosition{X: spawn.X, Y: spawn.Y}
			got, want := gatheringPath(g.tileMap, start, target), originalGatheringPath(g.tileMap, start, target)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("seed %d destination %s changed its route", seed, spawn.NodeID)
			}
		}
	}
}

func TestGatheringPlacementFingerprints(t *testing.T) {
	// Captured twice from the original map-backed search before optimization.
	baseline := map[int64]string{
		1:   "63da159dde01ec8b1cf3d2c4b23041f470a72cc89fdccc40700cb83835e4a028",
		42:  "47659e357a8f417631cf613b25d1facbf143473f8649874ea84a0307b34f7f0d",
		73:  "430a0d825ecfe2b1a3a3c6a35c9486213c4ba6bfcb01ba26646147abe5a3a3fc",
		941: "dc9a600a638d1034a8930397a4fc467a4b37221a93e3a0b195e58a3236e5f0c9",
	}
	for seed, want := range baseline {
		g := gatheringPerformanceGame(t, seed)
		data, err := json.Marshal(struct {
			Nodes []ResourceNodeState
			Tiles [][]int
		}{g.resourceNodes(), g.tileMap.Tiles})
		if err != nil {
			t.Fatal(err)
		}
		if got := fmt.Sprintf("%x", sha256.Sum256(data)); got != want {
			t.Fatalf("seed %d changed resource identities, habitats or terrain: %s", seed, got)
		}
	}
}

func TestGatheringPathRaggedRowsAndBlockedDestinations(t *testing.T) {
	grass, water := int(locality.TileGrass), int(locality.TileWater)
	m := &locality.TileMap{Width: 99, Height: 99, Tiles: [][]int{
		{grass, grass, grass, water}, {grass, water}, {grass, grass, water, grass, grass},
	}}
	start := WorldPosition{}
	for y, row := range m.Tiles {
		for x := range row {
			target := WorldPosition{X: x, Y: y}
			if got, want := gatheringPath(m, start, target), originalGatheringPath(m, start, target); !reflect.DeepEqual(got, want) {
				t.Fatalf("ragged target %+v: got %v want %v", target, got, want)
			}
		}
	}
	if gatheringPath(m, start, WorldPosition{X: 9}) != nil || gatheringPath(nil, start, start) != nil {
		t.Fatal("out-of-bounds destinations must not have routes")
	}
}
