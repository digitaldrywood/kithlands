package balance

// Difficulty defines multipliers applied at encounter generation time per Section 12.1.
// Multipliers are applied to monster stats when the encounter is created, not at runtime.
type Difficulty struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	EnemyHPMult      float64 `json:"enemy_hp_mult"`
	EnemyDamageMult  float64 `json:"enemy_damage_mult"`
	XPGainMult       float64 `json:"xp_gain_mult"`
	EncounterRateMult float64 `json:"encounter_rate_mult"`
}

var Difficulties = map[string]Difficulty{
	"easy": {
		ID: "easy", Name: "Easy",
		EnemyHPMult: 0.75, EnemyDamageMult: 0.75,
		XPGainMult: 1.25, EncounterRateMult: 0.50,
	},
	"normal": {
		ID: "normal", Name: "Normal",
		EnemyHPMult: 1.0, EnemyDamageMult: 1.0,
		XPGainMult: 1.0, EncounterRateMult: 1.0,
	},
	"hard": {
		ID: "hard", Name: "Hard",
		EnemyHPMult: 1.3, EnemyDamageMult: 1.3,
		XPGainMult: 0.9, EncounterRateMult: 1.3,
	},
	"classic": {
		ID: "classic", Name: "Classic",
		EnemyHPMult: 1.5, EnemyDamageMult: 1.5,
		XPGainMult: 0.8, EncounterRateMult: 1.5,
	},
}

func GetDifficulty(id string) Difficulty {
	if d, ok := Difficulties[id]; ok {
		return d
	}
	return Difficulties["normal"]
}
