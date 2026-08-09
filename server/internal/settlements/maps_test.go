package settlements

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadDirLoadsCadottByLocality(t *testing.T) {
	t.Parallel()

	registry, err := LoadDir("../../../shared")
	if err != nil {
		t.Fatalf("LoadDir: %v", err)
	}
	townMap := registry.ForLocality("Cadott, WI")
	if townMap == nil {
		t.Fatal("Cadott map not found")
	}
	if got, want := townMap.Property("id"), "cadott-town"; got != want {
		t.Fatalf("map id = %q, want %q", got, want)
	}
	store := townMap.Layer("interactions").Object("general-store-door")
	if store == nil || store.Property("destination_id") != "cadott-general-store" {
		t.Fatalf("general store transition = %#v", store)
	}
}

func TestMapValidationRejectsBrokenTransitionContent(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		mutate  func(*Map)
		wantErr string
	}{
		{name: "wrong layer order", mutate: func(townMap *Map) {
			townMap.Layers[0], townMap.Layers[1] = townMap.Layers[1], townMap.Layers[0]
		}, wantErr: "layer 0"},
		{name: "missing return anchor", mutate: func(townMap *Map) {
			townMap.Layer("interactions").Objects[0].Properties[5].Value = "missing-spawn"
		}, wantErr: "missing return anchor"},
		{name: "door outside map", mutate: func(townMap *Map) {
			townMap.Layer("interactions").Objects[0].X = 900
		}, wantErr: "out of bounds"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			townMap := loadCadottFixture(t)
			tc.mutate(townMap)
			err := townMap.Validate()
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("Validate() error = %v, want substring %q", err, tc.wantErr)
			}
		})
	}
}

func loadCadottFixture(t *testing.T) *Map {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("../../../shared", "settlements", "cadott-town.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var townMap Map
	if err := json.Unmarshal(data, &townMap); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	return &townMap
}
