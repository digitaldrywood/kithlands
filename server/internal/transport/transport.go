package transport

// Tier represents a mobility tier per Section 15.2.
type Tier struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	RangeEdges       int     `json:"range_edges"`
	Unlock           string  `json:"unlock"`
	EncounterRateMult float64 `json:"encounter_rate_mult"`
}

// State tracks the player's current transport tier in a save.
type State struct {
	CurrentTier string `json:"current_tier"`
}

func NewState() *State {
	return &State{CurrentTier: "T1"}
}

// CanReach returns true if the given graph distance is reachable with the current tier.
func (s *State) CanReach(distance int, tiers []Tier) bool {
	for _, t := range tiers {
		if t.ID == s.CurrentTier {
			return distance <= t.RangeEdges
		}
	}
	return distance <= 2 // fallback to foot
}

// Upgrade advances to the next tier.
func (s *State) Upgrade(tiers []Tier) bool {
	for i, t := range tiers {
		if t.ID == s.CurrentTier && i+1 < len(tiers) {
			s.CurrentTier = tiers[i+1].ID
			return true
		}
	}
	return false
}

// EncounterRate returns the encounter rate multiplier for the current tier.
func (s *State) EncounterRate(tiers []Tier) float64 {
	for _, t := range tiers {
		if t.ID == s.CurrentTier {
			return t.EncounterRateMult
		}
	}
	return 1.0
}
