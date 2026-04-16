package generator

import "testing"

func TestLoadBuildingSideQuestPool_Valid(t *testing.T) {
	pool, err := LoadBuildingSideQuestPool("../../../shared")
	if err != nil {
		t.Fatalf("LoadBuildingSideQuestPool: %v", err)
	}
	if len(pool) == 0 {
		t.Fatal("expected non-empty pool")
	}
	for _, entry := range pool {
		if entry.BuildingType == "" {
			t.Fatalf("entry %+v missing building type", entry)
		}
		if entry.Name == "" {
			t.Fatalf("entry %+v missing name", entry)
		}
		if QuestTemplateByID(entry.Template) == nil {
			t.Fatalf("entry %+v uses unsupported template", entry)
		}
		if entry.XPReward <= 0 || entry.GoldReward < 0 {
			t.Fatalf("entry %+v has invalid rewards", entry)
		}
	}
}

func TestLoadBuildingSideQuestPool_BadPath(t *testing.T) {
	_, err := LoadBuildingSideQuestPool("/nonexistent/path/xyz")
	if err == nil {
		t.Fatal("expected error for missing path, got nil")
	}
}
