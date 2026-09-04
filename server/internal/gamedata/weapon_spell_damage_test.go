package gamedata

import "testing"

func TestValidateWeaponSpellDamage(t *testing.T) {
	validateWeaponSpellDamage(Weapon{ID: "valid", Type: "staff", SpellDamagePct: 25})

	tests := []Weapon{
		{ID: "negative", Type: "staff", SpellDamagePct: -1},
		{ID: "too_high", Type: "staff", SpellDamagePct: 101},
		{ID: "sword", Type: "sword", SpellDamagePct: 10},
		{ID: "stale_text", Type: "staff", Special: "+10% spell damage"},
	}
	for _, weapon := range tests {
		t.Run(weapon.ID, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("invalid spell damage metadata did not panic")
				}
			}()
			validateWeaponSpellDamage(weapon)
		})
	}
}
