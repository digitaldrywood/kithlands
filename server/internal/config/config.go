package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
	OllamaURL   string
	SharedDir   string
}

func Load() Config {
	return Config{
		Port:        envOr("PORT", "8080"),
		DatabaseURL: envOr("DATABASE_URL", "postgres://kithlands:kithlands@localhost:5432/kithlands?sslmode=disable"),
		OllamaURL:   envOr("OLLAMA_URL", "http://localhost:11434"),
		SharedDir:   envOr("SHARED_DIR", "../shared"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
