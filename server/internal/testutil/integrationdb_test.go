//go:build integration

package testutil

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMigrationFilesResolveFromModule(t *testing.T) {
	paths := migrationFiles(t)
	if len(paths) == 0 {
		t.Fatal("no migration SQL files")
	}
	for _, path := range paths {
		if !filepath.IsAbs(path) {
			t.Fatalf("migration path is not absolute: %s", path)
		}
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			t.Fatalf("migration is not a readable file: %s: %v", path, err)
		}
	}
}
