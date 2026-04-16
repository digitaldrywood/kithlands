package config

import "testing"

func TestEnvOr(t *testing.T) {
	t.Run("returns fallback when unset", func(t *testing.T) {
		t.Setenv("KITHLANDS_TEST_ENV_OR", "")
		if got := envOr("KITHLANDS_TEST_ENV_OR", "fallback"); got != "fallback" {
			t.Fatalf("envOr() = %q, want %q", got, "fallback")
		}
	})

	t.Run("returns environment value", func(t *testing.T) {
		t.Setenv("KITHLANDS_TEST_ENV_OR", "value")
		if got := envOr("KITHLANDS_TEST_ENV_OR", "fallback"); got != "value" {
			t.Fatalf("envOr() = %q, want %q", got, "value")
		}
	})
}

func TestLoad(t *testing.T) {
	t.Run("uses defaults", func(t *testing.T) {
		t.Setenv("PORT", "")
		t.Setenv("DATABASE_URL", "")
		t.Setenv("OLLAMA_URL", "")
		t.Setenv("SHARED_DIR", "")
		t.Setenv("TAILSCALE_HOSTNAME", "")

		cfg := Load()
		if cfg.Port != "8080" {
			t.Fatalf("Port = %q, want %q", cfg.Port, "8080")
		}
		if cfg.DatabaseURL != "postgres://kithlands:kithlands@localhost:5432/kithlands?sslmode=disable" {
			t.Fatalf("DatabaseURL = %q", cfg.DatabaseURL)
		}
		if cfg.OllamaURL != "http://localhost:11434" {
			t.Fatalf("OllamaURL = %q, want %q", cfg.OllamaURL, "http://localhost:11434")
		}
		if cfg.SharedDir != "../shared" {
			t.Fatalf("SharedDir = %q, want %q", cfg.SharedDir, "../shared")
		}
		if cfg.TailscaleHostname != "" {
			t.Fatalf("TailscaleHostname = %q, want empty string", cfg.TailscaleHostname)
		}
	})

	t.Run("uses environment overrides", func(t *testing.T) {
		t.Setenv("PORT", "9999")
		t.Setenv("DATABASE_URL", "postgres://example/test")
		t.Setenv("OLLAMA_URL", "http://ollama.internal")
		t.Setenv("SHARED_DIR", "/tmp/shared")
		t.Setenv("TAILSCALE_HOSTNAME", "kithlands-tailnet")

		cfg := Load()
		if cfg.Port != "9999" {
			t.Fatalf("Port = %q, want %q", cfg.Port, "9999")
		}
		if cfg.DatabaseURL != "postgres://example/test" {
			t.Fatalf("DatabaseURL = %q, want %q", cfg.DatabaseURL, "postgres://example/test")
		}
		if cfg.OllamaURL != "http://ollama.internal" {
			t.Fatalf("OllamaURL = %q, want %q", cfg.OllamaURL, "http://ollama.internal")
		}
		if cfg.SharedDir != "/tmp/shared" {
			t.Fatalf("SharedDir = %q, want %q", cfg.SharedDir, "/tmp/shared")
		}
		if cfg.TailscaleHostname != "kithlands-tailnet" {
			t.Fatalf("TailscaleHostname = %q, want %q", cfg.TailscaleHostname, "kithlands-tailnet")
		}
	})
}
