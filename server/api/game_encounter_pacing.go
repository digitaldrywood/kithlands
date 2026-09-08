package api

import (
	"fmt"
	"math"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

// EncounterTravelState is saved with the campaign, not reset by opening menus,
// crossing scenes, or loading a save. Zero values migrate old saves safely.
type EncounterTravelState struct {
	Initialized bool    `json:"initialized"`
	Remaining   float64 `json:"remaining"`
	Steps       int     `json:"steps"`
}

func (g *Game) processWorldStepLocked(req LocationTransitionRequest) error {
	if req.WorldPosition == nil || g.worldCheckpoint == nil {
		return fmt.Errorf("world step requires a checkpoint and destination")
	}
	position := *req.WorldPosition
	nodeID := req.WorldNodeID
	if nodeID == "" {
		nodeID = g.location.WorldNodeID
	}
	// Visual audit tools may reposition the renderer between samples. This
	// exemption is available only on explicitly enabled development servers.
	if req.DebugNoEncounters && DebugEnabled() {
		return g.recordWorldArrivalLocked(nodeID, &position, true)
	}
	dx := checkpointAbs(position.X - g.worldCheckpoint.X)
	dy := checkpointAbs(position.Y - g.worldCheckpoint.Y)
	if dx == 0 && dy == 0 {
		return nil
	} // duplicate request/retry
	if dx > 1 || dy > 1 {
		return fmt.Errorf("world step must move to an adjacent tile")
	}
	if err := g.recordWorldArrivalLocked(nodeID, &position, true); err != nil {
		return err
	}
	tile := locality.TileType(g.tileMap.Tiles[position.Y][position.X])
	weight := g.gd.EncounterPacing.TerrainWeights[int(tile)]
	mult := g.diff.EncounterRateMult * g.trans.EncounterRate(g.gd.Transport.Tiers)
	if weight <= 0 || mult <= 0 {
		return nil
	}
	cfg := g.gd.EncounterPacing
	if !g.encounterTravel.Initialized {
		g.encounterTravel = EncounterTravelState{Initialized: true, Remaining: float64(cfg.MinimumGrassSteps + g.rng.IntN(cfg.MaximumGrassSteps-cfg.MinimumGrassSteps+1))}
	}
	// Each accepted tile counts once, independent of animation speed or FPS.
	g.encounterTravel.Steps++
	g.encounterTravel.Remaining -= weight * mult
	if g.encounterTravel.Steps <= cfg.SafeSteps || g.encounterTravel.Remaining > 1e-9 {
		return nil
	}
	tag, ok := locality.EncounterTerrainTag(tile)
	if !ok {
		return nil
	}
	if g.tickOverworldPoisonAndCheckDefeat() {
		return nil
	}
	g.snapshotVictoryXPProgress()
	_, err := g.startRandomEncounter(tag)
	return err
}

// validEncounterTravel rejects corrupt save data rather than preserving an
// impossible interval. Ordinary negative remainder is allowed during grace.
func validEncounterTravel(s EncounterTravelState) EncounterTravelState {
	if math.IsNaN(s.Remaining) || math.IsInf(s.Remaining, 0) || s.Steps < 0 {
		return EncounterTravelState{}
	}
	return s
}

// Pending required quests in older saves receive the current XP floor. Never
// re-award completed quests or replace optional rewards, gold, or items.
func refreshPendingCampaignXP(quests []generator.Quest, current int, gd *gamedata.GameData) {
	for i := range quests {
		q := &quests[i]
		if i < current || q.Completed || q.IsSideQuest || q.TemplateID == gd.FinalEncounter.QuestTemplateID {
			continue
		}
		xp := gd.Campaign.Act(q.Act).Reward.XP
		if q.IsPromotion {
			xp = gd.Campaign.PromotionReward.XP
		}
		q.Reward.XP = max(q.Reward.XP, xp)
	}
}
