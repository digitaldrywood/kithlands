package transport

// Tier represents a mobility tier per Section 15.2.
type Tier struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	RangeEdges        int     `json:"range_edges"`
	Unlock            string  `json:"unlock"`
	EncounterRateMult float64 `json:"encounter_rate_mult"`
	CrossesWater      bool    `json:"crosses_water"`
	Flies             bool    `json:"flies"`
}

// State tracks the player's current transport tier and which tiers are unlocked.
type State struct {
	CurrentTier string          `json:"current_tier"`
	Unlocked    map[string]bool `json:"unlocked"`
}

func NewState() *State {
	return &State{
		CurrentTier: "T1",
		Unlocked:    map[string]bool{"T1": true},
	}
}

// TryUnlock unlocks the tier whose Unlock condition matches. Returns true if a
// new tier was actually unlocked. CurrentTier is updated to the highest unlocked
// tier (by position in the tiers slice).
func (s *State) TryUnlock(condition string, tiers []Tier) bool {
	unlocked := false
	for _, t := range tiers {
		if t.Unlock == condition && !s.Unlocked[t.ID] {
			if s.Unlocked == nil {
				s.Unlocked = make(map[string]bool)
			}
			s.Unlocked[t.ID] = true
			unlocked = true
		}
	}
	if unlocked {
		s.updateCurrent(tiers)
	}
	return unlocked
}

// updateCurrent sets CurrentTier to the highest-index unlocked tier.
func (s *State) updateCurrent(tiers []Tier) {
	for i := len(tiers) - 1; i >= 0; i-- {
		if s.Unlocked[tiers[i].ID] {
			s.CurrentTier = tiers[i].ID
			return
		}
	}
}

// CurrentTierData returns the full Tier definition for the current tier.
func (s *State) CurrentTierData(tiers []Tier) *Tier {
	for i := range tiers {
		if tiers[i].ID == s.CurrentTier {
			return &tiers[i]
		}
	}
	return nil
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

// EncounterRate returns the encounter rate multiplier for the current tier.
func (s *State) EncounterRate(tiers []Tier) float64 {
	for _, t := range tiers {
		if t.ID == s.CurrentTier {
			return t.EncounterRateMult
		}
	}
	return 1.0
}
