package api

import (
	"fmt"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/generator"
)

// FinalEncounterProgress is additive save state. Active combat is deliberately
// transient: save the approach or result, never a half-serialized battle.
type FinalEncounterProgress struct {
	QuestID  string `json:"quest_id"`
	Defeated bool   `json:"defeated"`
	Recovery string `json:"recovery,omitempty"`
	Active   bool   `json:"-"`
}

type FinalEncounterState struct {
	Active           bool   `json:"active"`
	Defeated         bool   `json:"defeated"`
	Recovery         string `json:"recovery,omitempty"`
	Title            string `json:"title"`
	Objective        string `json:"objective"`
	Conclusion       string `json:"conclusion,omitempty"`
	EndingTitle      string `json:"ending_title"`
	BattleBackground string `json:"battle_background"`
}

func (g *Game) finalQuest() *generator.Quest {
	for i := range g.quests {
		q := &g.quests[i]
		if q.TemplateID == g.gd.FinalEncounter.QuestTemplateID && !q.IsPromotion {
			return q
		}
	}
	return nil
}

func (g *Game) finalText(text string) string {
	destination := g.loc.Name
	if q := g.finalQuest(); q != nil && q.TargetName != "" {
		destination = q.TargetName
	}
	return strings.NewReplacer("{locality}", g.loc.Name, "{destination}", destination).Replace(text)
}

// Apply the current authored identity to active legacy Q12 saves too. Completed
// saves retain their recorded reward, and never receive an extra boss payout.
func (g *Game) prepareFinalQuest() {
	q := g.finalQuest()
	if q == nil || q.Completed {
		return
	}
	d := g.gd.FinalEncounter
	q.Name = d.QuestName
	q.Description = g.finalText(d.Description) + "\n" + d.Objective
	q.Completion = g.finalText(d.Conclusion)
	q.Reward = generator.QuestReward{XP: d.Reward.XP, Gold: d.Reward.Gold}
	// A locality without a distant landmark still has a reachable final gate.
	if q.TargetNodeID == "" && g.walk != nil && g.walk.Spawn != nil {
		q.TargetNodeID, q.TargetName = g.walk.Spawn.ID, g.walk.Spawn.Name
	}
}

func (g *Game) finalEncounterActive() bool {
	return g.finalEncounter != nil && g.finalEncounter.Active
}

func (g *Game) fillFinalEncounterState(s *GameState) {
	q := g.finalQuest()
	if q == nil || (g.finalEncounter == nil && (g.currentQ >= len(g.quests) || g.quests[g.currentQ].ID != q.ID) && !q.Completed) {
		return
	}
	d := g.gd.FinalEncounter
	s.FinalEncounter = &FinalEncounterState{Title: d.Title, Objective: d.Objective, EndingTitle: d.EndingTitle, BattleBackground: d.BattleBackground}
	if p := g.finalEncounter; p != nil {
		s.FinalEncounter.Active, s.FinalEncounter.Defeated, s.FinalEncounter.Recovery = p.Active, p.Defeated, p.Recovery
	}
	if q.Completed {
		s.FinalEncounter.Conclusion = g.finalText(d.Conclusion)
	}
}

func (g *Game) advanceFinalEncounter(q *generator.Quest, nodeID string) (*GameState, error) {
	g.prepareFinalQuest()
	if q.Completed || nodeID == "" || nodeID != q.TargetNodeID {
		s := g.stateUnlocked()
		return &s, nil
	}
	// Validate all content before changing progress or combat state.
	d := g.gd.FinalEncounter
	ids := d.Monsters
	if len(g.party) >= 4 {
		ids = d.FullPartyMonsters
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("the final encounter is unavailable; your progress is safe")
	}
	enemies := make([]*combat.Combatant, 0, len(ids))
	for i, id := range ids {
		m := g.gd.MonsterByID(id)
		if m == nil {
			return nil, fmt.Errorf("the final encounter is unavailable; your progress is safe")
		}
		level := d.Level
		if m.ID != d.ID {
			level = d.GuardLevel
		}
		c := balance.ScaleMonster(m, 100+i, level, g.diff)
		c.MonsterID, c.Size = m.ID, m.Size
		enemies = append(enemies, c)
	}
	if g.finalEncounter == nil || g.finalEncounter.QuestID != q.ID {
		g.finalEncounter = &FinalEncounterProgress{QuestID: q.ID}
	}
	g.finalEncounter.Active, g.finalEncounter.Recovery = true, ""
	g.snapshotVictoryXPProgress()
	g.enemies, g.formation, g.phase = enemies, d.Formation, "combat"
	g.spellBuffs = nil
	g.resetEncounterStartState()
	if g.discovered == nil {
		g.discovered = map[string]bool{}
	}
	for _, id := range ids {
		g.discovered[id] = true
	}
	g.message = g.finalText(d.Arrival)
	g.logCombat(g.message, CombatActionEntry{Kind: "info"})
	s := g.stateUnlocked()
	return &s, nil
}

// Called only from the ordinary combat victory resolver. Quest completion is
// the durable once-only reward guard; an arrival can never invoke this path.
func (g *Game) completeFinalEncounter() bool {
	if !g.finalEncounterActive() {
		return false
	}
	p := g.finalEncounter
	p.Active = false
	if g.currentQ >= len(g.quests) {
		return false
	}
	q := &g.quests[g.currentQ]
	if q.ID != p.QuestID || q.TemplateID != g.gd.FinalEncounter.QuestTemplateID || q.Completed {
		return false
	}
	q.Completed, p.Defeated = true, true
	p.Recovery = ""
	g.inv.Gold += q.Reward.Gold
	for _, c := range g.party {
		if c.IsAlive() {
			c.XP += q.Reward.XP
		}
	}
	g.logCombat(fmt.Sprintf("Quest complete: %s", q.Name), CombatActionEntry{Kind: "info"})
	g.logCombat(fmt.Sprintf("Quest reward: +%d XP, +%d gold", q.Reward.XP, q.Reward.Gold), CombatActionEntry{Kind: "info"})
	g.checkLevelUps()
	g.restParty()
	g.currentQ++
	g.checkTransportUnlocks()
	g.phase = "victory"
	g.message = g.finalText(g.gd.FinalEncounter.Conclusion)
	return true
}

func (g *Game) leaveFinalEncounter(defeat bool) {
	if !g.finalEncounterActive() {
		return
	}
	p := g.finalEncounter
	p.Active = false
	p.Recovery = "fled"
	g.message = g.finalText(g.gd.FinalEncounter.Flee)
	if defeat {
		p.Recovery = "defeat"
		for _, c := range g.party {
			c.CurrentHP, c.CurrentMP, c.Status = c.MaxHP, c.MaxMP, character.StatusNone
		}
		g.message = g.finalText(g.gd.FinalEncounter.Defeat)
	}
	g.phase, g.enemies, g.formation = "world", nil, ""
}

func (g *Game) restoreFinalEncounter() {
	g.prepareFinalQuest()
	q := g.finalQuest()
	if q == nil {
		g.finalEncounter = nil
		return
	}
	if q.Completed && g.currentQ >= len(g.quests) {
		g.phase = "victory"
		g.message = g.finalText(g.gd.FinalEncounter.Conclusion)
		return
	}
	if g.finalEncounter != nil {
		g.finalEncounter.Active = false
	}
}
