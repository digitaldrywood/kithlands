package api

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func buildTestGame(t *testing.T) *Game {
	t.Helper()
	game, err := NewGameManager(gamedata.Load("../../shared"), "../../shared").CreateGame(NewGameRequest{TownName: "Test", Places: []string{"Square"}, BigBuilding: "Hall", Party: []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}, {Name: "Mira", ClassID: "mender"}}, Difficulty: "normal", RNGSeed: 99})
	if err != nil {
		t.Fatal(err)
	}
	return game
}
func saveBuild(t *testing.T, g *Game, name string) string {
	t.Helper()
	if err := g.SaveEquipmentBuild(0, "", name); err != nil {
		t.Fatal(err)
	}
	builds := g.inv.EquipmentBuilds[0]
	return builds[len(builds)-1].ID
}
func addBuildItem(t *testing.T, g *Game, base string) string {
	t.Helper()
	b := g.gd.EquipmentBaseByID(base)
	id, err := g.inv.AddInstance(inventory.EquipmentInstance{BaseID: base, Kind: b.Kind, Category: b.Category, ItemLevel: 1, RequiredLevel: 1, RarityID: "common"})
	if err != nil {
		t.Fatal(err)
	}
	return id
}
func equipBuildItem(t *testing.T, g *Game, party int, slot, id string) {
	t.Helper()
	c := g.party[party]
	if _, err := g.inv.EquipInstanceAt(party, slot, id, c.ClassID, c.Level, g.gd); err != nil {
		t.Fatal(err)
	}
}
func previewBuild(t *testing.T, g *Game, id string) EquipmentBuildPreview {
	t.Helper()
	p, err := g.PreviewEquipmentBuild(0, id)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func inventoryJSON(t *testing.T, g *Game) string {
	t.Helper()
	b, err := json.Marshal(g.inv)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestEquipmentBuildSwitchTransfersRingsAndEmptySlots(t *testing.T) {
	t.Parallel()
	g := buildTestGame(t)
	bare := saveBuild(t, g, "Travel")
	ring1 := addBuildItem(t, g, "copper_ring")
	ring2 := addBuildItem(t, g, "copper_ring")
	equipBuildItem(t, g, 0, "ring_1", ring1)
	equipBuildItem(t, g, 0, "ring_2", ring2)
	rings := saveBuild(t, g, "Lucky")
	// Reverse positions, then lend the first ring to Mira.
	equipBuildItem(t, g, 0, "ring_1", ring2)
	equipBuildItem(t, g, 1, "ring_2", ring1)
	before := inventoryJSON(t, g)
	p := previewBuild(t, g, rings)
	if len(p.Reasons) > 0 || !p.RequiresTransfer || len(p.Changes) != 3 || len(p.Slots) != 12 {
		t.Fatalf("preview = %+v", p)
	}
	if inventoryJSON(t, g) != before {
		t.Fatal("preview mutated inventory")
	}
	if err := g.ApplyEquipmentBuild(0, rings, p.Token, false); err == nil {
		t.Fatal("transfer applied without confirmation")
	}
	if inventoryJSON(t, g) != before {
		t.Fatal("rejected transfer mutated inventory")
	}
	if err := g.ApplyEquipmentBuild(0, rings, p.Token, true); err != nil {
		t.Fatal(err)
	}
	if g.inv.Equipment[0].Equipped("ring_1").InstanceID != ring1 || g.inv.Equipment[0].Equipped("ring_2").InstanceID != ring2 || g.inv.Equipment[1].Equipped("ring_2").ItemID != "" {
		t.Fatal("ring transfer mismatch")
	}
	p = previewBuild(t, g, bare)
	if err := g.ApplyEquipmentBuild(0, bare, p.Token, false); err != nil {
		t.Fatal(err)
	}
	if g.inv.Equipment[0].Equipped("ring_1").ItemID != "" || g.inv.Equipment[0].Equipped("ring_2").ItemID != "" || g.inv.Instance(ring1) == nil || g.inv.Instance(ring2) == nil {
		t.Fatal("empty slots lost gear")
	}
}

func TestEquipmentBuildRejectsInvalidAndStaleWithoutMutation(t *testing.T) {
	for _, tc := range []struct {
		name, want string
		change     func(*Game, string)
	}{
		{"missing", "missing or sold", func(g *Game, id string) { delete(g.inv.Instances, id) }},
		{"duplicate", "referenced twice", func(g *Game, id string) {
			g.inv.EquipmentBuilds[0][0].Slots["ring_2"] = g.inv.EquipmentBuilds[0][0].Slots["ring_1"]
		}},
		{"level", "not eligible", func(g *Game, id string) { g.inv.Instance(id).RequiredLevel = 99 }},
		{"class", "not eligible", func(g *Game, id string) { g.party[0].ClassID = "missing_class" }},
		{"wrong slot", "not eligible", func(g *Game, id string) {
			b := &g.inv.EquipmentBuilds[0][0]
			b.Slots["head"] = b.Slots["ring_1"]
			delete(b.Slots, "ring_1")
		}},
		{"unknown slot", "no longer exists", func(g *Game, id string) {
			g.inv.EquipmentBuilds[0][0].Slots["missing_slot"] = inventory.EquippedItemRef{}
		}},
		{"stale gear", "stale", func(g *Game, id string) { equipBuildItem(t, g, 1, "ring_1", id) }},
		{"stale sockets", "stale", func(g *Game, id string) { g.inv.Instance(id).Sockets = []inventory.ItemSocket{{}} }},
		{"stale build", "stale", func(g *Game, id string) { g.inv.EquipmentBuilds[0][0].Name = "Changed" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := buildTestGame(t)
			id := addBuildItem(t, g, "copper_ring")
			equipBuildItem(t, g, 0, "ring_1", id)
			build := saveBuild(t, g, "Lucky")
			p := previewBuild(t, g, build)
			tc.change(g, id)
			before := inventoryJSON(t, g)
			err := g.ApplyEquipmentBuild(0, build, p.Token, true)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error=%v want %q", err, tc.want)
			}
			if inventoryJSON(t, g) != before {
				t.Fatal("failure partially applied")
			}
		})
	}
}

func TestEquipmentBuildStaticQuantities(t *testing.T) {
	t.Parallel()
	g := buildTestGame(t)
	g.inv.Equipment[0] = inventory.EquipmentSlots{WeaponID: "short_sword", ArmorID: "leather_armor"}
	id := saveBuild(t, g, "Legacy")
	p := previewBuild(t, g, id)
	if err := g.ApplyEquipmentBuild(0, id, p.Token, false); err != nil {
		t.Fatal(err)
	}
	if g.inv.Consumables["wpn_short_sword"] != 0 {
		t.Fatal("static duplication")
	}
	replacement := addBuildItem(t, g, "iron_sword")
	prior := g.inv.Equipment[0].Equipped("main_hand")
	equipBuildItem(t, g, 0, "main_hand", replacement)
	returnRecommendedStaticToInventory(g.inv, prior, g.gd)
	p = previewBuild(t, g, id)
	if err := g.ApplyEquipmentBuild(0, id, p.Token, false); err != nil {
		t.Fatal(err)
	}
	if g.inv.Consumables["wpn_short_sword"] != 0 || g.inv.Instance(replacement) == nil {
		t.Fatal("static replacement accounting")
	}
	ref, err := g.inv.UnequipAt(0, "main_hand", g.gd)
	if err != nil {
		t.Fatal(err)
	}
	returnRecommendedStaticToInventory(g.inv, ref, g.gd)
	delete(g.inv.Consumables, "wpn_short_sword")
	before := inventoryJSON(t, g)
	p = previewBuild(t, g, id)
	if len(p.Reasons) == 0 || p.Token != "" {
		t.Fatal("unavailable static quantity accepted")
	}
	if err := g.ApplyEquipmentBuild(0, id, "", true); err == nil {
		t.Fatal("missing static applied")
	}
	if inventoryJSON(t, g) != before {
		t.Fatal("static failure mutated inventory")
	}
}

func TestEquipmentBuildPersistenceNamesLimitsAndDelete(t *testing.T) {
	t.Parallel()
	g := buildTestGame(t)
	for _, name := range []string{"", "   ", strings.Repeat("a", 33), "<b>gear</b>", "two\nlines", "a\u202eb"} {
		if err := g.SaveEquipmentBuild(0, "", name); err == nil {
			t.Fatalf("accepted name %q", name)
		}
	}
	id := saveBuild(t, g, "Travel")
	saveBuild(t, g, "Lucky")
	saveBuild(t, g, "Guard")
	if err := g.SaveEquipmentBuild(0, "", "Fourth"); err == nil {
		t.Fatal("limit bypassed")
	}
	if err := g.SaveEquipmentBuild(0, id, "lucky"); err == nil {
		t.Fatal("duplicate name accepted")
	}
	if err := g.SaveEquipmentBuild(0, id, "New travel"); err != nil {
		t.Fatal(err)
	}
	ss, err := g.ToSaveState("Build save", "user")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(g.inv.EquipmentBuilds, loaded.inv.EquipmentBuilds) {
		t.Fatal("builds not preserved")
	}
	clone := g.inv.Clone()
	clone.EquipmentBuilds[0][0].Slots["main_hand"] = inventory.EquippedItemRef{}
	if reflect.DeepEqual(clone.EquipmentBuilds, g.inv.EquipmentBuilds) {
		t.Fatal("build clone shares slots")
	}
	before := inventoryJSON(t, g)
	if err := g.DeleteEquipmentBuild(0, id); err != nil {
		t.Fatal(err)
	}
	var beforeItems, afterItems map[string]json.RawMessage
	if err := json.Unmarshal([]byte(before), &beforeItems); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(inventoryJSON(t, g)), &afterItems); err != nil {
		t.Fatal(err)
	}
	delete(beforeItems, "equipment_builds")
	delete(afterItems, "equipment_builds")
	if !reflect.DeepEqual(beforeItems, afterItems) {
		t.Fatal("delete changed items")
	}
	var old map[string]json.RawMessage
	if err := json.Unmarshal(ss.Inventory, &old); err != nil {
		t.Fatal(err)
	}
	delete(old, "equipment_builds")
	ss.Inventory, err = json.Marshal(old)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err = FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.inv.EquipmentBuilds[0]) != 0 {
		t.Fatal("old save gained builds")
	}
}

func TestEquipmentBuildPhaseAndMemberGuards(t *testing.T) {
	t.Parallel()
	g := buildTestGame(t)
	id := saveBuild(t, g, "Travel")
	p := previewBuild(t, g, id)
	for _, phase := range []string{"combat", "victory", "defeat", "promotion", ""} {
		g.phase = phase
		before := inventoryJSON(t, g)
		if err := g.ApplyEquipmentBuild(0, id, p.Token, true); err == nil {
			t.Fatalf("applied in %q", phase)
		}
		if err := g.SaveEquipmentBuild(0, "", "Blocked"); err == nil {
			t.Fatal("saved in blocked phase")
		}
		if err := g.DeleteEquipmentBuild(0, id); err == nil {
			t.Fatal("deleted in blocked phase")
		}
		if inventoryJSON(t, g) != before {
			t.Fatal("blocked phase mutated")
		}
	}
	g.phase = "world"
	for _, slot := range []int{-1, 2, 4, 999} {
		if _, err := g.PreviewEquipmentBuild(slot, id); err == nil {
			t.Fatal("invalid member accepted")
		}
	}
}

func TestEquipmentBuildFollowsCharacterFormation(t *testing.T) {
	g := buildTestGame(t)
	id := saveBuild(t, g, "Ayla travel")
	if _, err := g.UpdateFormation(nil, []int{1, 0}); err != nil {
		t.Fatal(err)
	}
	if len(g.inv.EquipmentBuilds[0]) != 0 || g.inv.EquipmentBuilds[1][0].ID != id {
		t.Fatal("build did not follow character")
	}
	preview, err := g.PreviewEquipmentBuild(1, id)
	if err != nil {
		t.Fatal(err)
	}
	if preview.CharacterName != "Ayla" {
		t.Fatal("wrong build owner")
	}
}

func TestEquipmentBuildFollowsChangedInstance(t *testing.T) {
	t.Parallel()
	g := buildTestGame(t)
	id := saveBuild(t, g, "Travel")
	ref := g.inv.EquipmentBuilds[0][0].Slots["main_hand"]
	// A recipe may change an existing item while preserving its stable ID.
	g.inv.Instance(ref.InstanceID).BaseID = "short_sword"
	p := previewBuild(t, g, id)
	if len(p.Reasons) != 0 {
		t.Fatalf("instance upgrade rejected: %v", p.Reasons)
	}
	if err := g.ApplyEquipmentBuild(0, id, p.Token, false); err != nil {
		t.Fatal(err)
	}
	equipped := g.inv.Equipment[0].Equipped("main_hand")
	if equipped.InstanceID != ref.InstanceID || equipped.ItemID != "short_sword" {
		t.Fatalf("instance identity not followed: %+v", equipped)
	}
	if g.inv.EquipmentBuilds[0][0].Slots["main_hand"] != ref {
		t.Fatal("preview/apply rewrote saved intention")
	}
}

func TestEquipmentBuildCanClearEverySlot(t *testing.T) {
	t.Parallel()
	g := buildTestGame(t)
	current := g.inv.Equipment[0]
	g.inv.Equipment[0] = inventory.EquipmentSlots{}
	id := saveBuild(t, g, "Unarmed")
	g.inv.Equipment[0] = current
	owned := len(g.inv.Instances)
	p := previewBuild(t, g, id)
	if err := g.ApplyEquipmentBuild(0, id, p.Token, false); err != nil {
		t.Fatal(err)
	}
	for _, slot := range g.gd.Items.EquipmentSlots {
		if ref := g.inv.Equipment[0].Equipped(slot.ID); ref.ItemID != "" || ref.InstanceID != "" {
			t.Fatalf("slot %s retained item %+v", slot.ID, ref)
		}
	}
	if len(g.inv.Instances) != owned {
		t.Fatal("clearing loadout changed item ownership")
	}
}

func TestEquipmentBuildRestoresLegacyStaticShieldAndHelmet(t *testing.T) {
	t.Parallel()
	g := buildTestGame(t)
	shield := g.gd.Items.Shields[0].ID
	helmet := g.gd.Items.Helmets[0].ID
	g.inv.Equipment[0].ShieldID = shield
	g.inv.Equipment[0].HelmetID = helmet
	ss, err := g.ToSaveState("legacy defense", "user")
	if err != nil {
		t.Fatal(err)
	}
	g, err = FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if g.inv.Equipment[0].Equipped("off_hand").ItemID != shield || g.inv.Equipment[0].Equipped("head").ItemID != helmet {
		t.Fatal("legacy defenses were not normalized")
	}
	defense := saveBuild(t, g, "Legacy defense")
	equipped := g.inv.Equipment[0]
	g.inv.Equipment[0] = inventory.EquipmentSlots{}
	empty := saveBuild(t, g, "Unarmed")
	g.inv.Equipment[0] = equipped
	keys := map[string]string{"off_hand": equipmentStateID("shield", shield), "head": equipmentStateID("helmet", helmet)}
	owned := len(g.inv.Instances)
	for i := 0; i < 2; i++ {
		p := previewBuild(t, g, empty)
		if err := g.ApplyEquipmentBuild(0, empty, p.Token, false); err != nil {
			t.Fatal(err)
		}
		for slot, key := range keys {
			if g.inv.Equipment[0].Equipped(slot).ItemID != "" || g.inv.Consumables[key] != 1 {
				t.Fatalf("clear %s lost or duplicated gear: %d", slot, g.inv.Consumables[key])
			}
		}
		p = previewBuild(t, g, defense)
		if err := g.ApplyEquipmentBuild(0, defense, p.Token, false); err != nil {
			t.Fatal(err)
		}
		for slot, key := range keys {
			if g.inv.Equipment[0].Equipped(slot).ItemID == "" || g.inv.Consumables[key] != 0 {
				t.Fatalf("restore %s lost or duplicated gear: %d", slot, g.inv.Consumables[key])
			}
		}
	}
	if len(g.inv.Instances) != owned {
		t.Fatal("static build switching changed instance ownership")
	}
}
