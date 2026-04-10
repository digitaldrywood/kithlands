package api

import "testing"

func TestMilesToMeters(t *testing.T) {
	tests := []struct {
		name  string
		miles float64
		want  int
	}{
		{"default when zero", 0, 2400},
		{"default when negative", -5, 2400},
		{"clamp below minimum", 0.2, 804},
		{"minimum boundary", 0.5, 804},
		{"normal small radius", 1.5, 2414},
		{"normal mid radius", 10, 16093},
		{"at cap", 30, 48280},
		{"clamp above cap", 50, 48280},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := milesToMeters(tt.miles)
			if got != tt.want {
				t.Errorf("milesToMeters(%v) = %d, want %d", tt.miles, got, tt.want)
			}
		})
	}
}
