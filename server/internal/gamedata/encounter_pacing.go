package gamedata

import "fmt"

// EncounterPacing defines a distance budget in ordinary grass steps.
type EncounterPacing struct {
	MinimumGrassSteps int             `json:"minimum_grass_steps"`
	MaximumGrassSteps int             `json:"maximum_grass_steps"`
	SafeSteps         int             `json:"safe_steps"`
	TerrainWeights    map[int]float64 `json:"terrain_weights"`
}

func (p EncounterPacing) Validate() error {
	if p.MinimumGrassSteps <= 0 || p.MaximumGrassSteps < p.MinimumGrassSteps || p.SafeSteps < 0 || p.SafeSteps >= p.MinimumGrassSteps {
		return fmt.Errorf("invalid encounter pacing interval")
	}
	if p.TerrainWeights[0] != 1 {
		return fmt.Errorf("encounter pacing grass weight must be one")
	}
	for tile, weight := range p.TerrainWeights {
		if tile < 0 || tile > 18 || weight < 0 || weight > 10 {
			return fmt.Errorf("invalid encounter terrain weight for %d", tile)
		}
	}
	return nil
}
