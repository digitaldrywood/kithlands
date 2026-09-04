package inventory_test

import (
	"encoding/json"
	"math"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func TestGemDiscoverySurvivesSpendingAndSerialization(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	inv.Gems["ember_shard"] = 3
	inv.DiscoverGemRecipes(gd)
	if inv.KnownGemRecipes["convert_ember_to_ward"] {
		t.Fatal("Ward discovery granted before acquiring Ward")
	}
	if !inv.KnownGemRecipes["convert_ward_to_ember"] {
		t.Fatal("Ember acquisition did not discover conversion")
	}
	if err := inv.CraftGem("refine_ember_gem", 1, gd); err != nil {
		t.Fatal(err)
	}
	if !inv.KnownGemRecipes["recover_ember_shards"] {
		t.Fatal("transmuted gem not discovered")
	}
	if err := inv.CraftGem("recover_ember_shards", 1, gd); err != nil {
		t.Fatal(err)
	}
	if inv.Gems["ember_shard"] != 2 || inv.Gems["ember_gem"] != 0 {
		t.Fatalf("recovery counts = %v", inv.Gems)
	}
	data, err := json.Marshal(inv)
	if err != nil {
		t.Fatal(err)
	}
	var restored inventory.Inventory
	if err := json.Unmarshal(data, &restored); err != nil {
		t.Fatal(err)
	}
	restored.Normalize()
	restored.DiscoverGemRecipes(gd)
	if !restored.KnownGemRecipes["recover_ember_shards"] {
		t.Fatal("spent discovery lost after save/load")
	}
	clone := restored.Clone()
	clone.KnownGemRecipes["recover_ember_shards"] = false
	if !restored.KnownGemRecipes["recover_ember_shards"] {
		t.Fatal("clone aliased discoveries")
	}
}

func TestGemRecipeRejectsInvalidTransactionsWithoutMutation(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name, id string
		level    int
		gems     map[string]int
		change   func(*gamedata.GemRecipe)
	}{
		{name: "unknown", id: "no_recipe", level: 1, gems: map[string]int{"ember_shard": 3}},
		{name: "locked", id: "convert_ember_to_ward", level: 1, gems: map[string]int{"ember_shard": 3}},
		{name: "under level", id: "refine_ember_crystal", level: 1, gems: map[string]int{"ember_gem": 3}},
		{name: "insufficient", id: "refine_ember_gem", level: 1, gems: map[string]int{"ember_shard": 2}},
		{name: "duplicate input", id: "refine_ember_gem", level: 1, gems: map[string]int{"ember_shard": 3}, change: func(r *gamedata.GemRecipe) { r.Inputs = append(r.Inputs, r.Inputs[0]) }},
		{name: "late missing input", id: "refine_ember_gem", level: 1, gems: map[string]int{"ember_shard": 3}, change: func(r *gamedata.GemRecipe) {
			r.Inputs = append(r.Inputs, gamedata.GemAmount{GemID: "ward_shard", Count: 1})
		}},
		{name: "negative input", id: "refine_ember_gem", level: 1, gems: map[string]int{"ember_shard": 3}, change: func(r *gamedata.GemRecipe) { r.Inputs[0].Count = -1 }},
		{name: "unknown output", id: "refine_ember_gem", level: 1, gems: map[string]int{"ember_shard": 3}, change: func(r *gamedata.GemRecipe) { r.Output.GemID = "fake" }},
		{name: "material amplification", id: "refine_ember_gem", level: 1, gems: map[string]int{"ember_shard": 3}, change: func(r *gamedata.GemRecipe) { r.Output.Count = 2 }},
		{name: "count overflow", id: "refine_ember_gem", level: 1, gems: map[string]int{"ember_shard": 3, "ember_gem": math.MaxInt}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gd := gamedata.Load("../../../shared")
			inv := inventory.New()
			inv.Gems = tt.gems
			if tt.change != nil {
				tt.change(gd.GemRecipeByID(tt.id))
			}
			before, err := json.Marshal(inv)
			if err != nil {
				t.Fatal(err)
			}
			if err := inv.CraftGem(tt.id, tt.level, gd); err == nil {
				t.Fatal("invalid craft accepted")
			}
			after, err := json.Marshal(inv)
			if err != nil {
				t.Fatal(err)
			}
			if string(before) != string(after) {
				t.Fatalf("failed recipe mutated inventory: %s => %s", before, after)
			}
		})
	}
}

func TestRecipeCyclesLoseMaterialAndCannotRepeatWithoutIngredients(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	inv.Gems["ember_shard"] = 8
	inv.Gems["ward_shard"] = 1
	inv.DiscoverGemRecipes(gd)
	for range 4 {
		if err := inv.CraftGem("convert_ember_to_ward", 1, gd); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		if err := inv.CraftGem("convert_ward_to_ember", 1, gd); err != nil {
			t.Fatal(err)
		}
	}
	if !reflect.DeepEqual(inv.Gems, map[string]int{"ember_shard": 2, "ward_shard": 1}) {
		t.Fatalf("cycle amplified material: %v", inv.Gems)
	}
	if err := inv.CraftGem("refine_ember_gem", 1, gd); err == nil {
		t.Fatal("cycle fabricated upgrade budget")
	}
	inv.Gems["ember_shard"]++
	if err := inv.CraftGem("refine_ember_gem", 1, gd); err != nil {
		t.Fatal(err)
	}
	before := inv.Clone()
	if err := inv.CraftGem("refine_ember_gem", 1, gd); err == nil {
		t.Fatal("repeated request produced output")
	}
	if !reflect.DeepEqual(inv.Gems, before.Gems) {
		t.Fatal("repeated request changed counts")
	}
	for _, r := range gd.Loot.Recipes {
		input := 0
		for _, v := range r.Inputs {
			input += gd.GemByID(v.GemID).MaterialValue * v.Count
		}
		output := gd.GemByID(r.Output.GemID).MaterialValue * r.Output.Count
		if output > input || (r.Discovery != nil && output >= input) {
			t.Fatalf("recipe %s creates or preserves material: %d -> %d", r.ID, input, output)
		}
	}
}
