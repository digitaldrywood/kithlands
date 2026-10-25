package api

import (
	"github.com/digitaldrywood/kithlands/internal/locality"
	"testing"
)

func worldShopSpawn(t *testing.T, g *Game) locality.MapSpawn {
	t.Helper()
	for _, spawn := range g.tileMap.Spawns {
		if spawn.BuildingType == "shop" && spawn.NodeID != g.walk.Spawn.ID && spawn.Interior != nil {
			return spawn
		}
	}
	t.Fatal("no direct world shop in normal locality")
	return locality.MapSpawn{}
}

func TestDirectWorldShopEntryPurchaseAndReturn(t *testing.T) {
	g := newTownTestGame(t)
	spawn := worldShopSpawn(t, g)
	g.location.WorldNodeID = spawn.NodeID // Validated arrival is covered by world-step tests.
	before := g.State()
	state, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-world-interior", WorldNodeID: spawn.NodeID})
	if err != nil {
		t.Fatal(err)
	}
	if state.CurrentLocation.Kind != LocationInterior || state.CurrentLocation.Interior.NodeID != spawn.NodeID {
		t.Fatalf("wrong arrival: %+v", state.CurrentLocation)
	}
	items, err := g.GetShopItems(spawn.NodeID)
	if err != nil {
		t.Fatal(err)
	}
	var bought bool
	for _, item := range items {
		if item.ID != "potion" {
			continue
		}
		if err := g.BuyItem(spawn.NodeID, item.StockID); err != nil {
			t.Fatal(err)
		}
		if g.State().Gold != before.Gold-item.Price {
			t.Fatal("purchase did not charge stock price")
		}
		bought = true
		break
	}
	if !bought {
		t.Fatal("no potion in shop stock")
	}
	state, err = g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "exit-interior"})
	if err != nil {
		t.Fatal(err)
	}
	if state.CurrentLocation.Kind != LocationWorld || state.CurrentLocation.WorldNodeID != spawn.NodeID {
		t.Fatalf("wrong return: %+v", state.CurrentLocation)
	}
	if _, err := g.GetShopItems(spawn.NodeID); err == nil {
		t.Fatal("shop remained accessible after leaving")
	}
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-world-interior", WorldNodeID: spawn.NodeID}); err != nil {
		t.Fatal(err)
	}
	if _, err := g.GetShopItems(spawn.NodeID); err != nil {
		t.Fatal(err)
	}
}

func TestDirectWorldInteriorRejectsRemoteAndNonBuildingEntries(t *testing.T) {
	g := newTownTestGame(t)
	spawn := worldShopSpawn(t, g)
	before := g.State().CurrentLocation
	for _, id := range []string{"", "missing-node", spawn.NodeID} {
		if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-world-interior", WorldNodeID: id}); err == nil {
			t.Fatalf("accepted remote/invalid entry %q", id)
		}
		if g.State().CurrentLocation.Kind != before.Kind || g.State().CurrentLocation.WorldNodeID != before.WorldNodeID {
			t.Fatal("invalid entry mutated location")
		}
	}
	g.location.WorldNodeID = spawn.NodeID
	remote := WorldPosition{X: 0, Y: 0}
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-world-interior", WorldNodeID: spawn.NodeID, WorldPosition: &remote}); err == nil {
		t.Fatal("accepted remote physical position")
	}
	g.location.WorldNodeID = "natural-test"
	g.tileMap.Spawns = append(g.tileMap.Spawns, locality.MapSpawn{NodeID: "natural-test", Kind: "natural"})
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-world-interior", WorldNodeID: "natural-test"}); err == nil {
		t.Fatal("accepted natural node as interior")
	}
}

func TestDirectWorldInteriorKeepsQuestVisit(t *testing.T) {
	g := objectiveTestGame(t, "Q01")
	spawn := worldShopSpawn(t, g)
	g.quests[0].Actions[0].Location = spawn.NodeID
	g.quests[0].Actions[1].Location = spawn.NodeID
	arriveAtWorldNode(t, g, spawn.NodeID)
	if _, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: spawn.NodeID}); err != nil {
		t.Fatal(err)
	}
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-world-interior", WorldNodeID: spawn.NodeID}); err != nil {
		t.Fatal(err)
	}
	req := objectiveAction(g)
	if _, err := g.ProcessAction(req); err != nil {
		t.Fatal(err)
	}
	if _, err := g.ProcessAction(req); err == nil {
		t.Fatal("replayed objective accepted")
	}
	g.location.Interior.NodeID = "different-node"
	if g.validQuestVisit(spawn.NodeID) {
		t.Fatal("mismatched interior accepted as quest visit")
	}
	g.location.Interior.NodeID = spawn.NodeID
	g.location.ReturnKind = LocationSettlement
	if g.validQuestVisit(spawn.NodeID) {
		t.Fatal("settlement interior accepted as a world quest location")
	}
}
