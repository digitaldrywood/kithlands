package gamedata

import (
	"fmt"
	"strings"
	"testing"
)

func TestLootValidationRejectsInactiveOrNonDistinctBuildEffects(t *testing.T) {
	tests := []struct {
		name   string
		want   string
		mutate func(*GameData)
	}{
		{
			name: "inactive affix stat",
			want: "inactive stat",
			mutate: func(gd *GameData) {
				gd.Loot.Affixes[0].Modifier.Stat = "vit"
			},
		},
		{
			name: "too few eligible armor affixes",
			want: "want at least 4",
			mutate: func(gd *GameData) {
				for i, affix := range gd.Loot.Affixes {
					if affix.ID == "steadfast" {
						gd.Loot.Affixes = append(gd.Loot.Affixes[:i], gd.Loot.Affixes[i+1:]...)
						return
					}
				}
			},
		},
		{
			name: "rare pool has one functional weapon role",
			want: "functionally distinct",
			mutate: func(gd *GameData) {
				for i := range gd.Loot.Affixes {
					if gd.Loot.Affixes[i].Kinds[0] == "weapon" {
						gd.Loot.Affixes[i].Modifier.Stat = "power"
					}
				}
			},
		},
		{
			name: "gem omits an equipment kind",
			want: "has no accessory effect",
			mutate: func(gd *GameData) {
				gd.Loot.Gems[0].Effects = gd.Loot.Gems[0].Effects[:2]
			},
		},
		{
			name: "ember and ward repeat a weapon role",
			want: "need distinct active weapon roles",
			mutate: func(gd *GameData) {
				for gemIndex := range gd.Loot.Gems {
					if gd.Loot.Gems[gemIndex].Family != "ward" {
						continue
					}
					for effectIndex := range gd.Loot.Gems[gemIndex].Effects {
						if gd.Loot.Gems[gemIndex].Effects[effectIndex].Kind == "weapon" {
							gd.Loot.Gems[gemIndex].Effects[effectIndex].Stat = "power"
						}
					}
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gd := Load("../../../shared")
			tt.mutate(gd)
			defer func() {
				got := recover()
				if got == nil || !strings.Contains(fmt.Sprint(got), tt.want) {
					t.Fatalf("validateLoot panic = %v, want text %q", got, tt.want)
				}
			}()
			gd.validateLoot()
		})
	}
}
