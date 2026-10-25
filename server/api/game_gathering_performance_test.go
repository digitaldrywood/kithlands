package api

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

func gatheringPerformanceGame(tb testing.TB, seed int64) *Game {
	tb.Helper()
	gm := NewGameManager(gamedata.Load("../../shared"), "../../shared")
	g, err := gm.CreateGame(NewGameRequest{
		TownName: "Cadott", Places: []string{"School", "Store"}, BigBuilding: "Town Hall",
		People:     []WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Party:      []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}},
		Difficulty: "normal", RNGSeed: seed,
	})
	if err != nil {
		tb.Fatal(err)
	}
	return g
}

func cloneGatheringMap(original *locality.TileMap) *locality.TileMap {
	copyMap := *original
	copyMap.Tiles = make([][]int, len(original.Tiles))
	for i, row := range original.Tiles {
		copyMap.Tiles[i] = append([]int(nil), row...)
	}
	return &copyMap
}

func BenchmarkResourcePlacement(b *testing.B) {
	g := gatheringPerformanceGame(b, 42)
	original := cloneGatheringMap(g.tileMap)
	b.ReportAllocs()
	for b.Loop() {
		b.StopTimer()
		g.tileMap = cloneGatheringMap(original)
		g.resourceMap, g.resourceNodeCache = nil, nil
		b.StartTimer()
		if len(g.resourceNodes()) == 0 {
			b.Fatal("benchmark map must produce gatherable resources")
		}
	}
}

func BenchmarkGatheringRoute(b *testing.B) {
	g := gatheringPerformanceGame(b, 42)
	start := WorldPosition{X: g.tileMap.PlayerX, Y: g.tileMap.PlayerY}
	spawn := g.tileMap.Spawns[len(g.tileMap.Spawns)-1]
	target := WorldPosition{X: spawn.X, Y: spawn.Y}
	b.ReportAllocs()
	for b.Loop() {
		if len(gatheringPath(g.tileMap, start, target)) == 0 {
			b.Fatal("benchmark destination must be reachable")
		}
	}
}
