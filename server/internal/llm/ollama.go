package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// OllamaGateway talks to a local Ollama server.
type OllamaGateway struct {
	baseURL  string
	model    string
	client   *http.Client
	fallback *FallbackGateway
}

func NewOllamaGateway(baseURL, model string) *OllamaGateway {
	return &OllamaGateway{
		baseURL: baseURL,
		model:   model,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		fallback: NewFallbackGateway(),
	}
}

type ollamaRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

type ollamaResponse struct {
	Response string `json:"response"`
}

func (o *OllamaGateway) Generate(ctx context.Context, req Request) (Response, error) {
	prompt := buildPrompt(req)

	body, err := json.Marshal(ollamaRequest{
		Model:  o.model,
		Prompt: prompt,
		Stream: false,
	})
	if err != nil {
		return o.fallback.Generate(ctx, req)
	}

	start := time.Now()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return o.fallback.Generate(ctx, req)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	//nolint:gosec // Ollama baseURL is configured for the trusted local gateway.
	resp, err := o.client.Do(httpReq)
	if err != nil {
		return o.fallback.Generate(ctx, req)
	}
	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		return o.fallback.Generate(ctx, req)
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return o.fallback.Generate(ctx, req)
	}

	var ollamaResp ollamaResponse
	if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
		return o.fallback.Generate(ctx, req)
	}

	latency := int(time.Since(start).Milliseconds())

	if ollamaResp.Response == "" {
		return o.fallback.Generate(ctx, req)
	}

	return Response{
		Text:         ollamaResp.Response,
		UsedFallback: false,
		Provider:     fmt.Sprintf("ollama-%s", o.model),
		LatencyMs:    latency,
	}, nil
}

func buildPrompt(req Request) string {
	prompt := req.Template
	for k, v := range req.Variables {
		prompt += fmt.Sprintf("\n%s: %s", k, v)
	}
	return prompt
}
