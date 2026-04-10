package generator

import (
	"testing"
)

func TestLoadSideQuestPool_Valid(t *testing.T) {
	// The real pool lives at ../../../shared/content/side_quests.json.
	pool, err := LoadSideQuestPool("../../../shared")
	if err != nil {
		t.Fatalf("LoadSideQuestPool: %v", err)
	}
	if len(pool) == 0 {
		t.Fatal("expected non-empty pool")
	}
	// Every entry must use a supported template.
	for _, e := range pool {
		if QuestTemplateByID(e.Template) == nil {
			t.Errorf("entry %s uses unsupported template %s", e.ID, e.Template)
		}
		if e.Act < 1 || e.Act > 3 {
			t.Errorf("entry %s has invalid act %d", e.ID, e.Act)
		}
	}
}

func TestLoadSideQuestPool_BadPath(t *testing.T) {
	_, err := LoadSideQuestPool("/nonexistent/path/xyz")
	if err == nil {
		t.Fatal("expected error for missing path, got nil")
	}
}

func TestSelectSideQuests_Empty(t *testing.T) {
	got := selectSideQuests(nil, 1, 3, newRng(1))
	if got != nil {
		t.Errorf("expected nil for empty pool, got %v", got)
	}
}

func TestSelectSideQuests_ActFilter(t *testing.T) {
	pool := []SideQuestEntry{
		{ID: "a1", Act: 1, Template: "Q01", Rarity: "common"},
		{ID: "a2", Act: 1, Template: "Q04", Rarity: "common"},
		{ID: "b1", Act: 2, Template: "Q01", Rarity: "common"},
	}
	got := selectSideQuests(pool, 1, 5, newRng(1))
	if len(got) != 2 {
		t.Errorf("expected 2 act-1 entries, got %d", len(got))
	}
	for _, e := range got {
		if e.Act != 1 {
			t.Errorf("selection leaked non-act-1 entry: %+v", e)
		}
	}
}

func TestSelectSideQuests_NoDuplicates(t *testing.T) {
	pool := []SideQuestEntry{
		{ID: "a", Act: 1, Template: "Q01", Rarity: "common"},
		{ID: "b", Act: 1, Template: "Q04", Rarity: "common"},
		{ID: "c", Act: 1, Template: "Q02", Rarity: "common"},
	}
	got := selectSideQuests(pool, 1, 3, newRng(99))
	seen := map[string]bool{}
	for _, e := range got {
		if seen[e.ID] {
			t.Errorf("duplicate entry %s in selection", e.ID)
		}
		seen[e.ID] = true
	}
}

func TestRarityWeight(t *testing.T) {
	if rarityWeight("common") <= rarityWeight("uncommon") {
		t.Error("common should weight higher than uncommon")
	}
	if rarityWeight("uncommon") <= rarityWeight("rare") {
		t.Error("uncommon should weight higher than rare")
	}
	if rarityWeight("") <= 0 {
		t.Error("unknown rarity should still have a positive weight")
	}
}
