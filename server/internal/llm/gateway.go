package llm

import "context"

// Gateway interface per Section 2.3 (verbatim from GDD).
type Request struct {
	Kind        Kind              `json:"kind"`
	Template    string            `json:"template"`
	Variables   map[string]string `json:"variables"`
	MaxTokens   int               `json:"max_tokens"`
	Temperature float32           `json:"temperature"`
	Flavor      string            `json:"flavor"`
}

type Kind string

const (
	KindQuestText    Kind = "QuestText"
	KindNPCDialogue  Kind = "NPCDialogue"
	KindMonsterFlavor Kind = "MonsterFlavor"
)

type Response struct {
	Text         string `json:"text"`
	UsedFallback bool   `json:"used_fallback"`
	Provider     string `json:"provider"`
	LatencyMs    int    `json:"latency_ms"`
}

type Gateway interface {
	Generate(ctx context.Context, req Request) (Response, error)
}
