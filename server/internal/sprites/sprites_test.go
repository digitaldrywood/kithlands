package sprites_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/sprites"
)

func testPalettes() *gamedata.Palettes {
	return &gamedata.Palettes{
		WeaponTiers: map[int]string{
			1: "#8a8275",
			2: "#c9a95a",
			3: "#c0c0c0",
			4: "#4fc3f7",
			5: "#8a2be2",
			6: "#ff9800",
			7: "#ffd700",
		},
		ArmorTiers: map[int]string{
			1: "#6d4c41",
			2: "#8d6e63",
			3: "#9e9e9e",
			4: "#546e7a",
			5: "#26a69a",
			6: "#ab47bc",
			7: "#fbc02d",
		},
	}
}

func testLookup() sprites.ItemLookup {
	weapons := map[string]int{
		"wooden_club":     1,
		"short_sword":     1,
		"steel_sword":     3,
		"mithril_blade":   5,
		"orichalcum_fang": 6,
		"dragonslayer":    7,
	}
	armors := map[string]int{
		"leather_armor": 1,
		"chain_mail":    3,
		"mithril_mail":  5,
		"dragon_scale":  6,
		"celestial":     7,
	}
	return sprites.ItemLookup{
		WeaponTier: func(id string) (int, bool) {
			t, ok := weapons[id]
			return t, ok
		},
		ArmorTier: func(id string) (int, bool) {
			t, ok := armors[id]
			return t, ok
		},
	}
}

func TestCompose(t *testing.T) {
	pal := testPalettes()
	lookup := testLookup()

	tests := []struct {
		name       string
		classID    string
		promoted   bool
		promotesTo string
		equip      inventory.EquipmentSlots
		want       sprites.Composition
	}{
		{
			name:    "unarmed warrior uses class sprite with no tiers",
			classID: "warrior",
			equip:   inventory.EquipmentSlots{},
			want: sprites.Composition{
				BaseSprite:   "warrior",
				WeaponTier:   0,
				ArmorTier:    0,
				WeaponAccent: "",
				ArmorAccent:  "",
			},
		},
		{
			name:    "T1 weapon only sets weapon tier + accent",
			classID: "warrior",
			equip:   inventory.EquipmentSlots{WeaponID: "short_sword"},
			want: sprites.Composition{
				BaseSprite:   "warrior",
				WeaponTier:   1,
				ArmorTier:    0,
				WeaponAccent: "#8a8275",
				ArmorAccent:  "",
			},
		},
		{
			name:    "high tier weapon + low tier armor composes both",
			classID: "rogue",
			equip: inventory.EquipmentSlots{
				WeaponID: "mithril_blade",
				ArmorID:  "leather_armor",
			},
			want: sprites.Composition{
				BaseSprite:   "rogue",
				WeaponTier:   5,
				ArmorTier:    1,
				WeaponAccent: "#8a2be2",
				ArmorAccent:  "#6d4c41",
			},
		},
		{
			name:    "T7/T7 end-game combo",
			classID: "warrior",
			equip: inventory.EquipmentSlots{
				WeaponID: "dragonslayer",
				ArmorID:  "celestial",
			},
			want: sprites.Composition{
				BaseSprite:   "warrior",
				WeaponTier:   7,
				ArmorTier:    7,
				WeaponAccent: "#ffd700",
				ArmorAccent:  "#fbc02d",
			},
		},
		{
			name:    "unknown weapon id falls through gracefully",
			classID: "mender",
			equip:   inventory.EquipmentSlots{WeaponID: "ghost_blade"},
			want: sprites.Composition{
				BaseSprite:   "mender",
				WeaponTier:   0,
				ArmorTier:    0,
				WeaponAccent: "",
				ArmorAccent:  "",
			},
		},
		{
			name:       "promoted class uses promoted sprite as base",
			classID:    "warrior",
			promoted:   true,
			promotesTo: "knight",
			equip:      inventory.EquipmentSlots{WeaponID: "steel_sword"},
			want: sprites.Composition{
				BaseSprite:   "knight",
				WeaponTier:   3,
				ArmorTier:    0,
				WeaponAccent: "#c0c0c0",
				ArmorAccent:  "",
			},
		},
		{
			name:    "tier missing from palette produces empty accent but keeps tier",
			classID: "warrior",
			equip:   inventory.EquipmentSlots{WeaponID: "orichalcum_fang"},
			want: sprites.Composition{
				BaseSprite:   "warrior",
				WeaponTier:   6,
				ArmorTier:    0,
				WeaponAccent: "#ff9800",
				ArmorAccent:  "",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := sprites.Compose(sprites.Input{
				ClassID:    tc.classID,
				Promoted:   tc.promoted,
				PromotesTo: tc.promotesTo,
				Equip:      tc.equip,
				Palettes:   pal,
				Lookup:     lookup,
			})
			if got != tc.want {
				t.Errorf("Compose() = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestComposeNilPalettesIsSafe(t *testing.T) {
	lookup := testLookup()
	got := sprites.Compose(sprites.Input{
		ClassID:  "warrior",
		Equip:    inventory.EquipmentSlots{WeaponID: "short_sword"},
		Palettes: nil,
		Lookup:   lookup,
	})
	want := sprites.Composition{
		BaseSprite:   "warrior",
		WeaponTier:   1,
		ArmorTier:    0,
		WeaponAccent: "",
		ArmorAccent:  "",
	}
	if got != want {
		t.Errorf("Compose() with nil palettes = %+v, want %+v", got, want)
	}
}

func TestComposeMissingTierInPaletteLeavesAccentEmpty(t *testing.T) {
	pal := &gamedata.Palettes{
		WeaponTiers: map[int]string{1: "#aaaaaa"},
		ArmorTiers:  map[int]string{1: "#bbbbbb"},
	}
	lookup := testLookup()
	got := sprites.Compose(sprites.Input{
		ClassID:  "warrior",
		Equip:    inventory.EquipmentSlots{WeaponID: "steel_sword"},
		Palettes: pal,
		Lookup:   lookup,
	})
	if got.WeaponTier != 3 {
		t.Errorf("WeaponTier = %d, want 3", got.WeaponTier)
	}
	if got.WeaponAccent != "" {
		t.Errorf("WeaponAccent = %q, want empty (tier 3 not in palette)", got.WeaponAccent)
	}
}

func TestComposeIncludesWeaponVisualMetadata(t *testing.T) {
	lookup := testLookup()
	lookup.WeaponVisual = func(id string) (string, string, bool) {
		if id == "mithril_blade" {
			return "mythril_sword", "sword", true
		}
		return "", "", false
	}

	got := sprites.Compose(sprites.Input{
		ClassID:  "warrior",
		Equip:    inventory.EquipmentSlots{WeaponID: "mithril_blade"},
		Palettes: testPalettes(),
		Lookup:   lookup,
	})

	if got.WeaponVisualID != "mythril_sword" {
		t.Errorf("WeaponVisualID = %q, want mythril_sword", got.WeaponVisualID)
	}
	if got.WeaponAnimationSet != "sword" {
		t.Errorf("WeaponAnimationSet = %q, want sword", got.WeaponAnimationSet)
	}
}

func TestComposeIncludesShieldVisualMetadata(t *testing.T) {
	lookup := testLookup()
	lookup.ShieldVisual = func(id string) (string, string, bool) {
		if id == "steel_shield" {
			return "steel_shield", "shield", true
		}
		return "", "", false
	}

	got := sprites.Compose(sprites.Input{
		ClassID: "warrior",
		Equip: inventory.EquipmentSlots{
			ShieldID: "steel_shield",
		},
		Lookup: lookup,
	})

	if got.ShieldVisualID != "steel_shield" {
		t.Errorf("ShieldVisualID = %q, want steel_shield", got.ShieldVisualID)
	}
	if got.ShieldAnimationSet != "shield" {
		t.Errorf("ShieldAnimationSet = %q, want shield", got.ShieldAnimationSet)
	}
}
