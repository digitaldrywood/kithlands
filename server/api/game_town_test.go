package api

import (
	"testing"
)

func TestPickHiddenItemReward_Tier1(t *testing.T) {
	tags := map[string]bool{"shop": true, "commerce": true}
	// Collect several items and verify they're all valid tier-1 rewards
	validItems := map[string]bool{
		"potion": true, "antidote": true, "ether": true,
	}
	for seed := uint64(0); seed < 20; seed++ {
		id, gold := pickHiddenItemReward(tags, 0, seed)
		if gold > 0 {
			if gold != 50 {
				t.Errorf("seed %d: tier 1 gold=%d, want 50", seed, gold)
			}
			continue
		}
		if !validItems[id] {
			t.Errorf("seed %d: tier 1 item=%q not in valid set", seed, id)
		}
	}
}

func TestPickHiddenItemReward_Tier2(t *testing.T) {
	tags := map[string]bool{"rest": true}
	validItems := map[string]bool{
		"hi_potion": true, "ether": true, "phoenix_down": true, "antidote": true,
	}
	for seed := uint64(0); seed < 20; seed++ {
		id, gold := pickHiddenItemReward(tags, 4, seed)
		if gold > 0 {
			if gold != 150 {
				t.Errorf("seed %d: tier 2 gold=%d, want 150", seed, gold)
			}
			continue
		}
		if !validItems[id] {
			t.Errorf("seed %d: tier 2 item=%q not in valid set", seed, id)
		}
	}
}

func TestPickHiddenItemReward_Tier3(t *testing.T) {
	tags := map[string]bool{"temple": true, "revive": true}
	validItems := map[string]bool{
		"hi_potion": true, "hi_ether": true, "x_ether": true, "phoenix_down": true,
	}
	for seed := uint64(0); seed < 20; seed++ {
		id, gold := pickHiddenItemReward(tags, 7, seed)
		if gold > 0 {
			if gold != 300 {
				t.Errorf("seed %d: tier 3 gold=%d, want 300", seed, gold)
			}
			continue
		}
		if !validItems[id] {
			t.Errorf("seed %d: tier 3 item=%q not in valid set", seed, id)
		}
	}
}

func TestPickHiddenItemReward_Deterministic(t *testing.T) {
	tags := map[string]bool{"shop": true}
	id1, g1 := pickHiddenItemReward(tags, 0, 42)
	id2, g2 := pickHiddenItemReward(tags, 0, 42)
	if id1 != id2 || g1 != g2 {
		t.Errorf("not deterministic: (%q,%d) != (%q,%d)", id1, g1, id2, g2)
	}
}

func TestHashStr(t *testing.T) {
	// Same string should always produce same hash
	h1 := hashStr("test_node_123")
	h2 := hashStr("test_node_123")
	if h1 != h2 {
		t.Errorf("hashStr not deterministic: %d != %d", h1, h2)
	}

	// Different strings should (very likely) produce different hashes
	h3 := hashStr("test_node_456")
	if h1 == h3 {
		t.Errorf("hashStr collision: %q and %q both produce %d", "test_node_123", "test_node_456", h1)
	}
}
