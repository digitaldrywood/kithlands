package api_test

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

// TestSaveLoadNonFlatConsumables pins the serialization contract for the
// Consumables map so adding a new item id (phoenix_down, antidote, tent, …)
// to an active save survives a round-trip. Regression guard for issue #144:
// the FF-style Item menu relies on every owned consumable flowing through
// g.inv.Consumables, so the marshaled save blob must preserve unknown keys
// rather than hard-coding the legacy potion/ether quartet.
func TestSaveLoadNonFlatConsumables(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})

	// Stock a grab-bag of non-legacy consumables. Each id exercises a
	// different effect branch (heal, revive, cure, rest) so any future
	// truncation in the save blob surfaces immediately.
	seeded := map[string]int{
		"phoenix_down": 2,
		"antidote":     3,
		"soft":         1,
		"tent":         4,
		"hi_potion":    5,
	}
	for id, n := range seeded {
		api.GiveItemForTest(game, id, n)
	}

	ss, err := game.ToSaveState("round-trip", "test-user")
	if err != nil {
		t.Fatalf("ToSaveState: %v", err)
	}

	var reloaded inventory.Inventory
	if err := json.Unmarshal(ss.Inventory, &reloaded); err != nil {
		t.Fatalf("unmarshal inventory: %v", err)
	}

	for id, want := range seeded {
		got := reloaded.Consumables[id]
		if got < want {
			t.Errorf("consumable %q after save round-trip: got %d, want >= %d", id, got, want)
		}
	}
}
