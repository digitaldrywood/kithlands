package interiors

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDirGroupsTemplatesByBuildingTypeAndPicksDeterministically(t *testing.T) {
	dir := t.TempDir()
	interiorsDir := filepath.Join(dir, "interiors")
	if err := os.MkdirAll(interiorsDir, 0o755); err != nil {
		t.Fatalf("mkdir interiors: %v", err)
	}

	writeTemplate(t, interiorsDir, "inn_a.json", `{
  "id": "inn_a",
  "building_type": "inn",
  "floors": [
    {
      "floor_id": 0,
      "width": 6,
      "height": 5,
      "rows": [
        "WWWDWW",
        "W....W",
        "W.U..W",
        "W....W",
        "WWWWWW"
      ],
      "entrance": {"x": 3, "y": 0},
      "presentation": {
        "background_asset": "/interiors/inn/inn-a.png",
        "hide_tile_layer": true
      },
      "stairs": [{"x": 2, "y": 2, "to_floor": 1, "to_x": 2, "to_y": 2, "kind": "up"}],
      "chest_anchors": [{"id": "chest_a", "x": 4, "y": 2}],
      "npc_anchors": [{"role": "innkeeper", "x": 1, "y": 1}]
    },
    {
      "floor_id": 1,
      "width": 6,
      "height": 5,
      "rows": [
        "WWWWWW",
        "W....W",
        "W.V..W",
        "W....W",
        "WWWWWW"
      ],
      "stairs": [{"x": 2, "y": 2, "to_floor": 0, "to_x": 2, "to_y": 2, "kind": "down"}],
      "chest_anchors": [],
      "npc_anchors": [{"role": "flavor", "x": 1, "y": 1}]
    }
  ]
}`)
	writeTemplate(t, interiorsDir, "inn_b.json", `{
  "id": "inn_b",
  "building_type": "inn",
  "floors": [{
    "floor_id": 0,
    "width": 6,
    "height": 5,
    "rows": [
      "WWWDWW",
      "W....W",
      "W....W",
      "W....W",
      "WWWWWW"
    ],
    "entrance": {"x": 3, "y": 0},
    "chest_anchors": [{"id": "chest_b", "x": 4, "y": 2}],
    "npc_anchors": [{"role": "innkeeper", "x": 1, "y": 1}]
  }]
}`)
	writeTemplate(t, interiorsDir, "shop_a.json", `{
  "id": "shop_a",
  "building_type": "shop",
  "floors": [{
    "floor_id": 0,
    "width": 6,
    "height": 5,
    "rows": [
      "WWWDWW",
      "W....W",
      "W....W",
      "W....W",
      "WWWWWW"
    ],
    "entrance": {"x": 3, "y": 0},
    "chest_anchors": [{"id": "shop_chest", "x": 4, "y": 2}],
    "npc_anchors": [{"role": "shopkeeper", "x": 1, "y": 1}]
  }]
}`)

	registry, err := LoadDir(dir)
	if err != nil {
		t.Fatalf("LoadDir: %v", err)
	}

	if got, want := len(registry.ByBuildingType["inn"]), 2; got != want {
		t.Fatalf("inn template count = %d, want %d", got, want)
	}
	if got, want := len(registry.ByBuildingType["shop"]), 1; got != want {
		t.Fatalf("shop template count = %d, want %d", got, want)
	}

	first := registry.Pick("inn", 42)
	second := registry.Pick("inn", 42)
	if first == nil || second == nil {
		t.Fatalf("Pick returned nil template")
	}
	if first.ID != second.ID {
		t.Fatalf("Pick not deterministic: %q != %q", first.ID, second.ID)
	}
	if registry.Pick("temple", 99) != nil {
		t.Fatal("expected nil template for missing building type")
	}
	gotPresentation := first.Floors[0].Presentation
	if gotPresentation == nil {
		t.Fatal("expected authored floor presentation")
	}
	if got, want := gotPresentation.BackgroundAsset, "/interiors/inn/inn-a.png"; got != want {
		t.Fatalf("background asset = %q, want %q", got, want)
	}
	if !gotPresentation.HideTileLayer {
		t.Fatal("expected presentation to hide generated tile layer")
	}
}

func TestLoadDirRejectsRelativePresentationAsset(t *testing.T) {
	dir := t.TempDir()
	interiorsDir := filepath.Join(dir, "interiors")
	if err := os.MkdirAll(interiorsDir, 0o755); err != nil {
		t.Fatalf("mkdir interiors: %v", err)
	}

	writeTemplate(t, interiorsDir, "broken_house.json", `{
  "id": "broken_house",
  "building_type": "house",
  "floors": [{
    "floor_id": 0,
    "width": 5,
    "height": 5,
    "rows": ["WWDWW", "W...W", "W...W", "W...W", "WWWWW"],
    "entrance": {"x": 2, "y": 0},
    "presentation": {"background_asset": "interiors/house.png"}
  }]
}`)

	if _, err := LoadDir(dir); err == nil {
		t.Fatal("expected relative presentation asset validation error")
	}
}

func TestLoadDirRejectsChestAnchorsOutsideFloorBounds(t *testing.T) {
	dir := t.TempDir()
	interiorsDir := filepath.Join(dir, "interiors")
	if err := os.MkdirAll(interiorsDir, 0o755); err != nil {
		t.Fatalf("mkdir interiors: %v", err)
	}

	writeTemplate(t, interiorsDir, "broken_house.json", `{
  "id": "broken_house",
  "building_type": "house",
  "floors": [{
    "floor_id": 0,
    "width": 5,
    "height": 5,
    "rows": [
      "WWDWW",
      "W...W",
      "W...W",
      "W...W",
      "WWWWW"
    ],
    "entrance": {"x": 2, "y": 0},
    "chest_anchors": [{"id": "bad", "x": 9, "y": 2}],
    "npc_anchors": [{"role": "elder", "x": 1, "y": 1}]
  }]
}`)

	if _, err := LoadDir(dir); err == nil {
		t.Fatal("expected out-of-bounds chest anchor validation error")
	}
}

func writeTemplate(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
		t.Fatalf("write template %s: %v", name, err)
	}
}
