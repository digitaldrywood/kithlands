package gamedata_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestLoadValidData(t *testing.T) {
	gd := gamedata.Load("../../../shared")

	if len(gd.Classes) != 6 {
		t.Fatalf("expected 6 classes, got %d", len(gd.Classes))
	}

	expectedIDs := []string{"warrior", "brawler", "rogue", "mender", "cinder", "wayfarer"}
	for _, id := range expectedIDs {
		if gd.ClassByID(id) == nil {
			t.Errorf("missing class %q", id)
		}
	}
}

func TestClassByID(t *testing.T) {
	gd := gamedata.Load("../../../shared")

	warrior := gd.ClassByID("warrior")
	if warrior == nil {
		t.Fatal("warrior class not found")
	}
	if warrior.StartingStats.STR != 20 {
		t.Errorf("warrior STR: got %d, want 20", warrior.StartingStats.STR)
	}
	if warrior.HPPerLevel != 25 {
		t.Errorf("warrior hp_per_level: got %d, want 25", warrior.HPPerLevel)
	}

	cinder := gd.ClassByID("cinder")
	if cinder == nil {
		t.Fatal("cinder class not found")
	}
	if cinder.StartingStats.INT != 20 {
		t.Errorf("cinder INT: got %d, want 20", cinder.StartingStats.INT)
	}
}

func TestStatsConfig(t *testing.T) {
	gd := gamedata.Load("../../../shared")

	if gd.Stats.XPCurve.MaxLevel != 50 {
		t.Errorf("max_level: got %d, want 50", gd.Stats.XPCurve.MaxLevel)
	}
	if gd.Stats.Combat.BaseHitChance != 84 {
		t.Errorf("base_hit_chance: got %d, want 84", gd.Stats.Combat.BaseHitChance)
	}
	if gd.Stats.Combat.MinDamagePerHit != 1 {
		t.Errorf("min_damage_per_hit: got %d, want 1", gd.Stats.Combat.MinDamagePerHit)
	}
}

func TestLoadPanicsOnMissingDir(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic on missing directory")
		}
	}()
	gamedata.Load("/nonexistent/path")
}
