package llm

import (
	"context"
	"fmt"
)

// FallbackGateway returns template-filled strings. The game must work with this alone.
type FallbackGateway struct{}

func NewFallbackGateway() *FallbackGateway {
	return &FallbackGateway{}
}

func (f *FallbackGateway) Generate(_ context.Context, req Request) (Response, error) {
	text := fillTemplate(req)
	return Response{
		Text:         text,
		UsedFallback: true,
		Provider:     "fallback",
		LatencyMs:    0,
	}, nil
}

func fillTemplate(req Request) string {
	switch req.Kind {
	case KindQuestText:
		npc := req.Variables["giver_name"]
		target := req.Variables["target"]
		if npc == "" {
			npc = "A stranger"
		}
		if target == "" {
			target = "a distant place"
		}
		return fmt.Sprintf("%s needs your help. Travel to %s and complete the task.", npc, target)
	case KindNPCDialogue:
		npc := req.Variables["npc_name"]
		if npc == "" {
			npc = "Someone"
		}
		return fmt.Sprintf("%s looks at you with interest. \"What brings you here, traveler?\"", npc)
	case KindMonsterFlavor:
		monster := req.Variables["monster_name"]
		if monster == "" {
			monster = "A creature"
		}
		return fmt.Sprintf("%s blocks your path!", monster)
	default:
		return "..."
	}
}
