package gamedata

import (
	"fmt"
	"strings"
	"testing"
)

func TestBattleContactFamilyValidation(t *testing.T) {
	for _, family := range []string{"", "slash", "blunt", "unknown"} {
		t.Run(family, func(t *testing.T) {
			gd := Load("../../../shared")
			profile := gd.BattleCharacterByID("cinder")
			state := profile.States["physical_attack"]
			state.ContactFamily = family
			profile.States["physical_attack"] = state
			classes := make(map[string]bool)
			for _, class := range gd.Classes {
				classes[class.ID] = true
			}
			defer func() {
				got := recover()
				if family == "unknown" {
					if got == nil || !strings.Contains(fmt.Sprint(got), "contact_family") {
						t.Fatalf("invalid contact family validation = %v", got)
					}
				} else if got != nil {
					t.Fatalf("valid contact family rejected: %v", got)
				}
			}()
			gd.validateBattleCharacters(classes)
		})
	}
}
