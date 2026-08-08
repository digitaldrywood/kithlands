package inventory

import (
	"fmt"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

type ResolvedInstance struct {
	Name    string
	Power   int
	Absorb  int
	Affixes []ResolvedAffix
	Sockets []ResolvedSocket
}

type ResolvedAffix struct {
	Name  string
	Stat  string
	Value int
}

type ResolvedSocket struct {
	GemID   string
	GemName string
	Stat    string
	Value   int
}

// ResolveInstance composes base, rolled affix, and socketed gem values.
func ResolveInstance(item *EquipmentInstance, gd *gamedata.GameData) (ResolvedInstance, error) {
	if item == nil {
		return ResolvedInstance{}, fmt.Errorf("equipment instance is nil")
	}
	resolved := ResolvedInstance{}
	switch item.Kind {
	case "weapon":
		base := gd.WeaponByID(item.BaseID)
		if base == nil {
			return resolved, fmt.Errorf("weapon base %q not found", item.BaseID)
		}
		resolved.Name = base.Name
		resolved.Power = base.Power
	case "armor":
		base := gd.ArmorByID(item.BaseID)
		if base == nil {
			return resolved, fmt.Errorf("armor base %q not found", item.BaseID)
		}
		resolved.Name = base.Name
		resolved.Absorb = base.Absorb
	default:
		return resolved, fmt.Errorf("invalid equipment kind %q", item.Kind)
	}

	var prefixes, suffixes []string
	for _, roll := range item.Affixes {
		affix := gd.LootAffixByID(roll.AffixID)
		if affix == nil {
			continue
		}
		resolved.Affixes = append(resolved.Affixes, ResolvedAffix{
			Name: affix.Name, Stat: affix.Modifier.Stat, Value: roll.Value,
		})
		resolved.add(affix.Modifier.Stat, roll.Value)
		if affix.Position == "prefix" {
			prefixes = append(prefixes, affix.Name)
		} else {
			suffixes = append(suffixes, affix.Name)
		}
	}
	resolved.Name = strings.TrimSpace(strings.Join(prefixes, " ") + " " + resolved.Name + " " + strings.Join(suffixes, " "))

	for _, socket := range item.Sockets {
		view := ResolvedSocket{GemID: socket.GemID}
		if gem := gd.GemByID(socket.GemID); gem != nil {
			view.GemName = gem.Name
			for _, effect := range gem.Effects {
				if effect.Kind != item.Kind {
					continue
				}
				view.Stat, view.Value = effect.Stat, effect.Value
				resolved.add(effect.Stat, effect.Value)
			}
		}
		resolved.Sockets = append(resolved.Sockets, view)
	}
	return resolved, nil
}

func (r *ResolvedInstance) add(stat string, value int) {
	switch stat {
	case "power":
		r.Power += value
	case "absorb":
		r.Absorb += value
	}
}
