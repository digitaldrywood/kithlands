//go:build integration

package db_test

import (
	"context"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/db"
	"github.com/digitaldrywood/kithlands/internal/testutil"
)

func TestConnect(t *testing.T) {
	t.Parallel()

	t.Run("connects and pings the database", func(t *testing.T) {
		t.Parallel()

		pool, err := db.Connect(context.Background(), testutil.NewIntegrationDatabaseURL(t))
		if err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		t.Cleanup(pool.Close)

		var schema string
		if err := pool.QueryRow(context.Background(), `SELECT current_schema()`).Scan(&schema); err != nil {
			t.Fatalf("current_schema(): %v", err)
		}
		if schema == "" {
			t.Fatal("current_schema() returned empty schema")
		}
	})

	t.Run("returns an error when the context is canceled", func(t *testing.T) {
		t.Parallel()

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		if _, err := db.Connect(ctx, testutil.NewIntegrationDatabaseURL(t)); err == nil {
			t.Fatal("Connect() error = nil, want error")
		}
	})
}
