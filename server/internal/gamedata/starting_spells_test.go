package gamedata

import "testing"

func TestStartingSpellConfigurationRejectsInvalidContent(t *testing.T) {
	gd := Load("../../../shared")
	for _, test := range []struct {
		name string
		ids  []string
	}{
		{"unknown", []string{"unknown"}}, {"wrong school", []string{"cure"}},
		{"not starting level", []string{"fireball"}}, {"duplicate", []string{"spark", "spark"}},
		{"full", []string{"spark", "frost", "sleep", "spark"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			class := *gd.ClassByID("cinder")
			class.Magic.StartingSpells = test.ids
			defer func() {
				if recover() == nil {
					t.Fatal("invalid starting spell configuration accepted")
				}
			}()
			gd.validateStartingSpells(class)
		})
	}
}

func TestUnconfiguredStarterContentKeepsLegacySelection(t *testing.T) {
	gd := Load("../../../shared")
	class := *gd.ClassByID("cinder")
	class.Magic.StartingSpells = nil
	got := gd.StartingSpellsForClass(&class)
	if len(got) != 3 || got[0].ID != "spark" || got[1].ID != "frost" || got[2].ID != "sleep" {
		t.Fatalf("legacy starter selection = %+v", got)
	}
}
