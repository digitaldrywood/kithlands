package api

import (
	"reflect"
	"testing"
)

func enterStockTestShop(t *testing.T, game *Game) string {
	t.Helper()
	entryNodeID := game.State().SettlementEntryNodeID
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID: "enter-settlement", WorldNodeID: entryNodeID,
	}); err != nil {
		t.Fatalf("enter settlement: %v", err)
	}
	state, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "general-store-door"})
	if err != nil {
		t.Fatalf("enter shop: %v", err)
	}
	return state.CurrentLocation.MapID
}

func findStockTestOffer(t *testing.T, items []ShopItemState, itemID string) ShopItemState {
	t.Helper()
	for _, item := range items {
		if item.ID == itemID {
			return item
		}
	}
	t.Fatalf("shop offer %q not found", itemID)
	return ShopItemState{}
}

func TestShopListingsRequireAuthoritativeCurrentInterior(t *testing.T) {
	game := newTownTestGame(t)
	if _, err := game.GetShopItems("shop"); err == nil {
		t.Fatal("overworld listing accepted")
	}
	if len(game.shopStocks) != 0 {
		t.Fatal("rejected overworld listing generated stock")
	}

	entryNodeID := game.State().SettlementEntryNodeID
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{
		TransitionID: "enter-settlement", WorldNodeID: entryNodeID,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "inn-door"}); err != nil {
		t.Fatal(err)
	}
	if _, err := game.GetShopItems("cadott-riverlight-inn"); err == nil {
		t.Fatal("nonshop interior listing accepted")
	}
	if len(game.shopStocks) != 0 {
		t.Fatal("rejected nonshop listing generated stock")
	}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "exit-interior"}); err != nil {
		t.Fatal(err)
	}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "general-store-door"}); err != nil {
		t.Fatal(err)
	}

	items, err := game.GetShopItems("cadott-general-store")
	if err != nil || len(items) == 0 {
		t.Fatalf("current shop listing = %d items, %v", len(items), err)
	}
	before := append([]ShopItemState(nil), items...)
	if _, err := game.GetShopItems("cadott-riverlight-inn"); err == nil {
		t.Fatal("wrong-node listing accepted")
	}
	game.mu.Lock()
	game.phase = "combat"
	game.mu.Unlock()
	if _, err := game.GetShopItems("cadott-general-store"); err == nil {
		t.Fatal("combat listing accepted")
	}
	game.mu.Lock()
	game.phase = "quest_complete"
	game.mu.Unlock()
	after, err := game.GetShopItems("cadott-general-store")
	if err != nil || !reflect.DeepEqual(after, before) {
		t.Fatalf("quest-complete listing changed frozen stock: %v", err)
	}
}
