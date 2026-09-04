package main

import (
	"github.com/digitaldrywood/kithlands/api"
)

// Strategy is a pluggable bot policy for headless playthroughs. Each strategy
// is stateless across runs — any per-run memory must be held on the caller.
type Strategy interface {
	Name() string
	ChooseWorldAction(gs *api.GameState) api.GameActionRequest
	ChooseCombatActions(gs *api.GameState) []api.MemberActionReq
	OnPromotion(gs *api.GameState) bool
}

// AllStrategies returns every registered strategy in stable order. Used by
// main.go to fan out runs and by tests to assert common behavior.
func AllStrategies() []Strategy {
	return []Strategy{
		&AggressiveStrategy{},
		&CautiousStrategy{},
		&HealerHeavyStrategy{},
	}
}

// StrategyByName looks up a strategy by its Name(). Returns nil if unknown.
func StrategyByName(name string) Strategy {
	for _, s := range AllStrategies() {
		if s.Name() == name {
			return s
		}
	}
	return nil
}

// --- shared helpers ---

func firstLivingEnemyID(gs *api.GameState) int {
	for _, e := range gs.Enemies {
		if e.HP > 0 {
			return e.ID
		}
	}
	return 0
}

func mostDamagedAllySlot(gs *api.GameState) int {
	worst := -1
	worstHP := 1 << 30
	for i, p := range gs.Party {
		if p.HP <= 0 || p.HP >= p.MaxHP {
			continue
		}
		if p.HP < worstHP {
			worstHP = p.HP
			worst = i
		}
	}
	return worst
}

func woundedAllyCount(gs *api.GameState, thresholdFrac float64) int {
	n := 0
	for _, p := range gs.Party {
		if p.HP <= 0 || p.MaxHP == 0 {
			continue
		}
		if float64(p.HP)/float64(p.MaxHP) < thresholdFrac {
			n++
		}
	}
	return n
}

func affordableSpell(gs *api.GameState, slot int, effect, target string) *api.SpellState {
	if slot < 0 || slot >= len(gs.Party) {
		return nil
	}
	p := gs.Party[slot]
	var best *api.SpellState
	for i := range p.Spells {
		sp := &p.Spells[i]
		if !sp.Castable {
			continue
		}
		if sp.Effect != effect {
			continue
		}
		if target != "" && sp.Target != target {
			continue
		}
		if p.MP < sp.MPCost {
			continue
		}
		if best == nil || sp.MPCost > best.MPCost {
			// Prefer the most expensive affordable spell (proxy for most powerful).
			best = sp
		}
	}
	return best
}

func nextQuestNodeID(gs *api.GameState) string {
	if gs.CurrentQ < 0 || gs.CurrentQ >= len(gs.Quests) {
		return ""
	}
	return gs.Quests[gs.CurrentQ].TargetNodeID
}

// defaultWorldAction is shared by all three strategies: if the game is in
// "quest_complete" phase, issue "advance" to transition back to world; in
// "world", advance to the current quest's target node. This is the simplest
// path that produces forward progress across all strategies.
func defaultWorldAction(gs *api.GameState) api.GameActionRequest {
	if gs.Phase == "quest_complete" {
		return api.GameActionRequest{Type: "advance"}
	}
	if gs.Phase == "world" {
		if action, ok := objectiveWorldAction(gs); ok {
			return action
		}
		return api.GameActionRequest{Type: "quest_advance", NodeID: nextQuestNodeID(gs)}
	}
	return api.GameActionRequest{}
}

// --- Aggressive ---

type AggressiveStrategy struct{}

func (*AggressiveStrategy) Name() string { return "aggressive" }

func (*AggressiveStrategy) ChooseWorldAction(gs *api.GameState) api.GameActionRequest {
	return defaultWorldAction(gs)
}

func (*AggressiveStrategy) ChooseCombatActions(gs *api.GameState) []api.MemberActionReq {
	target := firstLivingEnemyID(gs)
	var out []api.MemberActionReq
	for i, p := range gs.Party {
		if p.HP <= 0 {
			continue
		}
		// Cast the most expensive affordable damage spell if any; otherwise attack.
		if sp := affordableSpell(gs, i, "damage", ""); sp != nil {
			out = append(out, api.MemberActionReq{
				Slot:     i,
				Type:     "spell",
				SpellID:  sp.ID,
				TargetID: target,
			})
			continue
		}
		out = append(out, api.MemberActionReq{
			Slot:     i,
			Type:     "attack",
			TargetID: target,
		})
	}
	return out
}

func (*AggressiveStrategy) OnPromotion(_ *api.GameState) bool { return true }

// --- Cautious ---

type CautiousStrategy struct{}

func (*CautiousStrategy) Name() string { return "cautious" }

func (*CautiousStrategy) ChooseWorldAction(gs *api.GameState) api.GameActionRequest {
	return defaultWorldAction(gs)
}

func (*CautiousStrategy) ChooseCombatActions(gs *api.GameState) []api.MemberActionReq {
	target := firstLivingEnemyID(gs)
	var out []api.MemberActionReq
	for i, p := range gs.Party {
		if p.HP <= 0 {
			continue
		}
		// If any ally is below 60%, casters heal the most-damaged ally.
		if wounded := mostDamagedAllySlot(gs); wounded >= 0 {
			injured := gs.Party[wounded]
			if float64(injured.HP)/float64(injured.MaxHP) < 0.60 {
				if sp := affordableSpell(gs, i, "heal", "single_ally"); sp != nil {
					out = append(out, api.MemberActionReq{
						Slot:     i,
						Type:     "spell",
						SpellID:  sp.ID,
						TargetID: wounded,
					})
					continue
				}
			}
		}
		// Otherwise attack.
		out = append(out, api.MemberActionReq{
			Slot:     i,
			Type:     "attack",
			TargetID: target,
		})
	}
	return out
}

func (*CautiousStrategy) OnPromotion(_ *api.GameState) bool { return true }

// --- HealerHeavy ---

type HealerHeavyStrategy struct{}

func (*HealerHeavyStrategy) Name() string { return "healer_heavy" }

func (*HealerHeavyStrategy) ChooseWorldAction(gs *api.GameState) api.GameActionRequest {
	return defaultWorldAction(gs)
}

func (*HealerHeavyStrategy) ChooseCombatActions(gs *api.GameState) []api.MemberActionReq {
	target := firstLivingEnemyID(gs)
	groupHeal := woundedAllyCount(gs, 0.80) >= 2

	var out []api.MemberActionReq
	for i, p := range gs.Party {
		if p.HP <= 0 {
			continue
		}
		// Menders prioritize group heal when multiple allies wounded,
		// otherwise single-target heal on the worst.
		if p.ClassID == "mender" {
			if groupHeal {
				if sp := affordableSpell(gs, i, "heal", "all_allies"); sp != nil {
					out = append(out, api.MemberActionReq{
						Slot:    i,
						Type:    "spell",
						SpellID: sp.ID,
					})
					continue
				}
			}
			if wounded := mostDamagedAllySlot(gs); wounded >= 0 {
				if sp := affordableSpell(gs, i, "heal", "single_ally"); sp != nil {
					out = append(out, api.MemberActionReq{
						Slot:     i,
						Type:     "spell",
						SpellID:  sp.ID,
						TargetID: wounded,
					})
					continue
				}
			}
		}
		// Cinders nuke.
		if p.ClassID == "cinder" {
			if sp := affordableSpell(gs, i, "damage", ""); sp != nil {
				out = append(out, api.MemberActionReq{
					Slot:     i,
					Type:     "spell",
					SpellID:  sp.ID,
					TargetID: target,
				})
				continue
			}
		}
		out = append(out, api.MemberActionReq{
			Slot:     i,
			Type:     "attack",
			TargetID: target,
		})
	}
	return out
}

func (*HealerHeavyStrategy) OnPromotion(_ *api.GameState) bool { return true }
