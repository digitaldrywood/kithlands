package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

func enterCadottShop(t *testing.T, game *api.Game) (string, []api.ShopItemState) {
	t.Helper()
	entryNodeID := game.State().SettlementEntryNodeID
	if _, err := game.ProcessLocationTransition(api.LocationTransitionRequest{
		TransitionID: "enter-settlement", WorldNodeID: entryNodeID,
	}); err != nil {
		t.Fatalf("enter settlement: %v", err)
	}
	state, err := game.ProcessLocationTransition(api.LocationTransitionRequest{TransitionID: "general-store-door"})
	if err != nil {
		t.Fatalf("enter shop: %v", err)
	}
	nodeID := state.CurrentLocation.Interior.NodeID
	items, err := game.GetShopItems(nodeID)
	if err != nil {
		t.Fatalf("get shop items: %v", err)
	}
	return nodeID, items
}

func findItem(items []any, id string) map[string]any {
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if item["id"] == id {
			return item
		}
	}
	return nil
}

func hasShopItem(items []map[string]any, id string) bool {
	for _, item := range items {
		if item["id"] == id {
			return true
		}
	}
	return false
}

func TestShopBuyCategoriesPreserveGoldAndInventoryState(t *testing.T) {
	srv, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", map[string]any{
		"town_name":     "Cadott",
		"people":        []map[string]any{{"name": "A", "relation": "friendly"}},
		"places":        []string{"X"},
		"big_building":  "Hall",
		"party":         []map[string]any{{"name": "Hero", "class_id": "warrior"}},
		"difficulty":    "normal",
		"spawn_node_id": "shop",
	})
	gameID := gs["id"].(string)
	game := srv.GetGameManager().GetGame(gameID)
	if game == nil {
		t.Fatal("game not found")
	}

	_, shopItems := enterCadottShop(t, game)
	var shopCatalog []map[string]any
	for _, item := range shopItems {
		shopCatalog = append(shopCatalog, map[string]any{
			"id":    item.ID,
			"type":  item.Type,
			"price": item.Price,
		})
	}
	for _, wantID := range []string{"potion", "wooden_club", "cloth_robe", "strange_coin"} {
		if !hasShopItem(shopCatalog, wantID) {
			t.Fatalf("shop missing %s: %+v", wantID, shopCatalog)
		}
	}

	gs = post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "potion",
		"type":    "consumable",
	})
	if gs["error"] != nil {
		t.Fatalf("buy potion error: %v", gs["error"])
	}
	if got := int(gs["gold"].(float64)); got != 80 {
		t.Fatalf("gold after potion = %d, want 80", got)
	}
	if got := int(gs["potions"].(float64)); got != 6 {
		t.Fatalf("potions after potion buy = %d, want 6", got)
	}

	gs = post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "wooden_club",
		"type":    "weapon",
	})
	if gs["error"] != nil {
		t.Fatalf("buy weapon error: %v", gs["error"])
	}
	if got := int(gs["gold"].(float64)); got != 70 {
		t.Fatalf("gold after weapon = %d, want 70", got)
	}
	if got := findItem(gs["items"].([]any), "wpn_wooden_club"); got == nil {
		t.Fatal("weapon inventory missing wpn_wooden_club after buy")
	}

	gs = post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "cloth_robe",
		"type":    "armor",
	})
	if gs["error"] != nil {
		t.Fatalf("buy armor error: %v", gs["error"])
	}
	if got := int(gs["gold"].(float64)); got != 60 {
		t.Fatalf("gold after armor = %d, want 60", got)
	}
	if got := findItem(gs["items"].([]any), "arm_cloth_robe"); got == nil {
		t.Fatal("armor inventory missing arm_cloth_robe after buy")
	}

	gs = post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "strange_coin",
		"type":    "key_item",
	})
	if gs["error"] != nil {
		t.Fatalf("buy key item error: %v", gs["error"])
	}
	if got := int(gs["gold"].(float64)); got != 55 {
		t.Fatalf("gold after key item = %d, want 55", got)
	}

	shopItems, err := game.GetShopItems("cadott-general-store")
	if err != nil {
		t.Fatalf("get shop items after purchase: %v", err)
	}
	shopCatalog = shopCatalog[:0]
	for _, item := range shopItems {
		shopCatalog = append(shopCatalog, map[string]any{
			"id":    item.ID,
			"type":  item.Type,
			"price": item.Price,
		})
	}
	if hasShopItem(shopCatalog, "strange_coin") {
		t.Fatalf("key item strange_coin should disappear from shop after purchase: %+v", shopCatalog)
	}
}
