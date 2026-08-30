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

func TestBattleEffectPresentationMetadataLoads(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	wants := map[string]struct {
		family string
		tier   int
	}{
		"spark": {"fire", 1}, "ember": {"fire", 1},
		"fireball": {"fire", 2}, "blaze": {"fire", 3},
		"cure": {"restorative_light", 1}, "heal": {"restorative_light", 2},
		"cura": {"restorative_light", 2}, "heala": {"restorative_light", 3},
	}
	for id, want := range wants {
		spell := gd.SpellByID(id)
		if spell == nil || spell.Presentation == nil || spell.Presentation.EffectFamily != want.family || spell.Presentation.IntensityTier != want.tier {
			t.Errorf("%s presentation = %#v, want %s tier %d", id, spell, want.family, want.tier)
		}
	}
}

func TestLayeredWeaponVisualMetadataLoads(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	wants := map[string]string{
		"short_sword":   "iron_sword",
		"iron_sword":    "iron_sword",
		"steel_sword":   "mythril_sword",
		"mythril_sword": "mythril_sword",
		"shadow_blade":  "shadow_blade",
	}
	for id, visualID := range wants {
		weapon := gd.WeaponByID(id)
		if weapon == nil {
			t.Fatalf("%s not loaded", id)
		}
		animationSet := "sword"
		if id == "shadow_blade" {
			animationSet = "dagger"
		}
		if weapon.VisualID != visualID || weapon.AnimationSet != animationSet {
			t.Fatalf("%s visual metadata = (%q, %q), want (%q, %s)", id, weapon.VisualID, weapon.AnimationSet, visualID, animationSet)
		}
	}
}

func TestLayeredShieldVisualMetadataLoads(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	shield := gd.ShieldByID("steel_shield")
	if shield == nil {
		t.Fatal("steel_shield not loaded")
	}
	if shield.VisualID != "steel_shield" || shield.AnimationSet != "shield" {
		t.Fatalf("steel_shield visual metadata = (%q, %q), want (steel_shield, shield)", shield.VisualID, shield.AnimationSet)
	}
	if len(gd.BattleCharacters.OffHandAssets) != 1 || gd.BattleCharacters.OffHandAssets[0].VisualID != "steel_shield" {
		t.Fatalf("off-hand assets = %#v, want steel_shield", gd.BattleCharacters.OffHandAssets)
	}
}

func TestBattleCharacterManifestLoadsEveryRuntimeIdentity(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	if got := len(gd.BattleCharacters.Classes); got != 12 {
		t.Fatalf("battle character identities = %d, want 12", got)
	}
	if got := len(gd.BattleCharacters.RequiredStates); got != 8 {
		t.Fatalf("battle character required states = %d, want 8", got)
	}

	warrior := gd.BattleCharacterByID("warrior")
	if warrior == nil || warrior.Status != "approved_runtime" {
		t.Fatalf("warrior battle profile = %#v, want approved_runtime", warrior)
	}
	if len(warrior.States["physical_attack"].Frames) != 6 {
		t.Fatalf("warrior physical attack does not have six frames")
	}
	if got := len(warrior.States); got != len(gd.BattleCharacters.RequiredStates) {
		t.Fatalf("warrior battle states = %d, want %d", got, len(gd.BattleCharacters.RequiredStates))
	}
	if !warrior.States["ko_defeated"].HoldLastFrame {
		t.Fatal("warrior KO state must hold its last frame")
	}
	finalKO := warrior.States["ko_defeated"].Frames[len(warrior.States["ko_defeated"].Frames)-1]
	if finalKO.Body.Angle != 90 {
		t.Fatalf("warrior final KO body angle = %v, want 90", finalKO.Body.Angle)
	}

	mender := gd.BattleCharacterByID("mender")
	if mender == nil || mender.Status != "approved_runtime" {
		t.Fatalf("mender battle profile = %#v, want approved_runtime", mender)
	}
	if len(mender.States["cast_class_ability"].Frames) != 6 {
		t.Fatalf("mender cast does not have six frames")
	}

	rogue := gd.BattleCharacterByID("rogue")
	if rogue == nil || rogue.Status != "approved_runtime" {
		t.Fatalf("rogue battle profile = %#v, want approved_runtime", rogue)
	}
	if len(rogue.States["physical_attack"].Frames) != 6 {
		t.Fatalf("rogue physical attack does not have six frames")
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

func TestEquipmentClassReferencesResolve(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	classIDs := map[string]bool{}
	for _, class := range gd.Classes {
		classIDs[class.ID] = true
	}

	checkRefs := func(kind, id string, refs []string) {
		t.Helper()
		if len(refs) == 0 {
			t.Fatalf("%s %q has no class restrictions", kind, id)
		}
		for _, ref := range refs {
			if !classIDs[ref] {
				t.Fatalf("%s %q references unknown class %q", kind, id, ref)
			}
		}
	}

	for _, weapon := range gd.Items.Weapons {
		checkRefs("weapon", weapon.ID, weapon.Classes)
	}
	for _, armor := range gd.Items.Armor {
		checkRefs("armor", armor.ID, armor.Classes)
	}
	for _, shield := range gd.Items.Shields {
		checkRefs("shield", shield.ID, shield.Classes)
	}
	for _, helmet := range gd.Items.Helmets {
		checkRefs("helmet", helmet.ID, helmet.Classes)
	}
}

func TestEquipmentSlotCatalogSupportsExpandedLoadouts(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	if got := len(gd.Items.EquipmentSlots); got != 12 {
		t.Fatalf("equipment slot count = %d, want 12", got)
	}

	wantCategories := map[string]string{
		"main_hand": "weapon",
		"body":      "armor",
		"hands":     "gloves",
		"legs":      "pants",
		"feet":      "boots",
		"amulet":    "amulet",
		"ring_1":    "ring",
		"ring_2":    "ring",
	}
	previousOrder := 0
	for _, slot := range gd.Items.EquipmentSlots {
		if slot.Order <= previousOrder {
			t.Fatalf("slot %q order %d is not after %d", slot.ID, slot.Order, previousOrder)
		}
		previousOrder = slot.Order
		if want, ok := wantCategories[slot.ID]; ok {
			found := false
			for _, category := range slot.Accepts {
				if category == want {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("slot %q accepts %v, want %q", slot.ID, slot.Accepts, want)
			}
			delete(wantCategories, slot.ID)
		}
		if gd.EquipmentSlotByID(slot.ID) == nil {
			t.Errorf("EquipmentSlotByID(%q) did not resolve", slot.ID)
		}
	}
	if len(wantCategories) != 0 {
		t.Fatalf("missing equipment slots: %v", wantCategories)
	}
}

func TestEquipmentBaseCatalogNormalizesExpandedGear(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	tests := []struct {
		id, kind, category string
	}{
		{id: "short_sword", kind: "weapon", category: "weapon"},
		{id: "leather_armor", kind: "armor", category: "armor"},
		{id: "wooden_shield", kind: "armor", category: "shield"},
		{id: "leather_cap", kind: "armor", category: "helmet"},
		{id: "trail_boots", kind: "armor", category: "boots"},
		{id: "copper_ring", kind: "accessory", category: "ring"},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			t.Parallel()
			base := gd.EquipmentBaseByID(tt.id)
			if base == nil || base.Kind != tt.kind || base.Category != tt.category {
				t.Fatalf("EquipmentBaseByID(%q) = %+v, want %s/%s", tt.id, base, tt.kind, tt.category)
			}
			if len(base.Classes) == 0 || len(base.Stats) == 0 {
				t.Fatalf("EquipmentBaseByID(%q) missing classes or stats: %+v", tt.id, base)
			}
		})
	}
}

func TestChestsLoaded(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	if len(gd.Chests) < 8 {
		t.Fatalf("expected authored chest catalog, got %d entries", len(gd.Chests))
	}
	if gd.ChestByID("crypt_reliquary") == nil {
		t.Fatal("crypt_reliquary chest not loaded")
	}
	if gd.KeyItemByID("sun_seal") == nil {
		t.Fatal("sun_seal key item not loaded")
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
