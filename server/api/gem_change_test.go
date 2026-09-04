package api

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func socketStarterGem(t *testing.T, g *Game) string {
	t.Helper()
	id := g.inv.Equipment[0].WeaponInstanceID
	req := previewGemChange(t, g, GemChangeRequest{
		Action: inventory.GemActionSocket, InstanceID: id, Socket: 0, GemID: "ember_shard",
	})
	if err := g.ApplyGemChange(req); err != nil {
		t.Fatalf("socket starter gem: %v", err)
	}
	return id
}

func TestGemReplacementAndRecoveryPreserveBuildInstancePreviewAndSave(t *testing.T) {
	t.Parallel()
	g := newGemGame(t)
	id := socketStarterGem(t, g)
	g.inv.Gems["ward_shard"] = 1
	g.inv.DiscoverGemRecipes(g.gd)
	if err := g.SaveEquipmentBuild(0, "", "Ward route"); err != nil {
		t.Fatal(err)
	}
	build := g.inv.EquipmentBuilds[0][0]

	replace := previewGemChange(t, g, GemChangeRequest{
		Action: inventory.GemActionReplace, InstanceID: id, Socket: 0, GemID: "ward_shard",
	})
	g.mu.Lock()
	replacePreview, _ := g.planGemChangeLocked(replace)
	g.mu.Unlock()
	if replacePreview.GoldCost != g.gd.Loot.Workshop.Replacement.GoldCost || replacePreview.GoldBefore != 100 || replacePreview.GoldAfter != 90 {
		t.Fatalf("replacement gold preview = %+v", replacePreview)
	}
	if replacePreview.InstalledGemID != "ember_shard" || replacePreview.GemID != "ward_shard" ||
		replacePreview.After["power"] != replacePreview.Before["power"]-1 ||
		replacePreview.After["hit_pct"] != replacePreview.Before["hit_pct"]+2 ||
		replacePreview.CharacterAfter["attack"] != replacePreview.CharacterBefore["attack"]-1 {
		t.Fatalf("replacement stat preview = %+v", replacePreview)
	}
	if err := g.ApplyGemChange(replace); err != nil {
		t.Fatalf("replace gem: %v", err)
	}
	if g.inv.Gold != 90 || g.inv.Instance(id).ID != id || g.inv.Instance(id).Sockets[0].GemID != "ward_shard" {
		t.Fatalf("replacement state = gold %d item %+v", g.inv.Gold, g.inv.Instance(id))
	}
	if g.inv.Gems["ember_shard"] != 2 || g.inv.Gems["ward_shard"] != 0 {
		t.Fatalf("replacement fabricated or returned material: %v", g.inv.Gems)
	}
	if got := g.inv.EquipmentBuilds[0][0]; got.ID != build.ID || got.Name != build.Name || got.Slots["main_hand"].InstanceID != id {
		t.Fatalf("replacement changed named build: %+v", got)
	}

	saved, err := g.ToSaveState("Gem service save", "player")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if restored.inv.Gold != 90 || restored.inv.Instance(id).Sockets[0].GemID != "ward_shard" || restored.inv.EquipmentBuilds[0][0].Slots["main_hand"].InstanceID != id {
		t.Fatalf("replacement did not survive save: %+v", restored.inv)
	}

	recoverReq := previewGemChange(t, restored, GemChangeRequest{
		Action: inventory.GemActionRecover, InstanceID: id, Socket: 0,
	})
	restored.mu.Lock()
	recoverPreview, _ := restored.planGemChangeLocked(recoverReq)
	restored.mu.Unlock()
	if recoverPreview.GoldCost != restored.gd.Loot.Workshop.Recovery.GoldCost || recoverPreview.GoldBefore != 90 || recoverPreview.GoldAfter != 65 ||
		recoverPreview.Before["hit_pct"] != recoverPreview.After["hit_pct"]+2 {
		t.Fatalf("recovery preview = %+v", recoverPreview)
	}
	if err := restored.ApplyGemChange(recoverReq); err != nil {
		t.Fatalf("recover gem: %v", err)
	}
	if restored.inv.Gold != 65 || restored.inv.Instance(id).Sockets[0].GemID != "" || restored.inv.Gems["ward_shard"] != 1 {
		t.Fatalf("recovery state = gold %d gems %v item %+v", restored.inv.Gold, restored.inv.Gems, restored.inv.Instance(id))
	}
	if !restored.inv.KnownGemRecipes["convert_ember_to_ward"] || restored.inv.EquipmentBuilds[0][0].Slots["main_hand"].InstanceID != id {
		t.Fatal("recovery lost recipe discovery or named build identity")
	}
}

func TestConcurrentRecoveryAcceptsOneFreshPreview(t *testing.T) {
	t.Parallel()
	g := newGemGame(t)
	id := socketStarterGem(t, g)
	req := previewGemChange(t, g, GemChangeRequest{
		Action: inventory.GemActionRecover, InstanceID: id, Socket: 0,
	})
	results := make(chan error, 12)
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- g.ApplyGemChange(req)
		}()
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else if !strings.Contains(err.Error(), "stale") {
			t.Errorf("duplicate recovery error = %v, want stale preview", err)
		}
	}
	if success != 1 || g.inv.Gold != 75 || g.inv.Gems["ember_shard"] != 3 || g.inv.Instance(id).Sockets[0].GemID != "" {
		t.Fatalf("concurrent recovery = successes %d gold %d gems %v", success, g.inv.Gold, g.inv.Gems)
	}
}

func TestGemChangeRejectsStaleAndClientSuppliedPricingWithoutMutation(t *testing.T) {
	t.Parallel()
	g := newGemGame(t)
	id := socketStarterGem(t, g)
	g.inv.Gems["ward_shard"] = 1
	req := previewGemChange(t, g, GemChangeRequest{
		Action: inventory.GemActionReplace, InstanceID: id, Socket: 0, GemID: "ward_shard",
	})
	g.inv.Gold--
	before, err := json.Marshal(g.inv)
	if err != nil {
		t.Fatal(err)
	}
	if err := g.ApplyGemChange(req); err == nil || !strings.Contains(err.Error(), "stale") {
		t.Fatalf("stale replacement error = %v", err)
	}
	after, err := json.Marshal(g.inv)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("stale replacement mutated inventory")
	}

	fresh := previewGemChange(t, g, GemChangeRequest{
		Action: inventory.GemActionReplace, InstanceID: id, Socket: 0, GemID: "ward_shard",
	})
	s := NewServer(nil, g.gd, "../../shared")
	s.games.games[g.id] = g
	body := fmt.Sprintf(`{"action":"replace","instance_id":%q,"socket":0,"gem_id":"ward_shard","token":%q,"gold_cost":0}`, id, fresh.Token)
	httpReq := httptest.NewRequest("POST", "/", strings.NewReader(body))
	httpReq.SetPathValue("id", g.id)
	rec := httptest.NewRecorder()
	s.handleGemChange(rec, httpReq)
	if rec.Code != 400 {
		t.Fatalf("client price status = %d, want 400", rec.Code)
	}
	if g.inv.Instance(id).Sockets[0].GemID != "ember_shard" || g.inv.Gems["ward_shard"] != 1 || g.inv.Gold != 99 {
		t.Fatal("client-supplied price changed authoritative state")
	}
}

func TestGemChangePreviewIncludesZeroGoldAfter(t *testing.T) {
	t.Parallel()
	g := newGemGame(t)
	id := socketStarterGem(t, g)
	g.inv.Gold = g.gd.Loot.Workshop.Replacement.GoldCost
	g.inv.Gems["ward_shard"] = 1

	g.mu.Lock()
	preview, _ := g.planGemChangeLocked(GemChangeRequest{
		Action: inventory.GemActionReplace, InstanceID: id, Socket: 0, GemID: "ward_shard",
	})
	g.mu.Unlock()
	if !preview.Allowed || preview.GoldAfter != 0 {
		t.Fatalf("zero-gold replacement preview = %+v", preview)
	}
	payload, err := json.Marshal(preview)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(payload), `"gold_after":0`) {
		t.Fatalf("zero gold omitted from preview: %s", payload)
	}
}
