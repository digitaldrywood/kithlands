// Package sprites computes a per-character sprite composition descriptor
// from class, promotion, and equipment state. The descriptor is emitted
// in PartyMemberState and consumed by the client to render the character
// with equipment-driven visual accents (tier glow, palette swap, future
// layered overlays).
package sprites

import (
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

// Composition describes how a character sprite should be rendered on the
// client. Zero-value fields indicate "no accent" and the client renders
// the base sprite unchanged.
type Composition struct {
	BaseSprite         string `json:"base_sprite"`
	WeaponTier         int    `json:"weapon_tier,omitempty"`
	ArmorTier          int    `json:"armor_tier,omitempty"`
	WeaponAccent       string `json:"weapon_accent,omitempty"`
	ArmorAccent        string `json:"armor_accent,omitempty"`
	WeaponVisualID     string `json:"weapon_visual_id,omitempty"`
	WeaponAnimationSet string `json:"weapon_animation_set,omitempty"`
	ShieldVisualID     string `json:"shield_visual_id,omitempty"`
	ShieldAnimationSet string `json:"shield_animation_set,omitempty"`
}

// ItemLookup bridges the sprites package to gamedata without creating a
// hard dependency on a concrete GameData shape. Callers pass closures that
// return the tier for a given item id, or (0, false) when the id is unknown.
type ItemLookup struct {
	WeaponTier   func(id string) (int, bool)
	WeaponVisual func(id string) (visualID, animationSet string, ok bool)
	ShieldVisual func(id string) (visualID, animationSet string, ok bool)
	ArmorTier    func(id string) (int, bool)
}

// Input is the full set of facts needed to compute a Composition.
type Input struct {
	ClassID    string
	Promoted   bool
	PromotesTo string
	Equip      inventory.EquipmentSlots
	Palettes   *gamedata.Palettes
	Lookup     ItemLookup
}

// Compose produces a Composition for a single character. It is pure: no
// I/O, no global state, safe to call from any goroutine.
func Compose(in Input) Composition {
	comp := Composition{BaseSprite: baseSprite(in)}

	if in.Equip.WeaponID != "" && in.Lookup.WeaponTier != nil {
		if tier, ok := in.Lookup.WeaponTier(in.Equip.WeaponID); ok {
			comp.WeaponTier = tier
			comp.WeaponAccent = lookupColor(in.Palettes, tier, true)
		}
	}
	if in.Equip.WeaponID != "" && in.Lookup.WeaponVisual != nil {
		if visualID, animationSet, ok := in.Lookup.WeaponVisual(in.Equip.WeaponID); ok {
			comp.WeaponVisualID = visualID
			comp.WeaponAnimationSet = animationSet
		}
	}
	if in.Equip.ShieldID != "" && in.Lookup.ShieldVisual != nil {
		if visualID, animationSet, ok := in.Lookup.ShieldVisual(in.Equip.ShieldID); ok {
			comp.ShieldVisualID = visualID
			comp.ShieldAnimationSet = animationSet
		}
	}
	if in.Equip.ArmorID != "" && in.Lookup.ArmorTier != nil {
		if tier, ok := in.Lookup.ArmorTier(in.Equip.ArmorID); ok {
			comp.ArmorTier = tier
			comp.ArmorAccent = lookupColor(in.Palettes, tier, false)
		}
	}
	return comp
}

func baseSprite(in Input) string {
	if in.Promoted && in.PromotesTo != "" {
		return in.PromotesTo
	}
	return in.ClassID
}

func lookupColor(p *gamedata.Palettes, tier int, weapon bool) string {
	if p == nil {
		return ""
	}
	if weapon {
		return p.WeaponTiers[tier]
	}
	return p.ArmorTiers[tier]
}

// LookupFromGameData builds an ItemLookup backed by a GameData instance.
// Lives here (not in gamedata) so the sprites package stays the single
// owner of its lookup contract.
func LookupFromGameData(gd *gamedata.GameData) ItemLookup {
	return ItemLookup{
		WeaponTier: func(id string) (int, bool) {
			if w := gd.WeaponByID(id); w != nil {
				return w.Tier, true
			}
			return 0, false
		},
		WeaponVisual: func(id string) (string, string, bool) {
			if w := gd.WeaponByID(id); w != nil {
				return w.VisualID, w.AnimationSet, w.VisualID != "" && w.AnimationSet != ""
			}
			return "", "", false
		},
		ShieldVisual: func(id string) (string, string, bool) {
			if shield := gd.ShieldByID(id); shield != nil {
				return shield.VisualID, shield.AnimationSet, shield.VisualID != "" && shield.AnimationSet != ""
			}
			return "", "", false
		},
		ArmorTier: func(id string) (int, bool) {
			if a := gd.ArmorByID(id); a != nil {
				return a.Tier, true
			}
			return 0, false
		},
	}
}
