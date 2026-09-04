package api

import (
	"encoding/json"
	"math/rand/v2"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func equipmentGame(t *testing.T, class string) *Game {
	t.Helper()
	gd := gamedata.Load("../../shared")
	g, err := NewGameManager(gd, "../../shared").CreateGame(NewGameRequest{TownName: "Test", Places: []string{"Square"}, BigBuilding: "Hall", Party: []PartyMemberReq{{Name: "Hero", ClassID: class}, {Name: "Ally", ClassID: class}}, Difficulty: "normal", RNGSeed: 99})
	if err != nil {
		t.Fatal(err)
	}
	g.inv = inventory.New()
	return g
}
func equipTestRing(t *testing.T, g *Game, stats map[string]int) string {
	t.Helper()
	g.gd.EquipmentBaseByID("copper_ring").Stats = stats
	id, err := g.inv.AddInstance(inventory.EquipmentInstance{BaseID: "copper_ring", Kind: "accessory", RequiredLevel: 1})
	if err != nil {
		t.Fatal(err)
	}
	if err = g.EquipItemAt(0, "ring_1", id, "accessory"); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestEffectiveEquipmentPreviewTransferUnequipAndSave(t *testing.T) {
	g := equipmentGame(t, "warrior")
	base := *g.party[0]
	id := equipTestRing(t, g, map[string]int{"str": 5, "power": 3, "agi": 4, "hit_pct": 32, "lck": 8, "absorb": 7, "crit_pct": 2, "evade_penalty": 3, "int": 50, "vit": 50, "magic_defense": 50})
	got := g.makeCombatants()[0]
	if got.STR != base.STR+5 || got.HitPct != base.HitPct+32 || got.AGI != base.AGI+4 || got.ArmorAbsorb != 7 || got.Evade() != 2*(base.AGI+4)-3 || got.CritChance() != (base.LCK+8)/4+2 {
		t.Fatalf("effective: %+v", got)
	}
	if got.INT != base.INT || got.VIT != base.VIT {
		t.Fatal("inactive bonuses changed gameplay")
	}
	want := g.State().Equipment[0].Effective
	for i := 0; i < 3; i++ {
		_ = g.State()
		_ = g.makeCombatants()
		saved, err := g.ToSaveState("equipment", "test-user")
		if err != nil {
			t.Fatal(err)
		}
		g, err = FromSaveState(saved, g.gd, g.loc)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(*g.party[0], base) || !reflect.DeepEqual(g.State().Equipment[0].Effective, want) {
			t.Fatal("save/reload compounded stats or changed resources")
		}
	}
	prior, _ := json.Marshal(g.inv)
	preview, err := g.PreviewEquipment(EquipmentPreviewRequest{Slot: 1, EquipmentSlot: "ring_2", ItemID: id, Type: "accessory"})
	if err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(g.inv)
	if string(after) != string(prior) {
		t.Fatal("preview mutated inventory")
	}
	if err = g.EquipItemAt(1, "ring_2", id, "accessory"); err != nil {
		t.Fatal(err)
	}
	state := g.State()
	if !reflect.DeepEqual(preview.After, state.Equipment[1].Effective) || !reflect.DeepEqual(preview.PartyAfter[0], state.Equipment[0].Effective) {
		t.Fatal("transfer differs from authoritative preview")
	}
	if g.makeCombatants()[0].STR != base.STR {
		t.Fatal("donor retained bonuses")
	}
	if err = g.UnequipItem(1, "ring_2"); err != nil {
		t.Fatal(err)
	}
	if g.makeCombatants()[1].STR != g.party[1].STR {
		t.Fatal("unequip retained bonuses")
	}
}

func TestEffectiveEquipmentChangesPhysicalOutcomes(t *testing.T) {
	for _, tc := range []struct {
		name     string
		stats    map[string]int
		incoming bool
		wantLess bool
	}{
		{"power", map[string]int{"power": 20}, false, false},
		{"strength", map[string]int{"str": 20}, false, false},
		{"hit", map[string]int{"hit_pct": 64}, false, false},
		{"luck", map[string]int{"lck": 400}, false, false},
		{"crit", map[string]int{"crit_pct": 100}, false, false},
		{"absorb", map[string]int{"absorb": 20}, true, true},
		{"agility", map[string]int{"agi": 35}, true, true},
		{"evade penalty", map[string]int{"evade_penalty": 30}, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := equipmentGame(t, "warrior")
			g.party[0].LCK = 0
			before := g.makeCombatants()[0]
			equipTestRing(t, g, tc.stats)
			after := g.makeCombatants()[0]
			damage := func(player *combat.Combatant) int {
				rng := rand.New(rand.NewPCG(123, 456))
				sum := 0
				for i := 0; i < 200; i++ {
					enemy := &combat.Combatant{ID: 100, STR: 40, AGI: 20, HitPct: 0, CurrentHP: 100000, MaxHP: 100000}
					player.CurrentHP = 100000
					actor, target := player, enemy
					if tc.incoming {
						actor, target = enemy, player
					}
					r := combat.ResolveAction([]*combat.Combatant{player}, []*combat.Combatant{enemy}, combat.Action{ActorID: actor.ID, TargetID: target.ID, Kind: combat.ActionAttack}, &g.gd.Stats.Combat, rng)
					sum += r[0].TotalDmg
				}
				return sum
			}
			a, b := damage(before), damage(after)
			if a == b || (b < a) != tc.wantLess {
				t.Fatalf("damage %d -> %d", a, b)
			}
		})
	}
}

func TestBrawlerEquipmentAndBuffsApplyOnce(t *testing.T) {
	g := equipmentGame(t, "brawler")
	base := *g.party[0]
	equipTestRing(t, g, map[string]int{"str": 4, "power": 5, "hit_pct": 32, "absorb": 7})
	g.spellBuffs = map[int][]combat.CombatBuff{0: {{Kind: "spell_bless", HitPctBonus: 10}, {Kind: "spell_aegis", ArmorAbsorbMult: 200}}}
	for i := 0; i < 3; i++ {
		c := g.makeCombatants()[0]
		want := g.gd.ClassByID("brawler").BareHand.BaseDamage + base.Level*(base.STR+4)/2 + 5
		if g.State().Equipment[0].Effective["attack"] != want || c.BareHandDamage+c.WeaponPower != want {
			t.Fatal("Brawler power or STR lost")
		}
		if combat.EffectiveHitPct(c) != base.HitPct+32+10 || combat.EffectiveArmorAbsorb(c) != 14 {
			t.Fatal("buff/gear applied incorrectly")
		}
	}
	if !reflect.DeepEqual(base, *g.party[0]) {
		t.Fatal("base changed")
	}
	// Brawler class restrictions still reject ordinary weapons.
	if _, err := g.inv.EquipWeapon(0, "short_sword", "brawler", g.gd); err == nil {
		t.Fatal("class restriction lost")
	}
}

func TestInactiveGearDoesNotImproveRecommendation(t *testing.T) {
	g := equipmentGame(t, "mender")
	id := equipTestRing(t, g, map[string]int{"int": 200, "vit": 200, "magic_defense": 200})
	if err := g.UnequipItem(0, "ring_1"); err != nil {
		t.Fatal(err)
	}
	for _, goal := range []string{"balanced", "offense", "defense", "magic"} {
		plan, err := g.RecommendEquipment(0, goal)
		if err != nil {
			t.Fatal(err)
		}
		for _, change := range plan.Changes {
			if change.To.InstanceID == id {
				t.Fatalf("inactive gear recommended for %s", goal)
			}
		}
	}
}

// Ensure only resources/status are synchronized after rounds, even with gear.
func TestEffectiveEquipmentCombatRoundsPreserveBase(t *testing.T) {
	g := equipmentGame(t, "warrior")
	equipTestRing(t, g, map[string]int{"str": 4, "absorb": 7, "hit_pct": 32})
	base := *g.party[0]
	g.phase = "combat"
	g.enemies = []*combat.Combatant{{ID: 100, Name: "Target", CurrentHP: 100000, MaxHP: 100000, STR: 1, AGI: 1}}
	for i := 0; i < 3; i++ {
		_, err := g.ProcessAction(GameActionRequest{Type: "combat_round", Actions: []MemberActionReq{{Slot: 0, Type: "attack", TargetID: 100}, {Slot: 1, Type: "defend", TargetID: 1}}})
		if err != nil {
			t.Fatal(err)
		}
		got := *g.party[0]
		got.CurrentHP = base.CurrentHP
		got.Status = character.StatusNone
		if !reflect.DeepEqual(got, base) {
			t.Fatal("round synchronized effective stats into growth")
		}
	}
}
