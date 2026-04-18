package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

type PendingChestClaimState struct {
	NodeID       string `json:"node_id"`
	ChestID      string `json:"chest_id"`
	RewardKind   string `json:"reward_kind"`
	RewardItemID string `json:"reward_item_id,omitempty"`
	RewardAmount int    `json:"reward_amount,omitempty"`
}

type PendingChestClaim struct {
	NodeID       string
	ChestID      string
	RewardKind   string
	RewardItemID string
	RewardAmount int
	SetFlag      string
}

type chestOutcome struct {
	Kind               string
	ItemID             string
	Amount             int
	SetFlag            string
	MonsterFormationID string
	RewardKind         string
	RewardItemID       string
	RewardAmount       int
}

func clonePendingChestClaimState(in *PendingChestClaim) *PendingChestClaimState {
	if in == nil {
		return nil
	}
	return &PendingChestClaimState{
		NodeID:       in.NodeID,
		ChestID:      in.ChestID,
		RewardKind:   in.RewardKind,
		RewardItemID: in.RewardItemID,
		RewardAmount: in.RewardAmount,
	}
}

func (s *Server) handleChestOpen(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req struct {
		NodeID  string `json:"node_id"`
		ChestID string `json:"chest_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.NodeID == "" || req.ChestID == "" {
		httpError(w, "node_id and chest_id required", http.StatusBadRequest)
		return
	}

	state, err := game.openChest(req.NodeID, req.ChestID)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, state)
}

func (s *Server) handleChestClaim(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req struct {
		NodeID  string `json:"node_id"`
		ChestID string `json:"chest_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	state, err := game.claimChest(req.NodeID, req.ChestID)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, state)
}

func (g *Game) openChest(nodeID, chestID string) (*GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	spawn, err := g.findSpawnUnlocked(nodeID)
	if err != nil {
		return nil, err
	}
	if err := chestAnchorExists(spawn, chestID); err != nil {
		return nil, err
	}
	if g.hasTriggeredFlagUnlocked(chestOpenFlag(nodeID, chestID)) {
		return nil, fmt.Errorf("it's empty")
	}

	def := g.gd.ChestByID(chestID)
	if def == nil {
		return nil, fmt.Errorf("unknown chest %q", chestID)
	}
	if def.LockFlag != "" && !g.hasTriggeredFlagUnlocked(def.LockFlag) {
		return nil, fmt.Errorf("it's locked")
	}

	outcome := g.resolveChestOutcomeUnlocked(def)
	if outcome.Kind == "monster_box" {
		if err := g.startChestEncounterUnlocked(outcome.MonsterFormationID); err != nil {
			return nil, err
		}
		g.pendingChestClaim = &PendingChestClaim{
			NodeID:       nodeID,
			ChestID:      chestID,
			RewardKind:   outcome.RewardKind,
			RewardItemID: outcome.RewardItemID,
			RewardAmount: outcome.RewardAmount,
			SetFlag:      outcome.SetFlag,
		}
		g.message = "Monster-in-a-box!"
		state := g.stateUnlocked()
		return &state, nil
	}

	msg, err := g.applyChestRewardUnlocked(outcome.Kind, outcome.ItemID, outcome.Amount)
	if err != nil {
		return nil, err
	}
	g.setTriggeredFlagUnlocked(chestOpenFlag(nodeID, chestID))
	if outcome.SetFlag != "" {
		g.setTriggeredFlagUnlocked(outcome.SetFlag)
	}
	g.message = msg
	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) claimChest(nodeID, chestID string) (*GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.pendingChestClaim == nil {
		return nil, fmt.Errorf("no pending chest claim")
	}
	if g.phase == "combat" {
		return nil, fmt.Errorf("chest reward not ready")
	}
	if nodeID != "" && nodeID != g.pendingChestClaim.NodeID {
		return nil, fmt.Errorf("pending chest claim does not match node")
	}
	if chestID != "" && chestID != g.pendingChestClaim.ChestID {
		return nil, fmt.Errorf("pending chest claim does not match chest")
	}

	msg, err := g.applyChestRewardUnlocked(
		g.pendingChestClaim.RewardKind,
		g.pendingChestClaim.RewardItemID,
		g.pendingChestClaim.RewardAmount,
	)
	if err != nil {
		return nil, err
	}
	g.setTriggeredFlagUnlocked(chestOpenFlag(g.pendingChestClaim.NodeID, g.pendingChestClaim.ChestID))
	if g.pendingChestClaim.SetFlag != "" {
		g.setTriggeredFlagUnlocked(g.pendingChestClaim.SetFlag)
	}
	g.logCombat(msg, CombatActionEntry{Kind: "info"})
	g.message = msg
	g.pendingChestClaim = nil

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) clearPendingChestClaimUnlocked() {
	g.pendingChestClaim = nil
}

func (g *Game) setTriggeredFlagUnlocked(flag string) {
	if flag == "" {
		return
	}
	if g.triggeredFlags == nil {
		g.triggeredFlags = make(map[string]bool)
	}
	g.triggeredFlags[flag] = true
}

func (g *Game) hasTriggeredFlagUnlocked(flag string) bool {
	return flag != "" && g.triggeredFlags != nil && g.triggeredFlags[flag]
}

func chestOpenFlag(nodeID, chestID string) string {
	return fmt.Sprintf("chest_open:%s:%s", nodeID, chestID)
}

func (g *Game) resolveChestOutcomeUnlocked(def *gamedata.ChestDefinition) chestOutcome {
	out := chestOutcome{
		Kind:               def.Kind,
		ItemID:             def.ItemID,
		Amount:             def.Amount,
		SetFlag:            def.SetFlag,
		MonsterFormationID: def.MonsterFormationID,
		RewardKind:         def.RewardKind,
		RewardItemID:       def.RewardItemID,
		RewardAmount:       def.RewardAmount,
	}
	for _, variant := range def.Variants {
		if !variantMatches(g.triggeredFlags, variant.IfFlag, variant.IfFlagNot) {
			continue
		}
		out = applyChestVariant(out, variant)
		break
	}
	if out.Amount <= 0 && (out.Kind == "item" || out.Kind == "key_item") {
		out.Amount = 1
	}
	if out.RewardAmount <= 0 && (out.RewardKind == "item" || out.RewardKind == "key_item") {
		out.RewardAmount = 1
	}
	return out
}

func applyChestVariant(base chestOutcome, variant gamedata.ChestVariant) chestOutcome {
	if variant.Kind != "" {
		base.Kind = variant.Kind
	}
	if variant.ItemID != "" {
		base.ItemID = variant.ItemID
	}
	if variant.Amount > 0 {
		base.Amount = variant.Amount
	}
	if variant.SetFlag != "" {
		base.SetFlag = variant.SetFlag
	}
	if variant.MonsterFormationID != "" {
		base.MonsterFormationID = variant.MonsterFormationID
	}
	if variant.RewardKind != "" {
		base.RewardKind = variant.RewardKind
	}
	if variant.RewardItemID != "" {
		base.RewardItemID = variant.RewardItemID
	}
	if variant.RewardAmount > 0 {
		base.RewardAmount = variant.RewardAmount
	}
	return base
}

func variantMatches(flags map[string]bool, ifFlag, ifFlagNot string) bool {
	if ifFlag != "" && !flags[ifFlag] {
		return false
	}
	if ifFlagNot != "" && flags[ifFlagNot] {
		return false
	}
	return ifFlag != "" || ifFlagNot != ""
}

func (g *Game) applyChestRewardUnlocked(kind, itemID string, amount int) (string, error) {
	switch kind {
	case "gil":
		g.inv.Gold += amount
		return fmt.Sprintf("Got %d gp!", amount), nil
	case "key_item":
		keyItem := g.gd.KeyItemByID(itemID)
		if keyItem == nil {
			return "", fmt.Errorf("unknown key item %q", itemID)
		}
		g.inv.AddKeyItem(itemID)
		return fmt.Sprintf("Received %s!", keyItem.Name), nil
	case "item":
		if amount <= 0 {
			amount = 1
		}
		if c := g.findConsumable(itemID); c != nil {
			g.inv.Consumables[itemID] += amount
			if amount == 1 {
				return fmt.Sprintf("Received %s!", c.Name), nil
			}
			return fmt.Sprintf("Received %dx %s!", amount, c.Name), nil
		}
		if w := g.gd.WeaponByID(itemID); w != nil {
			g.inv.Consumables["wpn_"+itemID] += amount
			if amount == 1 {
				return fmt.Sprintf("Received %s!", w.Name), nil
			}
			return fmt.Sprintf("Received %dx %s!", amount, w.Name), nil
		}
		if a := g.gd.ArmorByID(itemID); a != nil {
			g.inv.Consumables["arm_"+itemID] += amount
			if amount == 1 {
				return fmt.Sprintf("Received %s!", a.Name), nil
			}
			return fmt.Sprintf("Received %dx %s!", amount, a.Name), nil
		}
		return "", fmt.Errorf("unknown chest item %q", itemID)
	default:
		return "", fmt.Errorf("unsupported chest reward %q", kind)
	}
}

func (g *Game) startChestEncounterUnlocked(formationID string) error {
	formation := g.gd.FormationByID(formationID)
	if formation == nil {
		return fmt.Errorf("formation %q not found", formationID)
	}

	g.snapshotVictoryXPProgress()

	partyLevels := make([]int, len(g.party))
	for i, c := range g.party {
		partyLevels[i] = c.Level
	}
	encounterLevel := balance.EncounterLevel(partyLevels, "normal", 0, g.currentQ)

	sizeCounts := make(map[string]int)
	var enemies []*combat.Combatant
	combatantID := 100
	for _, slot := range formation.Slots {
		monster := g.gd.MonsterByID(slot.MonsterID)
		if monster == nil {
			continue
		}
		count := slot.Min
		if slot.Max > slot.Min {
			count += g.rng.IntN(slot.Max - slot.Min + 1)
		}
		cap := balance.SizeMaxPerEncounter[monster.Size]
		if cap > 0 {
			remaining := cap - sizeCounts[monster.Size]
			if remaining <= 0 {
				continue
			}
			if count > remaining {
				count = remaining
			}
		}
		for i := 0; i < count; i++ {
			enemy := balance.ScaleMonster(monster, combatantID, encounterLevel, g.diff)
			enemy.MonsterID = monster.ID
			enemy.Size = monster.Size
			enemies = append(enemies, enemy)
			combatantID++
		}
		sizeCounts[monster.Size] += count
	}
	if len(enemies) == 0 {
		return fmt.Errorf("formation %q produced no combatants", formationID)
	}

	g.enemies = enemies
	g.formation = formation.Layout
	g.phase = "combat"
	g.spellBuffs = nil
	g.combatLog = nil
	g.combatActions = nil
	g.rollEncounterStartForNewFight()
	g.logCombat("Monster-in-a-box!", CombatActionEntry{Kind: "info"})
	for _, enemy := range g.enemies {
		g.logCombat(fmt.Sprintf("  %s (HP: %d)", enemy.Name, enemy.MaxHP), CombatActionEntry{Kind: "info"})
	}
	if g.discovered == nil {
		g.discovered = make(map[string]bool)
	}
	for _, enemy := range g.enemies {
		if enemy.MonsterID != "" {
			g.discovered[enemy.MonsterID] = true
		}
	}
	return nil
}

func (g *Game) findSpawnUnlocked(nodeID string) (*locality.MapSpawn, error) {
	if g.tileMap == nil {
		return nil, fmt.Errorf("tilemap unavailable")
	}
	for i := range g.tileMap.Spawns {
		if g.tileMap.Spawns[i].NodeID == nodeID {
			return &g.tileMap.Spawns[i], nil
		}
	}
	return nil, fmt.Errorf("unknown node %q", nodeID)
}

func chestAnchorExists(spawn *locality.MapSpawn, chestID string) error {
	if spawn == nil || spawn.Interior == nil {
		return fmt.Errorf("node has no interior")
	}
	for _, floor := range spawn.Interior.Floors {
		for _, anchor := range floor.ChestAnchors {
			if anchor.ID == chestID {
				return nil
			}
		}
	}
	return fmt.Errorf("unknown chest %q for node %q", chestID, spawn.NodeID)
}
