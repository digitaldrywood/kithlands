package balance

import (
	"math/rand/v2"
	"slices"

	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// SizeMaxPerEncounter enforces the cap per enemy size category.
var SizeMaxPerEncounter = map[string]int{
	"small":  6,
	"medium": 4,
	"large":  2,
	"boss":   1,
}

const StarterProtectedEncounterCount = 6

type EncounterProfile struct {
	// WorldEncounterIndex is the zero-based count of successful overworld
	// encounters already started on this save. Negative disables all special
	// first-encounter protections.
	WorldEncounterIndex int
}

// EncounterResult holds the generated combatants plus formation metadata.
type EncounterResult struct {
	Combatants  []*combat.Combatant
	Layout      string
	FormationID string
}

// GenerateFormationEncounter picks an eligible formation from gd.Formations,
// resolves each slot to a random count, scales all combatants, and returns
// the result with layout metadata.
func GenerateFormationEncounter(gd *gamedata.GameData, encounterLevel int, diff Difficulty, terrainTag string, rng *rand.Rand) EncounterResult {
	return GenerateFormationEncounterWithProfile(gd, encounterLevel, diff, terrainTag, EncounterProfile{WorldEncounterIndex: -1}, rng)
}

// GenerateFormationEncounterWithProfile applies first-encounter tutorial and
// starter-safe formation filters before performing the normal weighted pick.
func GenerateFormationEncounterWithProfile(gd *gamedata.GameData, encounterLevel int, diff Difficulty, terrainTag string, profile EncounterProfile, rng *rand.Rand) EncounterResult {
	var eligible []gamedata.Formation
	var totalWeight int
	relaxedMaxCap := false
	for _, f := range gd.Formations {
		if !formationEligibleForEncounter(f, encounterLevel, terrainTag, profile, false) {
			continue
		}
		eligible = append(eligible, f)
		totalWeight += f.Weight
	}
	eligible, totalWeight = applyEarlyFormationFilters(eligible, profile)

	if len(eligible) == 0 {
		// Once the party outlevels the authored encounter caps, keep using real
		// formations and let ScaleMonster provide the pressure rather than
		// collapsing into the single-slime fallback. Reward only the authored
		// monster XP on this relaxed path so difficulty rises without exploding
		// progression.
		relaxedMaxCap = true
		for _, f := range gd.Formations {
			if !formationEligibleForEncounter(f, encounterLevel, terrainTag, profile, true) {
				continue
			}
			eligible = append(eligible, f)
			totalWeight += f.Weight
		}
		eligible, totalWeight = applyEarlyFormationFilters(eligible, profile)
	}

	if len(eligible) == 0 {
		// Fallback: single slime
		m := gd.MonsterByID("slime")
		if m == nil && len(gd.Monsters) > 0 {
			m = &gd.Monsters[0]
		}
		if m == nil {
			return EncounterResult{Layout: "line"}
		}
		c := ScaleMonster(m, 100, encounterLevel, diff)
		c.MonsterID = m.ID
		c.Size = m.Size
		return EncounterResult{
			Combatants:  []*combat.Combatant{c},
			Layout:      "line",
			FormationID: "",
		}
	}

	// Weighted random pick
	roll := rng.IntN(totalWeight)
	var picked gamedata.Formation
	cumulative := 0
	for _, f := range eligible {
		cumulative += f.Weight
		if roll < cumulative {
			picked = f
			break
		}
	}

	// Resolve slots
	sizeCounts := make(map[string]int)
	var combatants []*combat.Combatant
	combatantID := 100
	scaledEncounterLevel := encounterLevel
	if relaxedMaxCap && picked.MaxEncounterLevel > 0 {
		scaledEncounterLevel = min(encounterLevel, picked.MaxEncounterLevel+4)
	}

	for _, slot := range picked.Slots {
		m := gd.MonsterByID(slot.MonsterID)
		if m == nil {
			continue
		}

		count := slot.Min
		if slot.Max > slot.Min {
			count += rng.IntN(slot.Max - slot.Min + 1)
		}

		// Enforce size cap
		cap := SizeMaxPerEncounter[m.Size]
		if cap > 0 {
			remaining := cap - sizeCounts[m.Size]
			if remaining <= 0 {
				continue
			}
			if count > remaining {
				count = remaining
			}
		}

		for i := 0; i < count; i++ {
			c := ScaleMonster(m, combatantID, scaledEncounterLevel, diff)
			if relaxedMaxCap {
				c.XPReward = max(1, int(float64(m.XPReward)*diff.XPGainMult*0.85))
			}
			c.MonsterID = m.ID
			c.Size = m.Size
			combatants = append(combatants, c)
			combatantID++
		}
		sizeCounts[m.Size] += count
	}

	return EncounterResult{
		Combatants:  combatants,
		Layout:      picked.Layout,
		FormationID: picked.ID,
	}
}

func formationEligibleForEncounter(f gamedata.Formation, encounterLevel int, terrainTag string, profile EncounterProfile, relaxedMaxCap bool) bool {
	if f.Weight == 0 {
		return false
	}
	if encounterLevel < f.MinEncounterLevel {
		return false
	}
	if !relaxedMaxCap && f.MaxEncounterLevel > 0 && encounterLevel > f.MaxEncounterLevel {
		return false
	}
	if !formationMatchesTerrain(f, terrainTag) {
		return false
	}
	if f.TutorialOnly && !profile.tutorialEncounter() {
		return false
	}
	return true
}

func applyEarlyFormationFilters(eligible []gamedata.Formation, profile EncounterProfile) ([]gamedata.Formation, int) {
	filtered := eligible
	switch {
	case profile.tutorialEncounter():
		if tutorial, totalWeight := filterFormations(eligible, func(f gamedata.Formation) bool {
			return f.TutorialOnly
		}); len(tutorial) > 0 {
			return tutorial, totalWeight
		}
	case profile.starterProtected():
		if safe, totalWeight := filterFormations(eligible, func(f gamedata.Formation) bool {
			return f.StarterSafe
		}); len(safe) > 0 {
			return safe, totalWeight
		}
	}

	totalWeight := 0
	for _, f := range filtered {
		totalWeight += f.Weight
	}
	return filtered, totalWeight
}

func filterFormations(in []gamedata.Formation, keep func(gamedata.Formation) bool) ([]gamedata.Formation, int) {
	var out []gamedata.Formation
	totalWeight := 0
	for _, f := range in {
		if !keep(f) {
			continue
		}
		out = append(out, f)
		totalWeight += f.Weight
	}
	return out, totalWeight
}

func (p EncounterProfile) tutorialEncounter() bool {
	return p.WorldEncounterIndex == 0
}

func (p EncounterProfile) starterProtected() bool {
	return p.WorldEncounterIndex > 0 && p.WorldEncounterIndex < StarterProtectedEncounterCount
}

func formationMatchesTerrain(f gamedata.Formation, terrainTag string) bool {
	if terrainTag == "" || len(f.TerrainTags) == 0 {
		return true
	}
	return slices.Contains(f.TerrainTags, "any") || slices.Contains(f.TerrainTags, terrainTag)
}
