package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFallbackGatewayGenerate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		request  Request
		wantText string
		wantPart string
	}{
		{
			name: "quest text interpolates variables",
			request: Request{
				Kind:      KindQuestText,
				Template:  "quest",
				Variables: map[string]string{"giver_name": "Mira", "target": "Old Mill"},
			},
			wantPart: "Mira needs your help. Travel to Old Mill",
		},
		{
			name: "dialogue defaults missing npc name",
			request: Request{
				Kind:     KindNPCDialogue,
				Template: "dialogue",
			},
			wantPart: "Someone looks at you with interest.",
		},
		{
			name: "unknown kind falls back to ellipsis",
			request: Request{
				Kind:     Kind("Unknown"),
				Template: "unknown",
			},
			wantText: "...",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			resp, err := NewFallbackGateway().Generate(context.Background(), tt.request)
			if err != nil {
				t.Fatalf("Generate() error = %v", err)
			}

			if !resp.UsedFallback {
				t.Fatal("UsedFallback = false, want true")
			}
			if resp.Provider != "fallback" {
				t.Fatalf("Provider = %q, want %q", resp.Provider, "fallback")
			}

			if tt.wantText != "" && resp.Text != tt.wantText {
				t.Fatalf("Text = %q, want %q", resp.Text, tt.wantText)
			}
			if tt.wantPart != "" && !strings.Contains(resp.Text, tt.wantPart) {
				t.Fatalf("Text = %q, want substring %q", resp.Text, tt.wantPart)
			}
		})
	}
}

func TestOllamaGatewayGenerate(t *testing.T) {
	t.Parallel()

	t.Run("returns ollama response", func(t *testing.T) {
		t.Parallel()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/generate" {
				t.Fatalf("path = %q, want %q", r.URL.Path, "/api/generate")
			}

			var req ollamaRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode request: %v", err)
			}
			if req.Model != "gemma3" {
				t.Fatalf("model = %q, want %q", req.Model, "gemma3")
			}
			if !strings.Contains(req.Prompt, "npc_name: Cora") {
				t.Fatalf("prompt = %q, want npc_name interpolation", req.Prompt)
			}

			if err := json.NewEncoder(w).Encode(ollamaResponse{Response: "Generated text"}); err != nil {
				t.Fatalf("encode response: %v", err)
			}
		}))
		t.Cleanup(server.Close)

		gateway := NewOllamaGateway(server.URL, "gemma3")
		resp, err := gateway.Generate(context.Background(), Request{
			Kind:      KindNPCDialogue,
			Template:  "Speak plainly.",
			Variables: map[string]string{"npc_name": "Cora"},
		})
		if err != nil {
			t.Fatalf("Generate() error = %v", err)
		}

		if resp.Text != "Generated text" {
			t.Fatalf("Text = %q, want %q", resp.Text, "Generated text")
		}
		if resp.UsedFallback {
			t.Fatal("UsedFallback = true, want false")
		}
		if resp.Provider != "ollama-gemma3" {
			t.Fatalf("Provider = %q, want %q", resp.Provider, "ollama-gemma3")
		}
	})

	t.Run("falls back when ollama returns an error", func(t *testing.T) {
		t.Parallel()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "boom", http.StatusBadGateway)
		}))
		t.Cleanup(server.Close)

		gateway := NewOllamaGateway(server.URL, "gemma3")
		resp, err := gateway.Generate(context.Background(), Request{
			Kind:      KindMonsterFlavor,
			Template:  "Describe the monster.",
			Variables: map[string]string{"monster_name": "Bog Rat"},
		})
		if err != nil {
			t.Fatalf("Generate() error = %v", err)
		}

		if !resp.UsedFallback {
			t.Fatal("UsedFallback = false, want true")
		}
		if resp.Provider != "fallback" {
			t.Fatalf("Provider = %q, want %q", resp.Provider, "fallback")
		}
		if !strings.Contains(resp.Text, "Bog Rat blocks your path!") {
			t.Fatalf("Text = %q, want fallback monster text", resp.Text)
		}
	})
}

func TestBuildPrompt(t *testing.T) {
	t.Parallel()

	prompt := buildPrompt(Request{
		Template:  "Base prompt",
		Variables: map[string]string{"npc_name": "Mira", "location": "Depot"},
	})

	if !strings.HasPrefix(prompt, "Base prompt") {
		t.Fatalf("prompt = %q, want base template prefix", prompt)
	}
	if !strings.Contains(prompt, "npc_name: Mira") {
		t.Fatalf("prompt = %q, want npc_name interpolation", prompt)
	}
	if !strings.Contains(prompt, "location: Depot") {
		t.Fatalf("prompt = %q, want location interpolation", prompt)
	}
}
