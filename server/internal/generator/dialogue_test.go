package generator

import (
	"strings"
	"testing"
)

func TestFallbackDialogue_AllTemplatesNonEmpty(t *testing.T) {
	templates := []string{"Q01", "Q02", "Q03", "Q04", "Q05", "Q12", "promotion"}
	for _, id := range templates {
		desc, completion := fallbackDialogue(id, "Alice", "Old Mill", "lost locket", newRng(1))
		if desc == "" {
			t.Errorf("%s: empty description", id)
		}
		if completion == "" {
			t.Errorf("%s: empty completion", id)
		}
		// All description variants mention the giver OR target name.
		if !strings.Contains(desc, "Alice") && !strings.Contains(desc, "Old Mill") {
			t.Errorf("%s description %q: missing both giver and target interpolation", id, desc)
		}
	}
}

func TestFallbackDialogue_UnknownTemplateFallsBack(t *testing.T) {
	desc, completion := fallbackDialogue("Q99", "Bob", "Nowhere", "thing", newRng(1))
	if desc == "" || completion == "" {
		t.Error("unknown template should still return non-empty fallback text")
	}
	if !strings.Contains(desc, "Bob") {
		t.Errorf("fallback description missing giver: %q", desc)
	}
}

func TestFallbackDialogue_VariantVariesBySeed(t *testing.T) {
	// For Q01 we have 2 variants. Across 10 seeds we should see at least 2
	// distinct descriptions.
	seen := map[string]bool{}
	for seed := uint64(1); seed <= 20; seed++ {
		desc, _ := fallbackDialogue("Q01", "Alice", "Mill", "ring", newRng(seed))
		seen[desc] = true
	}
	if len(seen) < 2 {
		t.Errorf("expected at least 2 distinct Q01 descriptions across seeds, got %d", len(seen))
	}
}

func TestItemHintForTemplate(t *testing.T) {
	// Each supported template should have a non-empty pool.
	for _, id := range []string{"Q01", "Q02", "Q03", "Q04", "Q05", "Q12"} {
		hint := itemHintForTemplate(id, newRng(1))
		if hint == "" {
			t.Errorf("%s: empty item hint", id)
		}
	}
	// Unknown template returns a default, not panic.
	if h := itemHintForTemplate("Q99", newRng(1)); h == "" {
		t.Error("unknown template should return fallback hint, got empty")
	}
}
