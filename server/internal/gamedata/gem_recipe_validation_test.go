package gamedata_test

import (
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"testing"
)

func TestGemDiscoveryPredicatesAreReachable(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	recipe := *gd.GemRecipeByID("convert_ember_to_ward")
	tests := []gamedata.GemRecipeDiscovery{
		{Family: "unknown", MinTier: 1, Hint: "Find it"},
		{Family: "ward", MinTier: 99, Hint: "Find it"},
		{Family: "ward", MinTier: 1},
		{Family: "ward", MinTier: 0, Hint: "Find it"},
	}
	for _, criteria := range tests {
		recipe.Discovery = &criteria
		if err := gd.ValidateGemRecipe(recipe); err == nil {
			t.Fatalf("invalid discovery accepted: %+v", criteria)
		}
	}
	recipe = *gd.GemRecipeByID("convert_ember_to_ward")
	recipe.Output.Count = 2
	if err := gd.ValidateGemRecipe(recipe); err == nil {
		t.Fatal("lossless discovered conversion accepted")
	}
}
