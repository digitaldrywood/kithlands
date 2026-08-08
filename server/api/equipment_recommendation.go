package api

import (
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

// EquipmentRecommendationState is a non-mutating, authoritative preview of a
// whole-character loadout improvement. The server recomputes the same plan
// when the player applies it so stale client state cannot equip an invalid
// combination.
type EquipmentRecommendationState struct {
	PartySlot     int                             `json:"party_slot"`
	CharacterName string                          `json:"character_name"`
	Goal          string                          `json:"goal"`
	Changes       []EquipmentRecommendationChange `json:"changes"`
	Before        map[string]int                  `json:"before"`
	After         map[string]int                  `json:"after"`
	Deltas        map[string]int                  `json:"deltas"`
	ScoreBefore   int                             `json:"score_before"`
	ScoreAfter    int                             `json:"score_after"`
}

type EquipmentRecommendationChange struct {
	SlotID   string     `json:"slot_id"`
	SlotName string     `json:"slot_name"`
	From     *ItemState `json:"from,omitempty"`
	To       ItemState  `json:"to"`
}

type recommendationCandidate struct {
	key          string
	itemID       string
	instanceID   string
	kind         string
	category     string
	sourceSlot   string
	inventoryKey string
	state        ItemState
	score        int
}

type recommendationChangePlan struct {
	public    EquipmentRecommendationChange
	candidate recommendationCandidate
}

type equipmentRecommendationPlan struct {
	state   EquipmentRecommendationState
	changes []recommendationChangePlan
}

var equipmentRecommendationWeights = map[string]map[string]int{
	"balanced": {
		"power": 100, "absorb": 90, "str": 65, "agi": 55, "int": 55,
		"vit": 65, "lck": 35, "hit_pct": 25, "crit_pct": 35,
		"magic_defense": 55, "evade_penalty": -25,
	},
	"offense": {
		"power": 120, "str": 85, "agi": 55, "int": 70, "lck": 25,
		"hit_pct": 35, "crit_pct": 50, "absorb": 15,
		"magic_defense": 10, "evade_penalty": -10,
	},
	"defense": {
		"absorb": 120, "vit": 90, "agi": 25, "lck": 15, "power": 10,
		"magic_defense": 80, "evade_penalty": -45,
	},
	"magic": {
		"int": 120, "lck": 30, "magic_defense": 45, "power": 20,
		"absorb": 25, "vit": 20, "evade_penalty": -15,
	},
}

func normalizeRecommendationGoal(goal string) (string, error) {
	goal = strings.ToLower(strings.TrimSpace(goal))
	if goal == "" {
		goal = "balanced"
	}
	if equipmentRecommendationWeights[goal] == nil {
		return "", fmt.Errorf("unknown recommendation goal %q", goal)
	}
	return goal, nil
}

func (g *Game) RecommendEquipment(partySlot int, goal string) (EquipmentRecommendationState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	plan, err := g.recommendEquipmentLocked(partySlot, goal)
	if err != nil {
		return EquipmentRecommendationState{}, err
	}
	return plan.state, nil
}

func (g *Game) ApplyRecommendedEquipment(partySlot int, goal string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	plan, err := g.recommendEquipmentLocked(partySlot, goal)
	if err != nil {
		return err
	}
	working := g.inv.Clone()
	member := g.party[partySlot]
	for _, change := range plan.changes {
		candidate := change.candidate
		if candidate.instanceID != "" {
			previous := working.Equipment[partySlot].Equipped(change.public.SlotID)
			if _, err := working.EquipInstanceAt(
				partySlot,
				change.public.SlotID,
				candidate.instanceID,
				member.ClassID,
				member.Level,
				g.gd,
			); err != nil {
				return fmt.Errorf("applying recommendation for %s: %w", change.public.SlotName, err)
			}
			returnRecommendedStaticToInventory(working, previous, g.gd)
			continue
		}
		if err := equipRecommendedStatic(
			working,
			partySlot,
			change.public.SlotID,
			candidate,
			member.ClassID,
			g.gd,
		); err != nil {
			return fmt.Errorf("applying recommendation for %s: %w", change.public.SlotName, err)
		}
	}
	g.inv = working
	return nil
}

func returnRecommendedStaticToInventory(inv *inventory.Inventory, previous inventory.EquippedItemRef, gd *gamedata.GameData) {
	if previous.ItemID == "" || previous.InstanceID != "" {
		return
	}
	base := gd.EquipmentBaseByID(previous.ItemID)
	if base == nil {
		return
	}
	switch base.Category {
	case "weapon":
		inv.Consumables["wpn_"+base.ID]++
	case "armor":
		inv.Consumables["arm_"+base.ID]++
	}
}

func (g *Game) recommendEquipmentLocked(partySlot int, goal string) (equipmentRecommendationPlan, error) {
	goal, err := normalizeRecommendationGoal(goal)
	if err != nil {
		return equipmentRecommendationPlan{}, err
	}
	if partySlot < 0 || partySlot >= len(g.party) || g.party[partySlot] == nil {
		return equipmentRecommendationPlan{}, fmt.Errorf("invalid party slot")
	}

	member := g.party[partySlot]
	slotDefs := append([]gamedata.EquipmentSlotDefinition(nil), g.gd.Items.EquipmentSlots...)
	sort.SliceStable(slotDefs, func(i, j int) bool { return slotDefs[i].Order < slotDefs[j].Order })

	currentBySlot := make(map[string]*recommendationCandidate, len(slotDefs))
	candidates := make([]recommendationCandidate, 0, len(g.inv.Instances)+len(slotDefs))
	for _, slot := range slotDefs {
		ref := g.inv.Equipment[partySlot].Equipped(slot.ID)
		if ref.ItemID == "" {
			continue
		}
		candidate, candidateErr := g.recommendationCandidateForRef(ref, slot.ID, goal)
		if candidateErr != nil {
			return equipmentRecommendationPlan{}, candidateErr
		}
		currentBySlot[slot.ID] = &candidate
		candidates = append(candidates, candidate)
	}

	for id, instance := range g.inv.Instances {
		if instance == nil {
			continue
		}
		if equippedParty, _, equipped := g.inv.FindEquippedInstance(id); equipped {
			if equippedParty != partySlot {
				continue
			}
			// The selected character's equipped instances were added above.
			continue
		}
		candidate, candidateErr := g.recommendationCandidateForRef(
			inventory.EquippedItemRef{ItemID: instance.BaseID, InstanceID: id},
			"",
			goal,
		)
		if candidateErr != nil {
			return equipmentRecommendationPlan{}, candidateErr
		}
		candidates = append(candidates, candidate)
	}

	for key, count := range g.inv.Consumables {
		baseID, ok := staticEquipmentBaseID(key)
		if !ok || count <= 0 {
			continue
		}
		base := g.gd.EquipmentBaseByID(baseID)
		if base == nil {
			continue
		}
		for copyIndex := 0; copyIndex < count; copyIndex++ {
			state := baseItemState(base)
			state.Count = 1
			candidates = append(candidates, recommendationCandidate{
				key: fmt.Sprintf("static:%s:%d", key, copyIndex), itemID: base.ID,
				kind: base.Kind, category: base.Category, inventoryKey: key,
				state: state, score: equipmentScore(state.Stats, goal),
			})
		}
	}

	used := make(map[string]bool)
	assigned := make(map[string]*recommendationCandidate, len(slotDefs))
	for _, slot := range slotDefs {
		var best *recommendationCandidate
		if current := currentBySlot[slot.ID]; current != nil {
			copy := *current
			best = &copy
		}
		for i := range candidates {
			candidate := &candidates[i]
			if used[candidate.key] || !g.recommendationCandidateFits(*candidate, slot, member.ClassID, member.Level) {
				continue
			}
			// Recommendations do not reshuffle already-equipped positions merely
			// to order equivalent slots such as Ring I and Ring II.
			if candidate.sourceSlot != "" && candidate.sourceSlot != slot.ID {
				continue
			}
			if best == nil || candidate.score > best.score ||
				(candidate.score == best.score && candidate.sourceSlot == slot.ID && best.sourceSlot != slot.ID) {
				copy := *candidate
				best = &copy
			}
		}
		if best != nil {
			assigned[slot.ID] = best
			used[best.key] = true
		}
	}

	before := g.inv.LoadoutStats(partySlot, g.gd)
	after := make(map[string]int)
	plan := equipmentRecommendationPlan{state: EquipmentRecommendationState{
		PartySlot: partySlot, CharacterName: member.Name, Goal: goal,
		Before: cloneStats(before),
	}}
	for _, slot := range slotDefs {
		selected := assigned[slot.ID]
		if selected != nil {
			for stat, value := range selected.state.Stats {
				after[stat] += value
			}
		}
		current := currentBySlot[slot.ID]
		if selected == nil || (current != nil && current.key == selected.key) {
			continue
		}
		change := EquipmentRecommendationChange{SlotID: slot.ID, SlotName: slot.Name, To: selected.state}
		if current != nil {
			from := current.state
			change.From = &from
		}
		plan.state.Changes = append(plan.state.Changes, change)
		plan.changes = append(plan.changes, recommendationChangePlan{public: change, candidate: *selected})
	}
	plan.state.After = after
	plan.state.Deltas = statDeltas(before, after)
	plan.state.ScoreBefore = equipmentScore(before, goal)
	plan.state.ScoreAfter = equipmentScore(after, goal)
	return plan, nil
}

func (g *Game) recommendationCandidateForRef(ref inventory.EquippedItemRef, sourceSlot, goal string) (recommendationCandidate, error) {
	if ref.InstanceID != "" {
		item, err := g.rolledItemState(ref.InstanceID, g.inv.Instance(ref.InstanceID))
		if err != nil {
			return recommendationCandidate{}, err
		}
		return recommendationCandidate{
			key: "instance:" + ref.InstanceID, itemID: ref.ItemID, instanceID: ref.InstanceID,
			kind: item.Kind, category: item.Category, sourceSlot: sourceSlot,
			state: item, score: equipmentScore(item.Stats, goal),
		}, nil
	}
	base := g.gd.EquipmentBaseByID(ref.ItemID)
	if base == nil {
		return recommendationCandidate{}, fmt.Errorf("equipment base %q not found", ref.ItemID)
	}
	item := baseItemState(base)
	return recommendationCandidate{
		key: "equipped:" + sourceSlot, itemID: ref.ItemID, kind: base.Kind,
		category: base.Category, sourceSlot: sourceSlot, state: item,
		score: equipmentScore(item.Stats, goal),
	}, nil
}

func (g *Game) recommendationCandidateFits(candidate recommendationCandidate, slot gamedata.EquipmentSlotDefinition, classID string, level int) bool {
	if !slices.Contains(slot.Accepts, candidate.category) {
		return false
	}
	base := g.gd.EquipmentBaseByID(candidate.itemID)
	if base == nil || !slices.Contains(base.Classes, classID) {
		return false
	}
	requiredLevel := base.RequiredLevel
	if candidate.state.RequiredLevel > requiredLevel {
		requiredLevel = candidate.state.RequiredLevel
	}
	if level < requiredLevel {
		return false
	}
	if candidate.inventoryKey != "" {
		return (candidate.category == "weapon" && slot.ID == inventory.MainHandSlot) ||
			(candidate.category == "armor" && slot.ID == inventory.BodySlot)
	}
	return true
}

func equipmentScore(stats map[string]int, goal string) int {
	weights := equipmentRecommendationWeights[goal]
	total := 0
	for stat, value := range stats {
		total += value * weights[stat]
	}
	return total
}

func statDeltas(before, after map[string]int) map[string]int {
	keys := make(map[string]bool, len(before)+len(after))
	for key := range before {
		keys[key] = true
	}
	for key := range after {
		keys[key] = true
	}
	deltas := make(map[string]int, len(keys))
	for key := range keys {
		deltas[key] = after[key] - before[key]
	}
	return deltas
}

func staticEquipmentBaseID(key string) (string, bool) {
	switch {
	case strings.HasPrefix(key, "wpn_"):
		return strings.TrimPrefix(key, "wpn_"), true
	case strings.HasPrefix(key, "arm_"):
		return strings.TrimPrefix(key, "arm_"), true
	default:
		return "", false
	}
}

func equipRecommendedStatic(inv *inventory.Inventory, partySlot int, equipmentSlot string, candidate recommendationCandidate, classID string, gd *gamedata.GameData) error {
	if candidate.inventoryKey == "" || inv.Consumables[candidate.inventoryKey] <= 0 {
		return fmt.Errorf("equipment %q is not available", candidate.itemID)
	}
	previous := inv.Equipment[partySlot]
	var prior string
	var err error
	switch candidate.category {
	case "weapon":
		if equipmentSlot != inventory.MainHandSlot {
			return fmt.Errorf("static weapons can only be equipped in %s", inventory.MainHandSlot)
		}
		prior, err = inv.EquipWeapon(partySlot, candidate.itemID, classID, gd)
		if err == nil && prior != "" && previous.WeaponInstanceID == "" {
			inv.Consumables["wpn_"+prior]++
		}
	case "armor":
		if equipmentSlot != inventory.BodySlot {
			return fmt.Errorf("static armor can only be equipped in %s", inventory.BodySlot)
		}
		prior, err = inv.EquipArmor(partySlot, candidate.itemID, classID, gd)
		if err == nil && prior != "" && previous.ArmorInstanceID == "" {
			inv.Consumables["arm_"+prior]++
		}
	default:
		return fmt.Errorf("static %s equipment is unsupported", candidate.category)
	}
	if err != nil {
		return err
	}
	inv.Consumables[candidate.inventoryKey]--
	if inv.Consumables[candidate.inventoryKey] == 0 {
		delete(inv.Consumables, candidate.inventoryKey)
	}
	return nil
}
