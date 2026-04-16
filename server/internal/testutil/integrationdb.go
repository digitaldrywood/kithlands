//go:build integration

package testutil

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NewIntegrationDatabaseURL provisions a fresh schema for one integration test
// and returns a DATABASE_URL pointing at it via search_path.
func NewIntegrationDatabaseURL(t *testing.T) string {
	t.Helper()

	baseURL := os.Getenv("DATABASE_URL")
	if baseURL == "" {
		t.Skip("DATABASE_URL is required for integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)

	adminPool, err := pgxpool.New(ctx, baseURL)
	if err != nil {
		t.Fatalf("connect admin pool: %v", err)
	}

	schema := "itest_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := adminPool.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		adminPool.Close()
		t.Fatalf("create schema %q: %v", schema, err)
	}

	testURL := databaseURLWithSearchPath(t, baseURL, schema)
	migrationPool, err := pgxpool.New(ctx, testURL)
	if err != nil {
		adminPool.Close()
		t.Fatalf("connect migration pool: %v", err)
	}

	for _, path := range migrationFiles(t) {
		contents, err := os.ReadFile(path)
		if err != nil {
			migrationPool.Close()
			adminPool.Close()
			t.Fatalf("read migration %s: %v", path, err)
		}
		if _, err := migrationPool.Exec(ctx, string(contents)); err != nil {
			migrationPool.Close()
			adminPool.Close()
			t.Fatalf("apply migration %s: %v", filepath.Base(path), err)
		}
	}

	migrationPool.Close()

	t.Cleanup(func() {
		dropCtx, dropCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer dropCancel()

		if _, err := adminPool.Exec(dropCtx, "DROP SCHEMA IF EXISTS "+schema+" CASCADE"); err != nil {
			t.Fatalf("drop schema %q: %v", schema, err)
		}
		adminPool.Close()
	})

	return testURL
}

// NewIntegrationPool returns a pool connected to a test-specific schema.
func NewIntegrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)

	pool, err := pgxpool.New(ctx, NewIntegrationDatabaseURL(t))
	if err != nil {
		t.Fatalf("connect test pool: %v", err)
	}

	t.Cleanup(pool.Close)
	return pool
}

func databaseURLWithSearchPath(t *testing.T, baseURL, schema string) string {
	t.Helper()

	parsed, err := url.Parse(baseURL)
	if err != nil {
		t.Fatalf("parse DATABASE_URL: %v", err)
	}

	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func migrationFiles(t *testing.T) []string {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve integration helper path")
	}

	paths, err := filepath.Glob(filepath.Join(filepath.Dir(filename), "..", "db", "migrations", "*.sql"))
	if err != nil {
		t.Fatalf("list migrations: %v", err)
	}
	if len(paths) == 0 {
		t.Fatal("no migration files found")
	}

	sort.Strings(paths)
	return paths
}
