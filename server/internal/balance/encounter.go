package balance

import (
	"math/rand/v2"

	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// EncounterLevel computes the encounter level per Section 12.4:
// encounter_level = avg(party_levels) + difficulty_mod + flavor_mod + distance_mod
func EncounterLevel(partyLevels []int, difficulty string, flavorMod, distanceMod int) int {
	if len(partyLevels) == 0 {
		return 1
	}

	sum := 0
	for _, l := range partyLevels {
		sum += l
	}
	avg := sum / len(partyLevels)

	diffMod := map[string]int{
		"easy": 0, "normal": 0, "hard": 2, "classic": 3,
	}

	mod := diffMod[difficulty]
	level := avg + mod + flavorMod + distanceMod
	if level < 1 {
		level = 1
	}
	return level
}

// ScaleMonster creates a combat-ready combatant from a monster definition,
// scaled by encounter level and difficulty multipliers.
func ScaleMonster(m *gamedata.Monster, id int, encounterLevel int, diff Difficulty) *combat.Combatant {
	// Scale stats by encounter level relative to monster tier
	levelScale := encounterLevel - m.Tier
	if levelScale < 0 {
		levelScale = 0
	}

	hpScale := 1.0 + 0.10*float64(levelScale)
	hp := int(float64(m.HP) * hpScale * diff.EnemyHPMult)
	if hp < 1 {
		hp = 1
	}

	damageScale := 1.0 + 0.05*float64(levelScale)
	str := int(float64(m.Stats.STR) * damageScale * diff.EnemyDamageMult)
	if str < 1 {
		str = 1
	}

	hitPct := m.Stats.HitPct + levelScale*2
	if hitPct < 1 {
		hitPct = 1
	}

	// XP scales with encounter level (+50% per level above tier) and applies
	// the per-difficulty XPGainMult. Floored at the raw base so low-difficulty
	// or under-tier encounters never pay less than the JSON value — issue #121.
	xpReward := int(float64(m.XPReward) * (1.0 + 0.5*float64(levelScale)) * diff.XPGainMult)
	if xpReward < m.XPReward {
		xpReward = m.XPReward
	}

	return &combat.Combatant{
		ID:          id,
		Name:        m.Name,
		IsPlayer:    false,
		STR:         str,
		AGI:         m.Stats.AGI + levelScale/2,
		INT:         m.Stats.INT,
		VIT:         m.Stats.VIT,
		LCK:         m.Stats.LCK,
		HitPct:      hitPct,
		MaxHP:       hp,
		CurrentHP:   hp,
		WeaponPower: 0,
		ArmorAbsorb: m.ArmorAbsorb,
		XPReward:    xpReward,
	}
}

// GenerateEncounter picks monsters for a random encounter at the given level.
// Kept for backward compatibility with balance_sim. New code should use
// GenerateFormationEncounter which supports mixed formations and layouts.
func GenerateEncounter(monsters []gamedata.Monster, encounterLevel int, diff Difficulty, rng *rand.Rand) []*combat.Combatant {
	// Filter to eligible monsters (tier <= encounterLevel)
	var eligible []gamedata.Monster
	var totalWeight int
	for _, m := range monsters {
		if m.IsBoss || m.EncounterWeight == 0 {
			continue
		}
		if m.Tier <= encounterLevel {
			eligible = append(eligible, m)
			totalWeight += m.EncounterWeight
		}
	}
	if len(eligible) == 0 {
		eligible = append(eligible, monsters[0])
		totalWeight = monsters[0].EncounterWeight
	}

	// Weighted random pick
	roll := rng.IntN(totalWeight)
	var picked gamedata.Monster
	cumulative := 0
	for _, m := range eligible {
		cumulative += m.EncounterWeight
		if roll < cumulative {
			picked = m
			break
		}
	}

	// Random group size
	count := picked.MinGroup
	if picked.MaxGroup > picked.MinGroup {
		count += rng.IntN(picked.MaxGroup - picked.MinGroup + 1)
	}

	var group []*combat.Combatant
	for i := 0; i < count; i++ {
		group = append(group, ScaleMonster(&picked, 100+i, encounterLevel, diff))
	}

	return group
}
