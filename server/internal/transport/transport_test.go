package transport

import "testing"

var testTiers = []Tier{
	{ID: "T1", Name: "Foot", RangeEdges: 2, Unlock: "start", EncounterRateMult: 1.0},
	{ID: "T2", Name: "Personal", RangeEdges: 4, Unlock: "act1_complete", EncounterRateMult: 0.75},
	{ID: "T3", Name: "Water", RangeEdges: 6, Unlock: "act2_midpoint", EncounterRateMult: 0.5, CrossesWater: true},
	{ID: "T4", Name: "Vehicle", RangeEdges: 8, Unlock: "promotion_event", EncounterRateMult: 0.25, CrossesWater: true},
	{ID: "T5", Name: "Sky", RangeEdges: 999, Unlock: "act3_midpoint", EncounterRateMult: 0.0, CrossesWater: true, Flies: true},
}

func TestNewState(t *testing.T) {
	s := NewState()
	if s.CurrentTier != "T1" {
		t.Fatalf("expected T1, got %s", s.CurrentTier)
	}
	if !s.Unlocked["T1"] {
		t.Fatal("T1 should be unlocked")
	}
}

func TestTryUnlock(t *testing.T) {
	tests := []struct {
		name      string
		condition string
		wantTier  string
		wantOK    bool
	}{
		{"act1_complete unlocks T2", "act1_complete", "T2", true},
		{"act2_midpoint unlocks T3", "act2_midpoint", "T3", true},
		{"promotion_event unlocks T4", "promotion_event", "T4", true},
		{"act3_midpoint unlocks T5", "act3_midpoint", "T5", true},
		{"unknown condition is no-op", "bogus", "T1", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := NewState()
			ok := s.TryUnlock(tc.condition, testTiers)
			if ok != tc.wantOK {
				t.Fatalf("TryUnlock(%q) = %v, want %v", tc.condition, ok, tc.wantOK)
			}
			if s.CurrentTier != tc.wantTier {
				t.Fatalf("CurrentTier = %s, want %s", s.CurrentTier, tc.wantTier)
			}
		})
	}
}

func TestTryUnlockOutOfOrder(t *testing.T) {
	s := NewState()
	// Unlock T4 (promotion_event) before T3 (act2_midpoint)
	s.TryUnlock("act1_complete", testTiers)
	s.TryUnlock("promotion_event", testTiers)
	if s.CurrentTier != "T4" {
		t.Fatalf("expected T4, got %s", s.CurrentTier)
	}
	// Now unlock T3 -- current should stay T4 (higher index)
	s.TryUnlock("act2_midpoint", testTiers)
	if s.CurrentTier != "T4" {
		t.Fatalf("expected T4 after T3 unlock, got %s", s.CurrentTier)
	}
}

func TestCurrentTierIsHighest(t *testing.T) {
	s := NewState()
	s.TryUnlock("act1_complete", testTiers)
	s.TryUnlock("act2_midpoint", testTiers)
	s.TryUnlock("promotion_event", testTiers)
	s.TryUnlock("act3_midpoint", testTiers)
	if s.CurrentTier != "T5" {
		t.Fatalf("expected T5, got %s", s.CurrentTier)
	}
	if len(s.Unlocked) != 5 {
		t.Fatalf("expected 5 unlocked tiers, got %d", len(s.Unlocked))
	}
}

func TestCanReach(t *testing.T) {
	tests := []struct {
		tier string
		dist int
		want bool
	}{
		{"T1", 2, true},
		{"T1", 3, false},
		{"T2", 4, true},
		{"T3", 6, true},
		{"T3", 7, false},
		{"T5", 100, true},
	}
	for _, tc := range tests {
		t.Run(tc.tier, func(t *testing.T) {
			s := &State{CurrentTier: tc.tier, Unlocked: map[string]bool{tc.tier: true}}
			got := s.CanReach(tc.dist, testTiers)
			if got != tc.want {
				t.Fatalf("CanReach(%d) with %s = %v, want %v", tc.dist, tc.tier, got, tc.want)
			}
		})
	}
}

func TestEncounterRate(t *testing.T) {
	tests := []struct {
		tier string
		want float64
	}{
		{"T1", 1.0},
		{"T2", 0.75},
		{"T3", 0.5},
		{"T4", 0.25},
		{"T5", 0.0},
	}
	for _, tc := range tests {
		t.Run(tc.tier, func(t *testing.T) {
			s := &State{CurrentTier: tc.tier, Unlocked: map[string]bool{tc.tier: true}}
			got := s.EncounterRate(testTiers)
			if got != tc.want {
				t.Fatalf("EncounterRate() with %s = %f, want %f", tc.tier, got, tc.want)
			}
		})
	}
}

func TestTryUnlockIdempotent(t *testing.T) {
	s := NewState()
	s.TryUnlock("act1_complete", testTiers)
	if s.CurrentTier != "T2" {
		t.Fatal("should be T2")
	}
	ok := s.TryUnlock("act1_complete", testTiers)
	if ok {
		t.Fatal("second unlock of same condition should return false")
	}
	if s.CurrentTier != "T2" {
		t.Fatal("tier should still be T2")
	}
}

func TestCurrentTierData(t *testing.T) {
	s := NewState()
	td := s.CurrentTierData(testTiers)
	if td == nil {
		t.Fatal("expected tier data")
	}
	if td.ID != "T1" {
		t.Fatalf("expected T1, got %s", td.ID)
	}
	if td.CrossesWater {
		t.Fatal("T1 should not cross water")
	}

	s.TryUnlock("act2_midpoint", testTiers)
	td = s.CurrentTierData(testTiers)
	if td.ID != "T3" {
		t.Fatalf("expected T3, got %s", td.ID)
	}
	if !td.CrossesWater {
		t.Fatal("T3 should cross water")
	}
	if td.Flies {
		t.Fatal("T3 should not fly")
	}
}
