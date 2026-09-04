package api

import (
	"reflect"
	"slices"
	"testing"
)

func TestCadottWorldShopRoundTripPreservesGameState(t *testing.T) {
	game := newTownTestGame(t)
	initial := game.State()
	if initial.CurrentLocation.Kind != LocationWorld {
		t.Fatalf("initial location = %q, want world", initial.CurrentLocation.Kind)
	}
	if initial.SettlementMap == nil || initial.SettlementMap.Property("id") != "cadott-town" {
		t.Fatalf("Cadott settlement map was not attached")
	}

	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "general-store-door"}); err == nil {
		t.Fatal("world accepted a settlement door transition")
	}
	if got := game.State().CurrentLocation.Kind; got != LocationWorld {
		t.Fatalf("invalid transition mutated location to %q", got)
	}

	state, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID: "enter-settlement",
		WorldNodeID:  initial.SettlementEntryNodeID,
	})
	if err != nil {
		t.Fatalf("enter settlement: %v", err)
	}
	if state.CurrentLocation.Kind != LocationSettlement || state.CurrentLocation.Anchor != "world-entry" {
		t.Fatalf("settlement arrival = %+v", state.CurrentLocation)
	}

	state, err = game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "general-store-door"})
	if err != nil {
		t.Fatalf("enter general store: %v", err)
	}
	interior := state.CurrentLocation.Interior
	if state.CurrentLocation.Kind != LocationInterior || interior == nil {
		t.Fatalf("store location = %+v", state.CurrentLocation)
	}
	if interior.NodeID != "cadott-general-store" || interior.BuildingType != "shop" || !slices.Contains(interior.Tags, "commerce") {
		t.Fatalf("store spawn did not reuse authored shop metadata: %+v", interior)
	}
	if interior.Interior == nil {
		t.Fatal("store did not reuse the existing interior template system")
	}

	shopItems, err := game.GetShopItems(interior.NodeID)
	if err != nil {
		t.Fatalf("get shop items: %v", err)
	}
	var starter *ShopItemState
	for i := range shopItems {
		if shopItems[i].ID == "wooden_club" {
			starter = &shopItems[i]
			break
		}
	}
	if starter == nil || !slices.Contains(starter.ClassIDs, "warrior") {
		t.Fatalf("shop is missing a warrior-compatible Wooden Club: %+v", starter)
	}
	if err := game.BuyItem(interior.NodeID, starter.StockID); err != nil {
		t.Fatalf("buy starter item: %v", err)
	}
	afterPurchase := game.State()
	if afterPurchase.Gold != initial.Gold-starter.Price {
		t.Fatalf("gold after purchase = %d, want %d", afterPurchase.Gold, initial.Gold-starter.Price)
	}
	if !hasItem(afterPurchase.Items, "wpn_wooden_club", 1) {
		t.Fatalf("purchased Wooden Club missing from inventory: %+v", afterPurchase.Items)
	}

	state, err = game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "exit-interior"})
	if err != nil {
		t.Fatalf("return to town: %v", err)
	}
	if state.CurrentLocation.Kind != LocationSettlement || state.CurrentLocation.Anchor != "general-store-return" {
		t.Fatalf("store return = %+v", state.CurrentLocation)
	}

	roundTrip, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "south-exit"})
	if err != nil {
		t.Fatalf("return to overworld: %v", err)
	}
	if roundTrip.CurrentLocation.Kind != LocationWorld || roundTrip.CurrentLocation.WorldNodeID != initial.SettlementEntryNodeID {
		t.Fatalf("world return = %+v", roundTrip.CurrentLocation)
	}

	assertRoundTripState(t, afterPurchase, roundTrip)
}

func TestLocationTransitionsRespectNavigablePhases(t *testing.T) {
	t.Run("quest complete can continue into the reached settlement", func(t *testing.T) {
		game := newTownTestGame(t)
		game.phase = "quest_complete"
		initial := game.State()
		state, err := game.ProcessLocationTransition(LocationTransitionRequest{
			TransitionID: "enter-settlement",
			WorldNodeID:  initial.SettlementEntryNodeID,
		})
		if err != nil {
			t.Fatalf("enter settlement: %v", err)
		}
		if state.CurrentLocation.Kind != LocationSettlement {
			t.Fatalf("location = %q, want settlement", state.CurrentLocation.Kind)
		}
	})

	t.Run("promotion cannot mutate location", func(t *testing.T) {
		game := newTownTestGame(t)
		game.phase = "promotion"
		initial := game.State()
		_, err := game.ProcessLocationTransition(LocationTransitionRequest{
			TransitionID: "enter-settlement",
			WorldNodeID:  initial.SettlementEntryNodeID,
		})
		if err == nil {
			t.Fatal("promotion accepted a location transition")
		}
		if got := game.State().CurrentLocation.Kind; got != LocationWorld {
			t.Fatalf("rejected transition mutated location to %q", got)
		}
	})
}

func TestWorldArrivalRequiresAdjacentAuthoredNode(t *testing.T) {
	game := newTownTestGame(t)
	start := game.State().CurrentLocation.WorldNodeID
	neighbors := game.loc.Neighbors(start)
	if len(neighbors) == 0 {
		t.Fatal("test locality has no adjacent node")
	}
	state, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID: "arrive-world-node",
		WorldNodeID:  neighbors[0],
	})
	if err != nil {
		t.Fatalf("adjacent on-foot arrival: %v", err)
	}
	if state.CurrentLocation.WorldNodeID != neighbors[0] {
		t.Fatalf("arrival node = %q, want %q", state.CurrentLocation.WorldNodeID, neighbors[0])
	}

	var remote string
	for _, node := range game.loc.Nodes {
		if node.ID != neighbors[0] && !slices.Contains(game.loc.Neighbors(neighbors[0]), node.ID) {
			remote = node.ID
			break
		}
	}
	if remote == "" {
		t.Fatal("test locality has no non-adjacent node")
	}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID: "arrive-world-node",
		WorldNodeID:  remote,
	}); err == nil {
		t.Fatal("non-adjacent world arrival accepted")
	}
	if got := game.State().CurrentLocation.WorldNodeID; got != neighbors[0] {
		t.Fatalf("rejected arrival mutated node to %q", got)
	}
}

func hasItem(items []ItemState, id string, count int) bool {
	for _, item := range items {
		if item.ID == id && item.Count == count {
			return true
		}
	}
	return false
}

func assertRoundTripState(t *testing.T, before, after GameState) {
	t.Helper()
	checks := []struct {
		name   string
		before any
		after  any
	}{
		{"gold", before.Gold, after.Gold},
		{"inventory", before.Items, after.Items},
		{"equipment and sockets", before.Equipment, after.Equipment},
		{"gems", before.Gems, after.Gems},
		{"gem recipes", before.GemRecipes, after.GemRecipes},
		{"party", before.Party, after.Party},
	}
	for _, check := range checks {
		if !reflect.DeepEqual(check.before, check.after) {
			t.Errorf("%s changed during store-to-world round trip\nbefore: %#v\nafter:  %#v", check.name, check.before, check.after)
		}
	}
}
