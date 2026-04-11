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

func TestFormationsLoaded(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	if len(gd.Formations) == 0 {
		t.Fatal("expected at least one formation")
	}

	// Verify a known formation exists
	f := gd.FormationByID("slime_pack")
	if f == nil {
		t.Fatal("slime_pack formation not found")
	}
	if f.Layout != "line" {
		t.Errorf("slime_pack layout: got %q, want %q", f.Layout, "line")
	}
	if len(f.Slots) != 1 {
		t.Fatalf("slime_pack slots: got %d, want 1", len(f.Slots))
	}
	if f.Slots[0].MonsterID != "slime" {
		t.Errorf("slime_pack slot monster_id: got %q, want %q", f.Slots[0].MonsterID, "slime")
	}
}

func TestFormationSlotMonsterIDsResolve(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	for _, f := range gd.Formations {
		for _, slot := range f.Slots {
			if gd.MonsterByID(slot.MonsterID) == nil {
				t.Errorf("formation %q slot references unknown monster: %q", f.ID, slot.MonsterID)
			}
		}
	}
}

func TestMonsterSizesValid(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	validSizes := map[string]bool{"small": true, "medium": true, "large": true, "boss": true}
	for _, m := range gd.Monsters {
		if !validSizes[m.Size] {
			t.Errorf("monster %q has invalid size: %q", m.ID, m.Size)
		}
	}
}

func TestPalettesLoaded(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	if len(gd.Palettes.WeaponTiers) == 0 {
		t.Fatal("expected weapon tier palette entries")
	}
	if len(gd.Palettes.ArmorTiers) == 0 {
		t.Fatal("expected armor tier palette entries")
	}
	// Every item tier present in items.json should have a palette entry.
	for _, w := range gd.Items.Weapons {
		if _, ok := gd.Palettes.WeaponTiers[w.Tier]; !ok {
			t.Errorf("weapon %q tier %d missing from WeaponTiers palette", w.ID, w.Tier)
		}
	}
	for _, a := range gd.Items.Armor {
		if _, ok := gd.Palettes.ArmorTiers[a.Tier]; !ok {
			t.Errorf("armor %q tier %d missing from ArmorTiers palette", a.ID, a.Tier)
		}
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
