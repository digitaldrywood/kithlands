package api

import (
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

func TestGatheringReachabilityAndSavedDepletion(t *testing.T) {
	g, _ := newChestTestGame(t)
	nodes := g.State().Resources
	if len(nodes) < 4 {
		t.Fatalf("need a usable trail, got %d nodes", len(nodes))
	}
	start := WorldPosition{X: g.tileMap.PlayerX, Y: g.tileMap.PlayerY}
	for _, node := range nodes {
		if len(gatheringPath(g.tileMap, start, WorldPosition{X: node.X, Y: node.Y})) == 0 {
			t.Fatalf("unreachable node %+v", node)
		}
		if !worldTileTraversable(locality.TileType(g.tileMap.Tiles[node.Y][node.X]), worldTraversal{}) {
			t.Fatal("resource on blocked terrain")
		}
	}
	node := nodes[0]
	before := g.inv.Clone()
	if err := g.Gather(node.ID); err == nil {
		t.Fatal("accepted distant harvest")
	}
	if !reflect.DeepEqual(before, g.inv) {
		t.Fatal("distant harvest changed inventory")
	}
	g.setWorldCheckpointLocked(WorldPosition{X: node.X, Y: node.Y}, g.location.WorldNodeID)
	if err := g.Gather(node.ID); err != nil {
		t.Fatal(err)
	}
	if g.inv.Materials[node.MaterialID] != node.Quantity {
		t.Fatal("incorrect harvest quantity")
	}
	if err := g.Gather(node.ID); err == nil {
		t.Fatal("accepted repeat harvest")
	}
	saved, err := g.ToSaveState("Harvest", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if restored.inv.Materials[node.MaterialID] != node.Quantity {
		t.Fatal("lost saved materials")
	}
	found := false
	for _, candidate := range restored.State().Resources {
		if candidate.ID == node.ID {
			found = true
			if !candidate.Gathered {
				t.Fatal("saved harvest respawned")
			}
		}
	}
	if !found {
		t.Fatal("resource identity changed on load")
	}
	restored.setWorldCheckpointLocked(WorldPosition{X: node.X, Y: node.Y}, restored.location.WorldNodeID)
	if err := restored.Gather(node.ID); err == nil {
		t.Fatal("load allowed duplicate harvest")
	}
}

func TestFieldCraftingAtomicOutputAndCombatGuard(t *testing.T) {
	g, _ := newChestTestGame(t)
	g.inv.Normalize()
	before := g.inv.Clone()
	if err := g.CraftFieldRecipe("forge_iron_sword"); err == nil {
		t.Fatal("accepted missing ingredients")
	}
	if !reflect.DeepEqual(before, g.inv) {
		t.Fatal("failed recipe consumed items")
	}
	g.inv.Materials["meadow_herb"], g.inv.Materials["ember_ore"], g.inv.Materials["hardwood"] = 6, 8, 1
	for _, id := range []string{"brew_potion", "refine_ember", "forge_iron_sword"} {
		if err := g.CraftFieldRecipe(id); err != nil {
			t.Fatal(err)
		}
	}
	if g.inv.Consumables["potion"] != before.Consumables["potion"]+1 || g.inv.Gems["ember_shard"] != before.Gems["ember_shard"]+3 {
		t.Fatal("wrong potion/gem output")
	}
	if g.inv.Materials["meadow_herb"] != 4 || g.inv.Materials["ember_ore"] != 0 {
		t.Fatal("wrong material cost")
	}
	found := false
	for id, item := range g.inv.Instances {
		if before.Instances[id] == nil && item.BaseID == "iron_sword" {
			found = true
			if len(item.Sockets) != 1 || item.Sockets[0].GemID != "" || len(item.Affixes) != 0 {
				t.Fatal("incorrect crafted sword")
			}
		}
	}
	if !found {
		t.Fatal("did not create owned equipment")
	}
	g.phase = "combat"
	before = g.inv.Clone()
	if err := g.CraftFieldRecipe("brew_potion"); err == nil {
		t.Fatal("accepted combat crafting")
	}
	if err := g.Gather(g.resourceNodes()[1].ID); err == nil {
		t.Fatal("accepted combat harvest")
	}
	if !reflect.DeepEqual(before, g.inv) {
		t.Fatal("combat request changed inventory")
	}
	if err := g.CraftFieldRecipe("unknown"); err == nil {
		t.Fatal("accepted unknown recipe")
	}
}

func TestGatheringSnapshotAndInventoryCloneAreIndependent(t *testing.T) {
	g, _ := newChestTestGame(t)
	nodes := g.resourceNodes()
	nodes[0].Name = "modified"
	if g.resourceNodes()[0].Name == "modified" {
		t.Fatal("state aliases placement cache")
	}
	g.inv.Normalize()
	clone := g.inv.Clone()
	clone.Materials["meadow_herb"] = 99
	clone.GatheredResources["fake"] = true
	if g.inv.Materials["meadow_herb"] != 0 || g.inv.GatheredResources["fake"] {
		t.Fatal("clone aliases live gathering state")
	}
}

func TestCraftingProgressionAndRareGathering(t *testing.T) {
	g, _ := newChestTestGame(t)
	g.inv.Normalize()
	for _, m := range g.State().Materials {
		g.inv.Materials[m.ID] = 20
	}
	before := g.inv.Clone()
	if err := g.CraftFieldRecipe("forge_steel_sword"); err == nil {
		t.Fatal("bypassed level gate")
	}
	if !reflect.DeepEqual(before, g.inv) {
		t.Fatal("locked recipe consumed materials")
	}
	for _, scenario := range []struct {
		recipe, base   string
		level, sockets int
	}{{"forge_steel_sword", "steel_sword", 4, 1}, {"forge_mythril_sword", "mythril_sword", 8, 2}} {
		for _, member := range g.party {
			member.Level = scenario.level
		}
		if err := g.CraftFieldRecipe(scenario.recipe); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, item := range g.inv.Instances {
			if item.BaseID == scenario.base {
				found = true
				if item.RequiredLevel != scenario.level || len(item.Sockets) != scenario.sockets {
					t.Fatalf("bad progression output %+v", item)
				}
			}
		}
		if !found {
			t.Fatal("missing advanced output")
		}
	}
	rare := []ResourceNodeState{}
	for _, node := range g.State().Resources {
		if node.MaterialID == "mythril_ore" {
			rare = append(rare, node)
		}
	}
	if len(rare) != 1 {
		t.Fatalf("want one rare seam, got %d", len(rare))
	}
	for _, member := range g.party {
		member.Level = 1
	}
	g.setWorldCheckpointLocked(WorldPosition{X: rare[0].X, Y: rare[0].Y}, g.location.WorldNodeID)
	before = g.inv.Clone()
	if err := g.Gather(rare[0].ID); err == nil {
		t.Fatal("bypassed rare gathering level")
	}
	if !reflect.DeepEqual(before, g.inv) {
		t.Fatal("locked gathering changed inventory")
	}
	for _, member := range g.party {
		member.Level = 8
	}
	if err := g.Gather(rare[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := g.Gather(rare[0].ID); err == nil {
		t.Fatal("rare seam duplicated")
	}
}

func TestSupplementalResourcesPreserveExistingNodes(t *testing.T) {
	g, _ := newChestTestGame(t)
	nodes := g.resourceNodes()
	primary := []ResourceNodeState{}
	for _, node := range nodes {
		if node.MaterialID == "meadow_herb" || node.MaterialID == "ember_ore" {
			primary = append(primary, node)
		}
	}
	cfg := g.gd.Gathering
	defer func() { g.gd.Gathering = cfg }()
	g.gd.Gathering.Resources = cfg.Resources[:2]
	g.resourceMap = nil
	if !reflect.DeepEqual(primary, g.resourceNodes()) {
		t.Fatal("new resources moved saved herb/iron nodes")
	}
}

func TestGatheringPersistsThroughDungeonResponse(t *testing.T) {
	g := newTownTestGame(t)
	initial := g.State()
	entered := enterTestDungeon(t, g)
	if !reflect.DeepEqual(initial.Materials, entered.Materials) || len(entered.FieldRecipes) != len(initial.FieldRecipes) {
		t.Fatal("dungeon response omitted crafting state")
	}
	def := g.dungeonDefinition()
	g.dungeon.Flags[def.CompleteFlag] = true
	returned, err := g.ProcessDungeon(DungeonRequest{Type: "retreat"})
	if err != nil {
		t.Fatal(err)
	}
	if len(returned.Resources) == 0 || len(returned.FieldRecipes) != len(initial.FieldRecipes) {
		t.Fatal("return lost gathering state")
	}
	found := false
	for _, m := range returned.Materials {
		if m.ID == "mill_core" {
			found = true
			if m.Count != 1 {
				t.Fatal("return omitted earned core")
			}
		}
	}
	if !found {
		t.Fatal("material registry missing from response")
	}
	if !reflect.DeepEqual(returned.Materials, g.State().Materials) {
		t.Fatal("locked and full state disagree")
	}
}
