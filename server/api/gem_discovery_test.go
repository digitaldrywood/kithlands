package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func newGemGame(t *testing.T) *Game {
	t.Helper()
	gd := gamedata.Load("../../shared")
	g, err := NewGameManager(gd, "../../shared").CreateGame(NewGameRequest{TownName: "Gem Town", Places: []string{"Square"}, BigBuilding: "Hall", Party: []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}}, Difficulty: "normal", RNGSeed: 42})
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func TestEarnedGemDiscoveryPersistsThroughSocketAndSave(t *testing.T) {
	t.Parallel()
	g := newGemGame(t)
	if g.inv.KnownGemRecipes["convert_ember_to_ward"] {
		t.Fatal("Ward discovered before acquisition")
	}
	if _, err := g.grantLoot("ward_shard", 1, 0); err != nil {
		t.Fatal(err)
	}
	if !g.inv.KnownGemRecipes["convert_ember_to_ward"] {
		t.Fatal("normal loot grant did not discover recipe")
	}
	if err := g.CraftGem(CraftGemRequest{RecipeID: "convert_ember_to_ward"}); err != nil {
		t.Fatal(err)
	}
	id := g.inv.Equipment[0].WeaponInstanceID
	if err := g.SocketGem(SocketGemRequest{InstanceID: id, GemID: "ember_shard", Socket: 0}); err != nil {
		t.Fatal(err)
	}
	if g.inv.Gems["ember_shard"] != 0 {
		t.Fatal("socket failed to spend remaining shard")
	}
	saved, err := g.ToSaveState("Gem save", "player")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if !restored.inv.KnownGemRecipes["convert_ember_to_ward"] || !restored.inv.KnownGemRecipes["convert_ward_to_ember"] {
		t.Fatal("discovery lost on load")
	}
	if restored.inv.Instance(id).Sockets[0].GemID != "ember_shard" {
		t.Fatal("socket lost on load")
	}
	for _, r := range restored.State().GemRecipes {
		if r.ID == "convert_ember_to_ward" && (!r.Known || r.Craftable || r.BlockReason == "") {
			t.Fatalf("spent recipe projection: %+v", r)
		}
	}
	// A pre-discovery save still knows all four upgrades, and migrates a family
	// discovered by a gem installed on an equipped legacy instance.
	var legacy inventory.Inventory
	if err := json.Unmarshal(saved.Inventory, &legacy); err != nil {
		t.Fatal(err)
	}
	legacy.KnownGemRecipes = nil
	legacy.Gems = nil
	legacy.Instance(id).Sockets[0].GemID = "ward_gem"
	saved.Inventory, err = json.Marshal(&legacy)
	if err != nil {
		t.Fatal(err)
	}
	old, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"refine_ember_gem", "refine_ember_crystal", "refine_ward_gem", "refine_ward_crystal", "recover_ward_shards", "convert_ember_to_ward"} {
		if !old.inv.KnownGemRecipes[id] {
			t.Errorf("old save missing recipe %s", id)
		}
	}
	if old.inv.KnownGemRecipes["recover_ward_gems"] {
		t.Fatal("Gem incorrectly discovered Crystal recipe")
	}
}

func TestGemMutationPhasePolicy(t *testing.T) {
	t.Parallel()
	for _, phase := range []string{"combat", "victory", "defeat", "promotion"} {
		t.Run(phase, func(t *testing.T) {
			g := newGemGame(t)
			g.phase = phase
			before, err := json.Marshal(g.inv)
			if err != nil {
				t.Fatal(err)
			}
			if err := g.CraftGem(CraftGemRequest{RecipeID: "refine_ember_gem"}); err == nil {
				t.Fatal("craft allowed in blocked phase")
			}
			if err := g.SocketGem(SocketGemRequest{InstanceID: g.inv.Equipment[0].WeaponInstanceID, GemID: "ember_shard"}); err == nil {
				t.Fatal("socket allowed in blocked phase")
			}
			after, err := json.Marshal(g.inv)
			if err != nil {
				t.Fatal(err)
			}
			if string(before) != string(after) {
				t.Fatal("phase rejection mutated inventory")
			}
			for _, r := range g.State().GemRecipes {
				if r.Craftable {
					t.Fatal("blocked recipe projected craftable")
				}
			}
		})
	}
}

func TestConcurrentGemRequestsConsumeOneFullTransaction(t *testing.T) {
	t.Parallel()
	g := newGemGame(t)
	results := make(chan error, 12)
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- g.CraftGem(CraftGemRequest{RecipeID: "refine_ember_gem"})
		}()
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		}
	}
	if success != 1 || g.inv.Gems["ember_gem"] != 1 || g.inv.Gems["ember_shard"] != 0 {
		t.Fatalf("repeated craft: successes %d gems %v", success, g.inv.Gems)
	}
	id := g.inv.Equipment[0].WeaponInstanceID
	results = make(chan error, 12)
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- g.SocketGem(SocketGemRequest{InstanceID: id, GemID: "ember_gem"})
		}()
	}
	wg.Wait()
	close(results)
	success = 0
	for err := range results {
		if err == nil {
			success++
		}
	}
	if success != 1 || len(g.inv.Gems) != 0 || g.inv.Instance(id).Sockets[0].GemID != "ember_gem" {
		t.Fatal("repeated socket duplicated or lost gems")
	}
}

func TestGemHandlersRejectMalformedRequests(t *testing.T) {
	t.Parallel()
	g := newGemGame(t)
	s := NewServer(nil, g.gd, "../../shared")
	s.games.games[g.id] = g
	for _, body := range []string{`{}`, `{"recipe_id":"missing"}`, `{"recipe_id":"refine_ember_gem","output":{"gem_id":"ward_crystal"}}`, `{"recipe_id":"refine_ember_gem"}{}`, `{"recipe_id":7}`, `{"recipe_id":"convert_ember_to_ward"}`} {
		req := httptest.NewRequest("POST", "/", strings.NewReader(body))
		req.SetPathValue("id", g.id)
		rec := httptest.NewRecorder()
		s.handleCraftGem(rec, req)
		if rec.Code != 400 {
			t.Fatalf("body %s status %d", body, rec.Code)
		}
		if g.inv.Gems["ember_shard"] != 3 || len(g.inv.Gems) != 1 {
			t.Fatalf("bad body mutated inputs: %s", body)
		}
	}
}

func TestGemSocketPreviewResolvesAccessoriesWithoutMutation(t *testing.T) {
	t.Parallel()
	g := newGemGame(t)
	id, err := g.inv.AddInstance(inventory.EquipmentInstance{BaseID: "copper_ring", Kind: "accessory", Category: "ring", ItemLevel: 1, RequiredLevel: 1, RarityID: "magic", Sockets: []inventory.ItemSocket{{}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.inv.EquipInstanceAt(0, "ring_1", id, "warrior", 1, g.gd); err != nil {
		t.Fatal(err)
	}
	before, err := json.Marshal(g.inv)
	if err != nil {
		t.Fatal(err)
	}
	view, err := g.rolledItemState(id, g.inv.Instance(id))
	if err != nil {
		t.Fatal(err)
	}
	if len(view.SocketPreviews) != 1 {
		t.Fatalf("socket previews = %v", view.SocketPreviews)
	}
	p := view.SocketPreviews[0]
	if !p.Allowed || p.After["str"]-p.Before["str"] != 1 || p.GearAfter["str"]-p.GearBefore["str"] != 1 {
		t.Fatalf("accessory preview = %+v", p)
	}
	after, err := json.Marshal(g.inv)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("preview mutated inventory")
	}
	if err := g.SocketGem(SocketGemRequest{InstanceID: id, GemID: p.GemID, Socket: p.Socket}); err != nil {
		t.Fatal(err)
	}
	applied, err := inventory.ResolveInstance(g.inv.Instance(id), g.gd)
	if err != nil {
		t.Fatal(err)
	}
	if applied.Stats["str"] != p.After["str"] {
		t.Fatal("preview disagrees with mutation")
	}
}
