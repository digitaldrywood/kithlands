package api

import (
	"encoding/json"
	"reflect"
	"sync"
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

func shopMutationSnapshot(t *testing.T, game *Game) string {
	t.Helper()
	data, err := json.Marshal([]any{game.inv, game.shopStocks, game.lootRollSeq, game.spellBooks})
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
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

func TestShopPurchaseTransfersPreviewedInstanceAndRotatesOffers(t *testing.T) {
	game := newTownTestGame(t)
	nodeID := enterStockTestShop(t, game)
	items, err := game.GetShopItems(nodeID)
	if err != nil {
		t.Fatal(err)
	}
	rolled := findStockTestOffer(t, items, "patched_mantle")
	if rolled.InstanceID == "" || rolled.StockID == "" {
		t.Fatalf("rolled offer missing exact identities: %+v", rolled)
	}
	goldBefore, lootSequenceBefore := game.inv.Gold, game.lootRollSeq
	if err := game.BuyItem(nodeID, rolled.StockID); err != nil {
		t.Fatalf("buy rolled offer: %v", err)
	}
	owned := game.inv.Instance(rolled.InstanceID)
	if owned == nil || owned.ID != rolled.InstanceID || owned.BaseID != rolled.ID {
		t.Fatalf("owned instance = %+v, want preview %s/%s", owned, rolled.ID, rolled.InstanceID)
	}
	ownedView, err := game.rolledItemState(owned.ID, owned)
	if err != nil {
		t.Fatal(err)
	}
	if ownedView.Name != rolled.Name || ownedView.Rarity != rolled.Rarity ||
		ownedView.ItemLevel != rolled.ItemLevel || ownedView.RequiredLevel != rolled.RequiredLevel ||
		!reflect.DeepEqual(ownedView.Stats, rolled.Stats) ||
		!reflect.DeepEqual(ownedView.Affixes, rolled.Affixes) ||
		!reflect.DeepEqual(ownedView.Sockets, rolled.Sockets) {
		t.Fatalf("purchased instance diverged from preview\npreview: %+v\nowned: %+v", rolled, ownedView)
	}
	if game.inv.Gold != goldBefore-rolled.Price || game.lootRollSeq != lootSequenceBefore {
		t.Fatalf("purchase gold/loot sequence = %d/%d, want %d/%d", game.inv.Gold, game.lootRollSeq, goldBefore-rolled.Price, lootSequenceBefore)
	}

	beforeReplay := shopMutationSnapshot(t, game)
	if err := game.BuyItem(nodeID, rolled.StockID); err == nil {
		t.Fatal("duplicate rolled offer purchase succeeded")
	}
	if afterReplay := shopMutationSnapshot(t, game); afterReplay != beforeReplay {
		t.Fatal("duplicate rolled offer mutated state")
	}

	items, err = game.GetShopItems(nodeID)
	if err != nil {
		t.Fatal(err)
	}
	potion := findStockTestOffer(t, items, "potion")
	if err := game.BuyItem(nodeID, potion.StockID); err != nil {
		t.Fatal(err)
	}
	beforeStale := shopMutationSnapshot(t, game)
	if err := game.BuyItem(nodeID, potion.StockID); err == nil {
		t.Fatal("stale reusable offer purchase succeeded")
	}
	if shopMutationSnapshot(t, game) != beforeStale {
		t.Fatal("stale reusable offer mutated state")
	}
	refreshed, err := game.GetShopItems(nodeID)
	if err != nil {
		t.Fatal(err)
	}
	newPotion := findStockTestOffer(t, refreshed, "potion")
	if newPotion.StockID == potion.StockID {
		t.Fatal("reusable offer did not rotate after purchase")
	}
	if err := game.BuyItem(nodeID, newPotion.StockID); err != nil {
		t.Fatalf("refreshed reusable offer failed: %v", err)
	}
}

func TestShopPurchaseAccessRejectionsAreAtomic(t *testing.T) {
	game := newTownTestGame(t)
	nodeID := enterStockTestShop(t, game)
	items, err := game.GetShopItems(nodeID)
	if err != nil {
		t.Fatal(err)
	}
	offer := findStockTestOffer(t, items, "patched_mantle")
	originalLocation, originalPhase := game.location, game.phase
	inn := game.settlementInteriors["cadott-riverlight-inn"]

	tests := []struct {
		name   string
		nodeID string
		setup  func()
	}{
		{name: "wrong node", nodeID: "cadott-riverlight-inn", setup: func() {}},
		{name: "overworld", nodeID: nodeID, setup: func() { game.location = LocationState{Kind: LocationWorld} }},
		{name: "nonshop", nodeID: "cadott-riverlight-inn", setup: func() {
			game.location = LocationState{Kind: LocationInterior, MapID: inn.NodeID, Interior: cloneMapSpawn(&inn)}
		}},
		{name: "combat", nodeID: nodeID, setup: func() { game.phase = "combat" }},
		{name: "dungeon", nodeID: nodeID, setup: func() { game.location = LocationState{Kind: "dungeon"} }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			game.mu.Lock()
			game.location, game.phase = originalLocation, originalPhase
			test.setup()
			game.mu.Unlock()
			before := shopMutationSnapshot(t, game)
			if err := game.BuyItem(test.nodeID, offer.StockID); err == nil {
				t.Fatal("unauthorized purchase succeeded")
			}
			if shopMutationSnapshot(t, game) != before {
				t.Fatal("unauthorized purchase mutated inventory or stock")
			}
		})
	}
}

func TestConcurrentShopPurchaseHasOneWinner(t *testing.T) {
	game := newTownTestGame(t)
	nodeID := enterStockTestShop(t, game)
	items, err := game.GetShopItems(nodeID)
	if err != nil {
		t.Fatal(err)
	}
	offer := findStockTestOffer(t, items, "patched_mantle")
	goldBefore := game.State().Gold
	const buyers = 12
	start := make(chan struct{})
	results := make(chan error, buyers)
	var wg sync.WaitGroup
	wg.Add(buyers)
	for range buyers {
		go func() {
			defer wg.Done()
			<-start
			results <- game.BuyItem(nodeID, offer.StockID)
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("successful concurrent buys = %d, want 1", successes)
	}
	if game.State().Gold != goldBefore-offer.Price || game.inv.Instance(offer.InstanceID) == nil {
		t.Fatal("concurrent purchase did not commit exactly one item and price")
	}
}
