package api

import (
	"sync"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func newBattleLootGame(t *testing.T, drops []gamedata.Drop, monsterCount int) (*Game, *gamedata.GameData) {
	t.Helper()
	gd := gamedata.Load("../../shared")
	monster := gd.MonsterByID("slime")
	if monster == nil {
		t.Fatal("slime fixture missing")
	}
	monster.Drops = append([]gamedata.Drop(nil), drops...)
	manager := NewGameManager(gd, "../../shared")
	game, err := manager.CreateGame(NewGameRequest{
		TownName: "Cadott", Places: []string{"School", "Store"}, BigBuilding: "Town Hall",
		Party: []PartyMemberReq{
			{Name: "Ayla", ClassID: "warrior"},
			{Name: "Mira", ClassID: "cinder"},
		},
		Difficulty: "normal", RNGSeed: 42,
	})
	if err != nil {
		t.Fatalf("CreateGame: %v", err)
	}
	monsters := make([]string, monsterCount)
	for i := range monsters {
		monsters[i] = "slime"
	}
	if err := game.DebugForceEncounter(monsters, 1); err != nil {
		t.Fatalf("DebugForceEncounter: %v", err)
	}
	return game, gd
}

func forceBattleLootVictory(t *testing.T, game *Game) GameState {
	t.Helper()
	if err := game.DebugForceVictory(); err != nil {
		t.Fatalf("DebugForceVictory: %v", err)
	}
	state := game.State()
	if state.Phase != "quest_complete" {
		t.Fatalf("phase = %q, want quest_complete", state.Phase)
	}
	if state.BattleRewards == nil {
		t.Fatal("battle reward receipt missing")
	}
	return state
}

func TestBattleRewardsDescribeExactDropsAndEligibleComparisons(t *testing.T) {
	t.Parallel()
	game, _ := newBattleLootGame(t, []gamedata.Drop{
		{ItemID: "potion", ChancePct: 100},
		{ItemID: "ember_shard", ChancePct: 100},
		{ItemID: "iron_sword", ChancePct: 100},
	}, 2)
	before := game.State()
	state := forceBattleLootVictory(t, game)

	if state.BattleRewards.XP <= 0 || state.BattleRewards.Gold <= 0 {
		t.Fatalf("battle totals = %+v", state.BattleRewards)
	}
	var potion, gem *BattleDropState
	var equipment []BattleDropState
	for i := range state.BattleRewards.Drops {
		drop := &state.BattleRewards.Drops[i]
		switch drop.Kind {
		case "consumable":
			potion = drop
		case "gem":
			gem = drop
		case "equipment":
			equipment = append(equipment, *drop)
		}
	}
	if potion == nil || potion.ItemID != "potion" || potion.Name != "Potion" || potion.Quantity != 2 {
		t.Fatalf("potion receipt = %+v", potion)
	}
	if gem == nil || gem.ItemID != "ember_shard" || gem.Name != "Ember Shard" || gem.Quantity != 2 {
		t.Fatalf("gem receipt = %+v", gem)
	}
	if state.Potions != before.Potions+2 {
		t.Fatalf("potions = %d, want %d", state.Potions, before.Potions+2)
	}
	if got := gemCount(state.Gems, "ember_shard"); got != gemCount(before.Gems, "ember_shard")+2 {
		t.Fatalf("ember shards = %d, want %d", got, gemCount(before.Gems, "ember_shard")+2)
	}
	if len(equipment) != 2 {
		t.Fatalf("equipment receipts = %d, want 2: %+v", len(equipment), equipment)
	}
	if equipment[0].InstanceID == equipment[1].InstanceID {
		t.Fatalf("distinct rolls share instance id %q", equipment[0].InstanceID)
	}
	for _, drop := range equipment {
		if drop.Decision != battleLootPending || drop.Item == nil || drop.Item.InstanceID != drop.InstanceID {
			t.Fatalf("equipment receipt = %+v", drop)
		}
		if len(drop.EquipOptions) == 0 {
			t.Fatalf("equipment %q has no eligible comparisons", drop.InstanceID)
		}
		for _, option := range drop.EquipOptions {
			if option.PartySlot != 0 || option.CharacterName != "Ayla" || option.ClassName != "Warrior" {
				t.Fatalf("ineligible comparison leaked: %+v", option)
			}
			if option.Before == nil || option.After == nil || option.Deltas == nil {
				t.Fatalf("comparison missing authoritative stats: %+v", option)
			}
		}
	}
}

func TestBattleLootEquipNowIsAtomicAndIdempotent(t *testing.T) {
	t.Parallel()
	game, _ := newBattleLootGame(t, []gamedata.Drop{{ItemID: "iron_sword", ChancePct: 100}}, 1)
	oldWeapon := game.inv.Equipment[0].WeaponInstanceID
	state := forceBattleLootVictory(t, game)
	drop := state.BattleRewards.Drops[0]
	instanceCount := len(game.inv.Instances)
	rollSequence := game.lootRollSeq
	req := BattleLootDecisionRequest{
		InstanceID: drop.InstanceID, Action: "equip", PartySlot: 0, EquipmentSlot: "main_hand",
		ExpectedStateToken: drop.DecisionToken,
	}

	equipped, err := game.ResolveBattleLoot(req)
	if err != nil {
		t.Fatalf("ResolveBattleLoot equip: %v", err)
	}
	if got := equipped.Equipment[0].WeaponInstanceID; got != drop.InstanceID {
		t.Fatalf("equipped instance = %q, want %q", got, drop.InstanceID)
	}
	if game.inv.Instance(oldWeapon) == nil || game.inv.InstanceEquipped(oldWeapon) {
		t.Fatalf("displaced weapon lost or still equipped: %q", oldWeapon)
	}
	if len(game.inv.Instances) != instanceCount || game.lootRollSeq != rollSequence {
		t.Fatalf("equip changed custody or rerolled: instances=%d/%d sequence=%d/%d",
			len(game.inv.Instances), instanceCount, game.lootRollSeq, rollSequence)
	}

	retried, err := game.ResolveBattleLoot(req)
	if err != nil {
		t.Fatalf("identical retry: %v", err)
	}
	if retried.Equipment[0].WeaponInstanceID != drop.InstanceID || len(game.inv.Instances) != instanceCount {
		t.Fatal("identical retry duplicated or moved the equipment")
	}
	if _, err := game.ResolveBattleLoot(BattleLootDecisionRequest{InstanceID: drop.InstanceID, Action: "keep"}); err == nil {
		t.Fatal("conflicting Keep after Equip Now was accepted")
	}
}

func TestBattleLootKeepIsIdempotentAndNextEncounterClearsReceipt(t *testing.T) {
	t.Parallel()
	game, _ := newBattleLootGame(t, []gamedata.Drop{{ItemID: "copper_ring", ChancePct: 100}}, 1)
	state := forceBattleLootVictory(t, game)
	drop := state.BattleRewards.Drops[0]
	instanceCount := len(game.inv.Instances)
	req := BattleLootDecisionRequest{
		InstanceID: drop.InstanceID, Action: "keep", ExpectedStateToken: drop.DecisionToken,
	}

	for attempt := 0; attempt < 2; attempt++ {
		kept, err := game.ResolveBattleLoot(req)
		if err != nil {
			t.Fatalf("Keep attempt %d: %v", attempt+1, err)
		}
		if kept.BattleRewards.Drops[0].Decision != battleLootKept {
			t.Fatalf("decision = %q, want kept", kept.BattleRewards.Drops[0].Decision)
		}
	}
	if game.inv.Instance(drop.InstanceID) == nil || game.inv.InstanceEquipped(drop.InstanceID) {
		t.Fatal("Keep lost or equipped the instance")
	}
	if len(game.inv.Instances) != instanceCount {
		t.Fatal("Keep duplicated the instance")
	}
	if _, err := game.ResolveBattleLoot(BattleLootDecisionRequest{
		InstanceID: drop.InstanceID, Action: "equip", PartySlot: 0, EquipmentSlot: "ring_1",
	}); err == nil {
		t.Fatal("conflicting Equip Now after Keep was accepted")
	}

	if err := game.DebugForceEncounter([]string{"slime"}, 1); err != nil {
		t.Fatalf("next DebugForceEncounter: %v", err)
	}
	if got := game.State().BattleRewards; got != nil {
		t.Fatalf("stale receipt survived next encounter: %+v", got)
	}
}

func TestBattleLootReceiptAndExactInstanceSurviveSaveLoad(t *testing.T) {
	t.Parallel()
	game, gd := newBattleLootGame(t, []gamedata.Drop{{ItemID: "copper_ring", ChancePct: 100}}, 1)
	state := forceBattleLootVictory(t, game)
	drop := state.BattleRewards.Drops[0]
	saved, err := game.ToSaveState("loot receipt", "test-user")
	if err != nil {
		t.Fatalf("ToSaveState: %v", err)
	}
	loaded, err := FromSaveState(saved, gd, game.loc)
	if err != nil {
		t.Fatalf("FromSaveState: %v", err)
	}
	restored := loaded.State()
	if restored.BattleRewards == nil || len(restored.BattleRewards.Drops) != 1 {
		t.Fatalf("restored receipt = %+v", restored.BattleRewards)
	}
	if got := restored.BattleRewards.Drops[0].InstanceID; got != drop.InstanceID {
		t.Fatalf("restored instance = %q, want %q", got, drop.InstanceID)
	}
	if loaded.inv.Instance(drop.InstanceID) == nil {
		t.Fatalf("restored inventory lost %q", drop.InstanceID)
	}
	if _, err := loaded.ResolveBattleLoot(BattleLootDecisionRequest{
		InstanceID: restored.BattleRewards.Drops[0].InstanceID, Action: "equip",
		PartySlot: 0, EquipmentSlot: "ring_1",
		ExpectedStateToken: restored.BattleRewards.Drops[0].DecisionToken,
	}); err != nil {
		t.Fatalf("Equip Now after load: %v", err)
	}
	if loaded.inv.Equipment[0].Equipped("ring_1").InstanceID != drop.InstanceID {
		t.Fatal("loaded game did not equip the exact saved instance")
	}
}

func TestBattleLootEquipRejectsStaleComparisonAndReturnsRefresh(t *testing.T) {
	t.Parallel()
	game, _ := newBattleLootGame(t, []gamedata.Drop{{ItemID: "iron_sword", ChancePct: 100}}, 1)
	state := forceBattleLootVictory(t, game)
	drop := state.BattleRewards.Drops[0]

	if err := game.DebugGiveItem("hand_axe", 1); err != nil {
		t.Fatalf("DebugGiveItem hand axe: %v", err)
	}
	var interveningID string
	for id, instance := range game.inv.Instances {
		if instance.BaseID == "hand_axe" {
			interveningID = id
			break
		}
	}
	if interveningID == "" {
		t.Fatal("rolled hand axe missing")
	}
	if err := game.EquipItemAt(0, "main_hand", interveningID, "weapon"); err != nil {
		t.Fatalf("intervening EquipItemAt: %v", err)
	}

	refreshed, err := game.ResolveBattleLoot(BattleLootDecisionRequest{
		InstanceID: drop.InstanceID, Action: "equip", PartySlot: 0, EquipmentSlot: "main_hand",
		ExpectedStateToken: drop.DecisionToken,
	})
	if err == nil || refreshed == nil {
		t.Fatalf("stale equip = state %v, err %v; want conflict with refresh", refreshed != nil, err)
	}
	if got := refreshed.Equipment[0].WeaponInstanceID; got != interveningID {
		t.Fatalf("stale choice displaced %q with %q", interveningID, got)
	}
	refreshedDrop := refreshed.BattleRewards.Drops[0]
	if refreshedDrop.Decision != battleLootPending || refreshedDrop.DecisionToken == drop.DecisionToken {
		t.Fatalf("refresh did not preserve pending choice with a new token: %+v", refreshedDrop)
	}

	equipped, err := game.ResolveBattleLoot(BattleLootDecisionRequest{
		InstanceID: drop.InstanceID, Action: "equip", PartySlot: 0, EquipmentSlot: "main_hand",
		ExpectedStateToken: refreshedDrop.DecisionToken,
	})
	if err != nil {
		t.Fatalf("refreshed equip: %v", err)
	}
	if got := equipped.Equipment[0].WeaponInstanceID; got != drop.InstanceID {
		t.Fatalf("refreshed equip = %q, want %q", got, drop.InstanceID)
	}
}

func TestBattleLootConcurrentConflictingDecisionsHaveOneWinner(t *testing.T) {
	t.Parallel()
	game, _ := newBattleLootGame(t, []gamedata.Drop{{ItemID: "iron_sword", ChancePct: 100}}, 1)
	state := forceBattleLootVictory(t, game)
	drop := state.BattleRewards.Drops[0]
	requests := []BattleLootDecisionRequest{
		{InstanceID: drop.InstanceID, Action: "equip", PartySlot: 0, EquipmentSlot: "main_hand", ExpectedStateToken: drop.DecisionToken},
		{InstanceID: drop.InstanceID, Action: "equip", PartySlot: 0, EquipmentSlot: "off_hand", ExpectedStateToken: drop.DecisionToken},
	}
	errs := make([]error, len(requests))
	results := make([]*GameState, len(requests))
	var wg sync.WaitGroup
	for i := range requests {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			results[index], errs[index] = game.ResolveBattleLoot(requests[index])
		}(i)
	}
	wg.Wait()

	successes := 0
	for _, err := range errs {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent successes = %d, want 1; errors=%v", successes, errs)
	}
	for index, err := range errs {
		if err != nil && (results[index] == nil || results[index].BattleRewards.Drops[0].Decision != battleLootEquipped) {
			t.Fatalf("losing request did not receive resolved refresh: result=%+v err=%v", results[index], err)
		}
	}
	partySlot, equipmentSlot, equipped := game.inv.FindEquippedInstance(drop.InstanceID)
	if !equipped || partySlot != 0 || (equipmentSlot != "main_hand" && equipmentSlot != "off_hand") {
		t.Fatalf("winning exact instance custody = party %d slot %q equipped %v", partySlot, equipmentSlot, equipped)
	}
	if decision := game.State().BattleRewards.Drops[0].Decision; decision != battleLootEquipped {
		t.Fatalf("receipt decision = %q, want equipped", decision)
	}
}

func TestBattleLootKeepReconcilesExternallyEquippedDrop(t *testing.T) {
	t.Parallel()
	game, _ := newBattleLootGame(t, []gamedata.Drop{{ItemID: "copper_ring", ChancePct: 100}}, 1)
	state := forceBattleLootVictory(t, game)
	drop := state.BattleRewards.Drops[0]
	if err := game.EquipItemAt(0, "ring_2", drop.InstanceID, "accessory"); err != nil {
		t.Fatalf("external EquipItemAt: %v", err)
	}

	reconciled, err := game.ResolveBattleLoot(BattleLootDecisionRequest{
		InstanceID: drop.InstanceID, Action: "keep", ExpectedStateToken: drop.DecisionToken,
	})
	if err != nil {
		t.Fatalf("Keep reconcile: %v", err)
	}
	got := reconciled.BattleRewards.Drops[0]
	if got.Decision != battleLootEquipped || got.EquippedPartySlot == nil || *got.EquippedPartySlot != 0 || got.EquipmentSlot != "ring_2" {
		t.Fatalf("reconciled receipt = %+v", got)
	}
	if party, slot, equipped := game.inv.FindEquippedInstance(drop.InstanceID); !equipped || party != 0 || slot != "ring_2" {
		t.Fatalf("exact drop custody = party %d slot %q equipped %v", party, slot, equipped)
	}
}

func gemCount(gems []GemState, id string) int {
	for _, gem := range gems {
		if gem.ID == id {
			return gem.Count
		}
	}
	return 0
}
