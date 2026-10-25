package gamedata_test

import (
	"slices"
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

func TestStaffSpellDamageMetadataLoads(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	wants := map[string]int{
		"arcane_staff":    10,
		"war_staff":       12,
		"elemental_staff": 15,
		"sage_staff":      20,
		"starcaller":      25,
	}
	for id, want := range wants {
		weapon := gd.WeaponByID(id)
		base := gd.EquipmentBaseByID(id)
		if weapon == nil || base == nil {
			t.Fatalf("%s not loaded", id)
		}
		if weapon.SpellDamagePct != want || base.Stats["spell_damage_pct"] != want {
			t.Fatalf("%s spell damage = (%d, %d), want %d", id, weapon.SpellDamagePct, base.Stats["spell_damage_pct"], want)
		}
		if weapon.Special != "" {
			t.Fatalf("%s retains stale special text %q", id, weapon.Special)
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

	for _, profile := range gd.BattleCharacters.Classes {
		if profile.Status != "approved_runtime" {
			t.Fatalf("%s battle profile status = %q, want approved_runtime", profile.ID, profile.Status)
		}
		if profile.StateRecipe == "" {
			t.Fatalf("%s battle profile has no state recipe", profile.ID)
		}
		wantStates := len(gd.BattleCharacters.RequiredStates)
		if profile.ID == "warrior" {
			wantStates++
		}
		if got := len(profile.States); got != wantStates {
			t.Fatalf("%s battle states = %d, want %d", profile.ID, got, wantStates)
		}
		signature := profile.States[profile.DefaultState]
		for _, stateID := range gd.BattleCharacters.RequiredStates {
			state, ok := profile.States[stateID]
			if !ok || len(state.Frames) == 0 {
				t.Fatalf("%s is missing populated state %s", profile.ID, stateID)
			}
			if state.BodyKey != signature.BodyKey || state.BodyPath != signature.BodyPath {
				t.Fatalf("%s/%s changed identity atlas", profile.ID, stateID)
			}
			for frameIndex, frame := range state.Frames {
				for attachmentID := range profile.Attachments {
					if _, ok := frame.Attachments[attachmentID]; !ok {
						t.Fatalf("%s/%s[%d] missing %s attachment", profile.ID, stateID, frameIndex, attachmentID)
					}
				}
			}
		}
		ko := profile.States["ko_defeated"]
		if !ko.HoldLastFrame {
			t.Fatalf("%s KO state must hold its last frame", profile.ID)
		}
		finalKO := ko.Frames[len(ko.Frames)-1]
		if finalKO.Body.Angle != 90 {
			t.Fatalf("%s final KO body angle = %v, want 90", profile.ID, finalKO.Body.Angle)
		}
		hiddenItemAttachments := 0
		totalItemAttachments := 0
		for _, frame := range profile.States["item_use"].Frames {
			for attachmentID, pose := range frame.Attachments {
				totalItemAttachments++
				if pose.Visible != nil && !*pose.Visible {
					hiddenItemAttachments++
				} else if profile.ID != "warrior" {
					t.Fatalf("%s item_use leaves %s visible", profile.ID, attachmentID)
				}
			}
		}
		if totalItemAttachments > 0 && hiddenItemAttachments == 0 {
			t.Fatalf("%s item_use never hides its equipment", profile.ID)
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

func TestMonsterFieldGuideMetadataIsComplete(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	for _, monster := range gd.Monsters {
		if monster.FieldNote == "" {
			t.Errorf("monster %q has no field note", monster.ID)
		}
		if len(monster.Habitats) == 0 {
			t.Errorf("monster %q has no habitats", monster.ID)
		}
		if monster.Tactics == "" {
			t.Errorf("monster %q has no tactics", monster.ID)
		}
	}
}

func TestOverworldBestiaryExpansionIsReachableAndElemental(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	targets := map[string]struct {
		weak   string
		resist string
	}{
		"giant_rat":  {weak: "fire"},
		"bandit":     {},
		"war_hydra":  {weak: "ice", resist: "fire"},
		"wyvern":     {weak: "ice", resist: "fire"},
		"bramblehog": {weak: "fire"},
		"mire_toad":  {weak: "lightning", resist: "ice"},
		"frosthorn":  {weak: "fire", resist: "ice"},
		"ridge_rook": {weak: "lightning"},
	}
	reachable := make(map[string]bool, len(targets))
	for _, formation := range gd.Formations {
		if formation.Weight <= 0 {
			continue
		}
		for _, slot := range formation.Slots {
			if _, ok := targets[slot.MonsterID]; ok {
				reachable[slot.MonsterID] = true
			}
		}
	}

	for id, want := range targets {
		monster := gd.MonsterByID(id)
		if monster == nil {
			t.Fatalf("monster %q is missing", id)
		}
		if !reachable[id] {
			t.Errorf("monster %q has no positive-weight overworld formation", id)
		}
		if len(monster.Drops) == 0 {
			t.Errorf("monster %q has no drop table", id)
		}
		if want.weak != "" && !slices.Contains(monster.Weaknesses, want.weak) {
			t.Errorf("monster %q weaknesses %v do not include %q", id, monster.Weaknesses, want.weak)
		}
		if want.resist != "" && !slices.Contains(monster.Resistances, want.resist) {
			t.Errorf("monster %q resistances %v do not include %q", id, monster.Resistances, want.resist)
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

func TestBattlePresentationCuesLoadAndExpand(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	if !slices.Equal(gd.BattleCharacters.FeetAnchor, []float64{96, 184}) {
		t.Fatalf("feet anchor = %v", gd.BattleCharacters.FeetAnchor)
	}
	for _, id := range []string{"warrior", "cinder", "knight"} {
		for _, state := range []string{"physical_attack", "cast_class_ability"} {
			cue := gd.BattleCharacterByID(id).States[state].CueFrame
			if cue == nil {
				t.Errorf("%s %s lost authored cue during load/recipe expansion", id, state)
			}
		}
	}
}

func TestWarriorCriticalStateKeepsTheApprovedAtlas(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	if !slices.Equal(gd.BattleCharacters.OptionalStates, []string{"critical_attack"}) {
		t.Fatal("unexpected optional battle states")
	}
	for _, profile := range gd.BattleCharacters.Classes {
		critical, ok := profile.States["critical_attack"]
		if profile.ID != "warrior" {
			if ok {
				t.Fatalf("unreviewed critical choreography expanded to %s", profile.ID)
			}
			continue
		}
		normal := profile.States["physical_attack"]
		if !ok || critical.BodyKey != normal.BodyKey || critical.BodyPath != normal.BodyPath {
			t.Fatal("critical changed the accepted identity atlas")
		}
		cueCount, normalTime, criticalTime := 0, 0, 0
		for _, frame := range normal.Frames {
			normalTime += frame.Duration
		}
		for _, frame := range critical.Frames {
			criticalTime += frame.Duration
			if critical.CueFrame != nil && frame.Frame == *critical.CueFrame {
				cueCount++
			}
		}
		if cueCount != 1 || criticalTime <= normalTime || len(critical.Frames) != 6 {
			t.Fatal("critical lacks one contact cue and deliberate six-pose timing")
		}
	}
}
