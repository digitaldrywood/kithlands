package api

import (
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

func TestPhysicalWalkingArrivalDoesNotRequireGraphEdge(t *testing.T) {
	g := newTownTestGame(t)
	start := g.location.WorldNodeID
	target := "walking-destination"
	g.loc.Nodes = append(g.loc.Nodes, locality.Node{ID: target, Name: "Reachable entrance"})
	g.tileMap.Spawns = []locality.MapSpawn{{NodeID: start, X: 3, Y: 10}, {NodeID: target, X: 14, Y: 10}}
	for y := 8; y <= 12; y++ {
		for x := 2; x <= 16; x++ {
			g.tileMap.Tiles[y][x] = int(locality.TilePath)
		}
	}
	g.setWorldCheckpointLocked(WorldPosition{X: 7, Y: 10}, start)
	// A remote arrival request is still not proof of walking.
	remote := WorldPosition{X: 14, Y: 10}
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "arrive-world-node", WorldNodeID: target, WorldPosition: &remote}); err == nil {
		t.Fatal("node-only jump bypassed the graph")
	}
	for x := 8; x <= 14; x++ {
		node := start
		if x >= 11 {
			node = target
		}
		p := WorldPosition{X: x, Y: 10}
		state, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "world-step", WorldNodeID: node, WorldPosition: &p})
		if err != nil {
			t.Fatalf("physical step to %d: %v", x, err)
		}
		if state.WorldCheckpoint.X != x || state.CurrentLocation.WorldNodeID != node {
			t.Fatalf("arrival not recorded: %+v", state.WorldCheckpoint)
		}
	}
}

func TestPhysicalArrivalStillRejectsInvalidMovement(t *testing.T) {
	for _, kind := range []string{"teleport", "water", "remote-node"} {
		t.Run(kind, func(t *testing.T) {
			g := newTownTestGame(t)
			start := g.location.WorldNodeID
			g.tileMap.Spawns = []locality.MapSpawn{{NodeID: start, X: 3, Y: 3}, {NodeID: "far", X: 30, Y: 30}}
			g.loc.Nodes = append(g.loc.Nodes, locality.Node{ID: "far"})
			g.setWorldCheckpointLocked(WorldPosition{X: 10, Y: 10}, start)
			p := WorldPosition{X: 11, Y: 10}
			node := start
			g.tileMap.Tiles[10][11] = int(locality.TilePath)
			switch kind {
			case "teleport":
				p.X = 20
			case "water":
				g.tileMap.Tiles[10][11] = int(locality.TileRiver)
			case "remote-node":
				node = "far"
			}
			before := cloneWorldCheckpoint(g.worldCheckpoint)
			travel := g.encounterTravel
			if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "world-step", WorldNodeID: node, WorldPosition: &p}); err == nil {
				t.Fatal("invalid movement accepted")
			}
			if !reflect.DeepEqual(before, g.worldCheckpoint) || travel != g.encounterTravel || g.location.WorldNodeID != start {
				t.Fatal("rejected movement mutated state")
			}
		})
	}
}
