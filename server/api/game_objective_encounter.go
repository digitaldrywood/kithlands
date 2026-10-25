package api

import (
	"fmt"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/generator"
)

func (g *Game) activeObjectiveQuest() *generator.Quest {
	if g.currentQ < 0 || g.currentQ >= len(g.quests) {
		return nil
	}
	q := &g.quests[g.currentQ]
	if !generator.UsesObjectives(q) || q.Completed || q.Objectives == nil {
		return nil
	}
	return q
}

func (g *Game) objectiveEncounterActive() bool {
	q := g.activeObjectiveQuest()
	return q != nil && q.Objectives.EncounterActive
}

// Only the validated arrival path can start the authored objective encounter.
// Random encounters never receive this identity and cannot clear the objective.
func (g *Game) startObjectiveEncounter(q *generator.Quest) error {
	p := q.Objectives
	if p == nil || p.Step < 0 || p.Step >= len(q.Actions) || q.Actions[p.Step].Type != generator.ActionKill {
		return nil
	}
	step := q.Actions[p.Step]
	if step.Location != g.questVisitNodeID || !g.validQuestVisit(step.Location) {
		// Visiting another building while preparing a retry remains ordinary travel.
		return nil
	}
	d := g.gd.QuestObjectives[q.TemplateID].Encounter
	if d == nil {
		return fmt.Errorf("the quest encounter is unavailable; your progress is safe")
	}
	ids := d.Monsters
	if len(g.party) >= 4 {
		ids = d.FullPartyMonsters
	}
	enemies := make([]*combat.Combatant, 0, len(ids))
	for i, id := range ids {
		m := g.gd.MonsterByID(id)
		if m == nil {
			return fmt.Errorf("the quest encounter is unavailable; your progress is safe")
		}
		c := balance.ScaleMonster(m, 100+i, d.Level, g.diff)
		c.MonsterID, c.Size = m.ID, m.Size
		enemies = append(enemies, c)
	}
	if len(enemies) == 0 {
		return fmt.Errorf("the quest encounter is unavailable; your progress is safe")
	}
	p.EncounterActive, p.Recovery = true, ""
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
	g.message = d.Arrival
	g.logCombat(g.message, CombatActionEntry{Kind: "info"})
	return nil
}

// Called only by the victory resolver. Combat rewards remain ordinary combat
// rewards; the quest payout requires a separate return and report interaction.
func (g *Game) completeObjectiveEncounter() {
	if !g.objectiveEncounterActive() {
		return
	}
	q := g.activeObjectiveQuest()
	p := q.Objectives
	p.EncounterActive = false
	if p.Step < 0 || p.Step >= len(q.Actions) || q.Actions[p.Step].Type != generator.ActionKill {
		return
	}
	p.Clue = q.Actions[p.Step].Result
	p.Step++
	g.logCombat(p.Clue, CombatActionEntry{Kind: "info"})
}

func (g *Game) leaveObjectiveEncounter(defeat bool) {
	if !g.objectiveEncounterActive() {
		return
	}
	q := g.activeObjectiveQuest()
	q.Objectives.EncounterActive = false
	q.Objectives.Recovery = "fled"
	d := g.gd.QuestObjectives[q.TemplateID].Encounter
	g.message = d.Flee
	if defeat {
		q.Objectives.Recovery = "defeat"
		for _, c := range g.party {
			c.CurrentHP, c.CurrentMP, c.Status = c.MaxHP, c.MaxMP, character.StatusNone
		}
		g.message = d.Defeat
	}
	g.phase, g.enemies, g.formation = "world", nil, ""
}

// Ordinary world travel protects a following civilian through the party. Flee
// keeps the escort; defeat sends them back to the search site without a payout.
// Dungeon/finale recovery owns those locations and does not reset the escort.
func (g *Game) recoverEscortDefeat() {
	q := g.activeObjectiveQuest()
	if g.phase != "defeat" || g.location.Kind != LocationWorld || q == nil || q.TemplateID != "Q05" || q.Objectives.Companion == "" {
		return
	}
	d := g.gd.QuestObjectives[q.TemplateID].Companion
	if d == nil {
		return
	}
	p := q.Objectives
	p.Companion, p.CompanionSprite, p.Recovery = "", "", "defeat"
	p.Step = 2 // Return to the authored search location; the learned clue persists.
	for _, c := range g.party {
		c.CurrentHP, c.CurrentMP, c.Status = c.MaxHP, c.MaxMP, character.StatusNone
	}
	g.message = strings.NewReplacer("{target}", q.TargetName, "{giver}", q.GiverName).Replace(d.Defeat)
	g.phase, g.enemies, g.formation = "world", nil, ""
}
