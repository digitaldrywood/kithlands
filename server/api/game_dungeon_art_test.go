package api

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDungeonArtOnlyServesRegisteredImages(t *testing.T) {
	gd := loadSharedForTest(t)
	root := t.TempDir()
	artDir := filepath.Join(root, "dungeons", "art")
	if err := os.MkdirAll(artDir, 0o700); err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	const prefix = "/api/data/dungeons/art/"
	for _, definition := range gd.Dungeons {
		for _, room := range definition.Rooms {
			for _, layer := range room.Map.Layers {
				if strings.HasPrefix(layer.Image, prefix) {
					names[strings.TrimPrefix(layer.Image, prefix)] = true
				}
			}
			for _, variant := range room.VisualVariants {
				if strings.HasPrefix(variant.Image, prefix) {
					names[strings.TrimPrefix(variant.Image, prefix)] = true
				}
			}
		}
	}
	if len(names) == 0 {
		t.Fatal("proof must cover the actual dungeon image registry")
	}
	data := []byte("\x89PNG\r\n\x1a\nart")
	s := &Server{gd: gd, games: &GameManager{sharedDir: root}}
	serve := func(name string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, prefix+url.PathEscape(name), nil)
		r.SetPathValue("file", name)
		w := httptest.NewRecorder()
		s.handleDungeonArt(w, r)
		return w
	}
	for name := range names {
		if err := os.WriteFile(filepath.Join(artDir, name), data, 0o600); err != nil {
			t.Fatal(err)
		}
		w := serve(name)
		if w.Code != http.StatusOK || w.Body.String() != string(data) || w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("registered image %q failed: status %d", name, w.Code)
		}
	}
	if err := os.WriteFile(filepath.Join(artDir, "unlisted.png"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"unlisted.png", "../unlisted.png", "..", ""} {
		if w := serve(name); w.Code != http.StatusNotFound {
			t.Errorf("unregistered path %q returned %d", name, w.Code)
		}
	}
}
