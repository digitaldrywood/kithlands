package main

import (
	"flag"
	"fmt"
	"math/rand/v2"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func main() {
	partyFlag := flag.String("party", "warrior,cinder", "comma-separated class IDs")
	diffFlag := flag.String("difficulty", "normal", "easy/normal/hard/classic")
	startLvl := flag.Int("start", 1, "starting level")
	endLvl := flag.Int("end", 20, "ending level")
	battles := flag.Int("battles", 200, "battles per level")
	seed := flag.Uint64("seed", 42, "RNG seed")
	shared := flag.String("shared", "../shared", "path to shared/ directory")
	flag.Parse()

	gd := gamedata.Load(*shared)
	diff := balance.GetDifficulty(*diffFlag)

	classIDs := strings.Split(*partyFlag, ",")
	fmt.Println("Balance Simulator")
	fmt.Printf("Party: %s | Difficulty: %s | Levels: %d-%d | Battles/level: %d | Seed: %d\n\n",
		*partyFlag, *diffFlag, *startLvl, *endLvl, *battles, *seed)

	fmt.Println("Level,AvgRounds,WipeRate,AvgDmgDealt,AvgDmgTaken,AvgHPRemain")

	for level := *startLvl; level <= *endLvl; level++ {
		var totalRounds, totalWipes int
		var totalDmgDealt, totalDmgTaken, totalHPRemain int

		for b := 0; b < *battles; b++ {
			rng := rand.New(rand.NewPCG(*seed+uint64(level*10000+b), 0))

			// Create party at this level
			party := makeParty(classIDs, level, gd, rng)

			// Generate encounter using formation system
			encLvl := balance.EncounterLevel([]int{level, level, level, level}, *diffFlag, 0, 0)
			result := balance.GenerateFormationEncounter(gd, encLvl, diff, "", rng)
			enemies := result.Combatants

			// Run combat
			rounds, wiped, dmgDealt, dmgTaken := simulateFight(party, enemies, gd, rng)
			totalRounds += rounds
			if wiped {
				totalWipes++
			}
			totalDmgDealt += dmgDealt
			totalDmgTaken += dmgTaken

			hpRemain := 0
			for _, c := range party {
				if c.CurrentHP > 0 {
					hpRemain += c.CurrentHP
				}
			}
			totalHPRemain += hpRemain
		}

		n := float64(*battles)
		fmt.Printf("%d,%.1f,%.1f%%,%.0f,%.0f,%.0f\n",
			level,
			float64(totalRounds)/n,
			float64(totalWipes)/n*100,
			float64(totalDmgDealt)/n,
			float64(totalDmgTaken)/n,
			float64(totalHPRemain)/n,
		)
	}
}

func makeParty(classIDs []string, level int, gd *gamedata.GameData, rng *rand.Rand) []*combat.Combatant {
	var party []*combat.Combatant

	for i, classID := range classIDs {
		class := gd.ClassByID(classID)
		if class == nil {
			panic(fmt.Sprintf("unknown class: %s", classID))
		}

		c := character.New(fmt.Sprintf("P%d", i+1), classID, class)

		// Level up to target
		for c.Level < level {
			c.XP = 999999
			character.LevelUp(c, class, &gd.Stats, rng)
		}

		// Give tier-appropriate weapon
		weaponPower := 5 + (level-1)*2
		if weaponPower > 75 {
			weaponPower = 75
		}

		party = append(party, &combat.Combatant{
			ID:          i,
			Name:        c.Name,
			IsPlayer:    true,
			STR:         c.STR,
			AGI:         c.AGI,
			INT:         c.INT,
			VIT:         c.VIT,
			LCK:         c.LCK,
			HitPct:      c.HitPct,
			MaxHP:       c.MaxHP,
			CurrentHP:   c.MaxHP,
			WeaponPower: weaponPower,
			ArmorAbsorb: level * 2,
		})
	}

	return party
}

func simulateFight(party, enemies []*combat.Combatant, gd *gamedata.GameData, rng *rand.Rand) (rounds int, wiped bool, dmgDealt, dmgTaken int) {
	maxRounds := 50

	for round := 0; round < maxRounds; round++ {
		rounds++

		var actions []combat.Action

		// Party attacks random enemy
		for _, p := range party {
			if p.CurrentHP <= 0 {
				continue
			}
			target := firstLiving(enemies)
			if target == nil {
				break
			}
			actions = append(actions, combat.Action{
				ActorID: p.ID, Kind: combat.ActionAttack, TargetID: target.ID,
			})
		}

		for _, e := range enemies {
			if action, ok := combat.PlanEnemyAction(e, party, gd.MonsterByID(e.MonsterID), round, rng); ok {
				actions = append(actions, action)
			}
		}

		results := combat.ResolveTurn(party, enemies, actions, &gd.Stats.Combat, rng)

		for _, r := range results {
			actor := findCombatant(party, enemies, r.ActorID)
			if actor != nil && actor.IsPlayer {
				dmgDealt += r.TotalDmg
			} else {
				dmgTaken += r.TotalDmg
			}
		}

		if combat.CheckVictory(enemies) {
			return rounds, false, dmgDealt, dmgTaken
		}
		if combat.CheckDefeat(party) {
			return rounds, true, dmgDealt, dmgTaken
		}
	}

	return rounds, true, dmgDealt, dmgTaken
}

func firstLiving(combatants []*combat.Combatant) *combat.Combatant {
	for _, c := range combatants {
		if c.CurrentHP > 0 {
			return c
		}
	}
	return nil
}

func findCombatant(party, enemies []*combat.Combatant, id int) *combat.Combatant {
	for _, c := range party {
		if c.ID == id {
			return c
		}
	}
	for _, c := range enemies {
		if c.ID == id {
			return c
		}
	}
	return nil
}
