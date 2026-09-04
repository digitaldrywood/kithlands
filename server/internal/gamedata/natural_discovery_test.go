package gamedata_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestNaturalDiscoveryCatalogLoadsAuthoredOneShotTypes(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	if got := len(gd.NaturalDiscoveries); got != 3 {
		t.Fatalf("natural discoveries = %d, want 3", got)
	}

	want := []struct {
		id   string
		kind string
	}{
		{id: "weathered_trail_clue", kind: "clue"},
		{id: "hidden_supply_cache", kind: "supply_cache"},
		{id: "strange_coin_passage", kind: "hidden_passage"},
	}
	for i, expected := range want {
		discovery := gd.NaturalDiscoveries[i]
		if discovery.ID != expected.id || discovery.Kind != expected.kind {
			t.Fatalf("natural discovery[%d] = %s/%s, want %s/%s", i, discovery.ID, discovery.Kind, expected.id, expected.kind)
		}
		if discovery.Title == "" || discovery.Prompt == "" || discovery.SuccessMessage == "" ||
			discovery.ExhaustedMessage == "" || discovery.QuestRevealMessage == "" {
			t.Fatalf("natural discovery %s has incomplete authored copy", discovery.ID)
		}
	}
}
