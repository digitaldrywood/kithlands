package main

import (
	"bufio"
	"fmt"
	"math/rand/v2"
	"os"
	"strconv"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

var reader = bufio.NewReader(os.Stdin)

func main() {
	gd := gamedata.Load("../shared")
	rng := rand.New(rand.NewPCG(uint64(os.Getpid()), 0))

	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("  K I T H L A N D S")
	fmt.Println("  Your town. Your people. Your saga.")
	fmt.Println("========================================")
	fmt.Println()

	// Wizard
	loc := runWizard()

	// Pick spawn
	fmt.Printf("\nYour town of %s has been created with %d locations.\n", loc.Name, len(loc.Nodes))

	// Pick party
	party, spellBooks := pickParty(gd, rng)

	// Equip starting gear
	inv := inventory.New()
	inv.Gold = 100
	inv.Consumables["potion"] = 3
	for i, c := range party {
		equipStartingGear(i, c.ClassID, inv, gd)
	}

	// Generate campaign
	walk := locality.Walk(loc, loc.Nodes[0].ID)
	sidePool, _ := generator.LoadSideQuestPool("../shared")
	quests := generator.GenerateCampaign(loc, loc.Nodes[0].ID, rng, sidePool)

	fmt.Printf("\n--- Campaign generated: %d quests ---\n", len(quests))
	for i, q := range quests {
		fmt.Printf("  %d. [Act %d] %s\n", i+1, q.Act, q.Name)
	}

	// Game loop
	fmt.Println("\n=== ADVENTURE BEGINS ===")
	diff := balance.GetDifficulty("normal")

	for qi := range quests {
		q := &quests[qi]
		fmt.Printf("\n--- Quest %d/%d: %s ---\n", qi+1, len(quests), q.Name)
		fmt.Printf("  %s\n", q.Description)

		// Process quest actions
		for _, action := range q.Actions {
			switch action.Type {
			case generator.ActionGoto:
				fmt.Printf("\n  >> Traveling to %s...\n", action.Detail)

				// Random encounter chance
				if rng.IntN(100) < 60 {
					fmt.Println("\n  !! ENCOUNTER !!")
					partyLevels := make([]int, len(party))
					for i, c := range party {
						partyLevels[i] = c.Level
					}
					encLvl := balance.EncounterLevel(partyLevels, "normal", 0, walk.DistanceMap[action.Location])
					enemies := balance.GenerateEncounter(gd.Monsters, encLvl, diff, rng)

					combatants := makeCombatants(party, inv, gd)
					won := runCombat(combatants, enemies, party, spellBooks, inv, gd, rng)
					if !won {
						fmt.Println("\n  DEFEAT. Your party has fallen.")
						fmt.Println("  Game Over.")
						return
					}

					// XP and gold
					totalXP := 0
					totalGold := 0
					for _, e := range enemies {
						for _, m := range gd.Monsters {
							if m.Name == e.Name {
								totalXP += m.XPReward
								totalGold += m.GoldReward
								break
							}
						}
					}
					inv.Gold += totalGold
					livingCount := 0
					for _, c := range party {
						if c.IsAlive() {
							livingCount++
						}
					}
					if livingCount > 0 {
						xpEach := totalXP / livingCount
						for _, c := range party {
							if c.IsAlive() {
								c.XP += xpEach
							}
						}
					}
					fmt.Printf("  Victory! +%d XP each, +%d gold\n", totalXP/max(1, livingCount), totalGold)

					// Check level ups
					for _, c := range party {
						for character.CanLevelUp(c, &gd.Stats.XPCurve) {
							cls := gd.ClassByID(c.ClassID)
							oldLevel := c.Level
							character.LevelUp(c, cls, &gd.Stats, rng)
							fmt.Printf("  ** %s leveled up! %d -> %d (HP: %d) **\n", c.Name, oldLevel, c.Level, c.MaxHP)

							// MP growth is handled inside character.LevelUp; refill just in case.
							_ = spellBooks[c.Name]
							c.CurrentMP = c.MaxMP
						}
					}
				} else {
					fmt.Println("  (safe travels)")
				}

			case generator.ActionKill:
				if q.TemplateID == "Q12" {
					// Boss fight
					fmt.Println("\n  !! BOSS BATTLE !!")
					boss := gd.MonsterByID("dark_knight")
					enemies := []*combat.Combatant{balance.ScaleMonster(boss, 100, party[0].Level+2, diff)}

					combatants := makeCombatants(party, inv, gd)
					won := runCombat(combatants, enemies, party, spellBooks, inv, gd, rng)
					if !won {
						fmt.Println("\n  DEFEAT. The Dark Knight was too powerful.")
						fmt.Println("  Game Over.")
						return
					}
					fmt.Printf("  Victory! +%d XP each, +%d gold\n", boss.XPReward, boss.GoldReward)
					inv.Gold += boss.GoldReward
					for _, c := range party {
						if c.IsAlive() {
							c.XP += boss.XPReward
						}
					}
				} else {
					fmt.Println("  >> You clear the area of threats.")
				}

			case generator.ActionGet:
				fmt.Printf("  >> You found the %s!\n", action.Target)

			case generator.ActionGive, generator.ActionReport:
				fmt.Printf("  >> You report back to %s.\n", action.Detail)
			}
		}

		q.Completed = true
		fmt.Printf("\n  Quest complete! +%d XP, +%d gold\n", q.Reward.XP, q.Reward.Gold)
		inv.Gold += q.Reward.Gold
		for _, c := range party {
			if c.IsAlive() {
				c.XP += q.Reward.XP
			}
		}

		// Heal at inn between quests
		fmt.Println("  (Resting at the inn... HP and MP restored)")
		for _, c := range party {
			c.CurrentHP = c.MaxHP
			c.CurrentMP = c.MaxMP
			c.Status = character.StatusNone
		}
		_ = spellBooks

		// Level up check
		for _, c := range party {
			for character.CanLevelUp(c, &gd.Stats.XPCurve) {
				cls := gd.ClassByID(c.ClassID)
				oldLevel := c.Level
				character.LevelUp(c, cls, &gd.Stats, rng)
				fmt.Printf("  ** %s leveled up! %d -> %d (HP: %d) **\n", c.Name, oldLevel, c.Level, c.MaxHP)
			}
		}
	}

	fmt.Println("\n========================================")
	fmt.Println("  VICTORY!")
	fmt.Printf("  %s is saved.\n", loc.Name)
	fmt.Println("========================================")
	fmt.Println("\nFinal party:")
	for _, c := range party {
		fmt.Printf("  %s (%s) Lv.%d  HP:%d  STR:%d AGI:%d INT:%d VIT:%d LCK:%d\n",
			c.Name, c.ClassID, c.Level, c.MaxHP, c.STR, c.AGI, c.INT, c.VIT, c.LCK)
	}
	fmt.Printf("  Gold: %d\n", inv.Gold)
}

func runWizard() *locality.Locality {
	fmt.Println("=== LOCALITY WIZARD ===")
	fmt.Println()

	townName := prompt("Where do you live? (town name): ")
	if townName == "" {
		townName = "Cadott, WI"
	}

	fmt.Println("\nName 5 people from your town. These become NPCs in the game --")
	fmt.Println("neighbors, shopkeepers, quest-givers, or even the villain.")
	fmt.Println("They are NOT your party (you pick your party next).")
	fmt.Println("Mark each as friendly, neutral, or rival to shape their role.")
	fmt.Println()
	var people []locality.WizardPerson
	defaults := []locality.WizardPerson{
		{Name: "Bob", Relation: "friendly", Personality: "Hardware store owner"},
		{Name: "Mrs Henderson", Relation: "neutral", Personality: "Town gossip"},
		{Name: "Mayor Grimes", Relation: "rival", Personality: "Ambitious politician"},
		{Name: "Coach Davis", Relation: "friendly", Personality: "Tough mentor"},
		{Name: "Old Pete", Relation: "neutral", Personality: "Mysterious old timer"},
	}

	for i := 0; i < 5; i++ {
		name := prompt(fmt.Sprintf("  NPC %d (name, or Enter for '%s'): ", i+1, defaults[i].Name))
		if name == "" {
			people = append(people, defaults[i])
		} else {
			rel := prompt("    Are they friendly, neutral, or a rival? [f/n/r]: ")
			relation := "friendly"
			if strings.HasPrefix(strings.ToLower(rel), "n") {
				relation = "neutral"
			} else if strings.HasPrefix(strings.ToLower(rel), "r") {
				relation = "rival"
			}
			people = append(people, locality.WizardPerson{Name: name, Relation: relation})
		}
	}

	fmt.Println("\nName 3 places that matter in your town (or Enter for defaults):")
	defaultPlaces := []string{"The School", "Creswood Corners", "Fire Hall"}
	var places []string
	for i := 0; i < 3; i++ {
		place := prompt(fmt.Sprintf("  Place %d (or Enter for '%s'): ", i+1, defaultPlaces[i]))
		if place == "" {
			places = append(places, defaultPlaces[i])
		} else {
			places = append(places, place)
		}
	}

	bigBuilding := prompt("\nWhat's the biggest building in town? (Enter for 'Town Hall'): ")
	if bigBuilding == "" {
		bigBuilding = "Town Hall"
	}

	return locality.BuildFromWizard(locality.WizardInput{
		TownName:    townName,
		People:      people,
		Places:      places,
		BigBuilding: bigBuilding,
		Flavor:      "conquest",
		Difficulty:  "normal",
	})
}

func pickParty(gd *gamedata.GameData, rng *rand.Rand) ([]*character.Character, map[string]*magic.SpellBook) {
	fmt.Println("\n=== PICK YOUR PARTY (2 members, demo cut) ===")
	fmt.Println("  Classes: warrior, brawler, rogue, mender, cinder, wayfarer")
	fmt.Println("  (Enter for default: warrior + cinder)")

	spellBooks := make(map[string]*magic.SpellBook)

	class1 := prompt("\n  Slot 1 class: ")
	if class1 == "" {
		class1 = "warrior"
	}
	name1 := prompt("  Slot 1 name: ")
	if name1 == "" {
		name1 = "Hero"
	}
	cls1 := gd.ClassByID(class1)
	if cls1 == nil {
		fmt.Printf("  Unknown class %q, using warrior\n", class1)
		class1 = "warrior"
		cls1 = gd.ClassByID("warrior")
	}
	char1 := character.New(name1, class1, cls1)

	class2 := prompt("\n  Slot 2 class: ")
	if class2 == "" {
		class2 = "cinder"
	}
	name2 := prompt("  Slot 2 name: ")
	if name2 == "" {
		name2 = "Sparks"
	}
	cls2 := gd.ClassByID(class2)
	if cls2 == nil {
		fmt.Printf("  Unknown class %q, using cinder\n", class2)
		class2 = "cinder"
		cls2 = gd.ClassByID("cinder")
	}
	char2 := character.New(name2, class2, cls2)

	party := []*character.Character{char1, char2}

	// Set up spell books for casters
	for _, c := range party {
		cls := gd.ClassByID(c.ClassID)
		if len(cls.Magic.Schools) > 0 {
			sb := magic.NewSpellBook()

			// Learn starting spells
			for _, spell := range gd.Spells.Spells {
				for _, school := range cls.Magic.Schools {
					if spell.School == school && spell.SpellLevel == 1 {
						sb.LearnSpell(spell.ID, spell.SpellLevel, gd.Spells.ChargeTable.MaxSpellsPerLvl)
					}
				}
			}

			spellBooks[c.Name] = sb
		}
	}

	fmt.Println("\nYour party:")
	for _, c := range party {
		fmt.Printf("  %s the %s  HP:%d STR:%d AGI:%d INT:%d\n",
			c.Name, gd.ClassByID(c.ClassID).Name, c.MaxHP, c.STR, c.AGI, c.INT)
		if sb, ok := spellBooks[c.Name]; ok {
			var known []string
			for _, spells := range sb.KnownSpells {
				known = append(known, spells...)
			}
			fmt.Printf("    Spells: %s\n", strings.Join(known, ", "))
		}
	}

	return party, spellBooks
}

func equipStartingGear(slot int, classID string, inv *inventory.Inventory, gd *gamedata.GameData) {
	switch classID {
	case "warrior":
		inv.EquipWeapon(slot, "short_sword", classID, gd)
		inv.EquipArmor(slot, "leather_armor", classID, gd)
	case "cinder":
		inv.EquipWeapon(slot, "wooden_staff", classID, gd)
		inv.EquipArmor(slot, "cloth_robe", classID, gd)
	case "mender":
		inv.EquipWeapon(slot, "wooden_staff", classID, gd)
		inv.EquipArmor(slot, "cloth_robe", classID, gd)
	case "rogue":
		inv.EquipWeapon(slot, "rusty_dagger", classID, gd)
		inv.EquipArmor(slot, "leather_armor", classID, gd)
	case "wayfarer":
		inv.EquipWeapon(slot, "short_sword", classID, gd)
		inv.EquipArmor(slot, "leather_armor", classID, gd)
	case "brawler":
		// No equipment
	}
}

func makeCombatants(party []*character.Character, inv *inventory.Inventory, gd *gamedata.GameData) []*combat.Combatant {
	var combatants []*combat.Combatant
	for i, c := range party {
		combatants = append(combatants, combat.NewPlayer(i, c, inv, gd))
	}
	return combatants
}

func runCombat(partyCombatants, enemies []*combat.Combatant, party []*character.Character, spellBooks map[string]*magic.SpellBook, inv *inventory.Inventory, gd *gamedata.GameData, rng *rand.Rand) bool {
	stats := &gd.Stats.Combat

	// Show enemies
	fmt.Print("  Enemies: ")
	for i, e := range enemies {
		if i > 0 {
			fmt.Print(", ")
		}
		fmt.Printf("%s (HP:%d)", e.Name, e.MaxHP)
	}
	fmt.Println()

	for round := 1; round <= 30; round++ {
		fmt.Printf("\n  --- Round %d ---\n", round)

		// Show party status
		for _, c := range partyCombatants {
			if c.CurrentHP > 0 {
				fmt.Printf("  [%s HP:%d/%d]", c.Name, c.CurrentHP, c.MaxHP)
			}
		}
		fmt.Println()

		// Player chooses actions
		var actions []combat.Action
		for _, pc := range partyCombatants {
			if pc.CurrentHP <= 0 {
				continue
			}

			// Find first living enemy
			var targetEnemy *combat.Combatant
			for _, e := range enemies {
				if e.CurrentHP > 0 {
					targetEnemy = e
					break
				}
			}
			if targetEnemy == nil {
				break
			}

			// Check if this character has spells
			sb := spellBooks[pc.Name]
			hasSpells := sb != nil && len(sb.KnownSpells) > 0

			fmt.Printf("  %s's turn. ", pc.Name)
			if hasSpells {
				fmt.Print("[a]ttack [s]pell [i]tem [f]lee: ")
			} else {
				fmt.Print("[a]ttack [i]tem [f]lee: ")
			}

			choice := strings.ToLower(strings.TrimSpace(readLine()))

			switch choice {
			case "s", "spell":
				if sb == nil {
					fmt.Println("  No spells available. Attacking instead.")
					actions = append(actions, combat.Action{ActorID: pc.ID, Kind: combat.ActionAttack, TargetID: targetEnemy.ID})
					continue
				}
				var caster *character.Character
				for _, p := range party {
					if p.Name == pc.Name {
						caster = p
						break
					}
				}
				// List available spells (MP-affordable only).
				fmt.Println("  Available spells:")
				var castable []gamedata.Spell
				for _, spellIDs := range sb.KnownSpells {
					for _, sid := range spellIDs {
						sp := gd.SpellByID(sid)
						if sp != nil && magic.CanCast(caster, sp) {
							castable = append(castable, *sp)
							fmt.Printf("    %d. %s (L%d, %d MP) - %s\n", len(castable), sp.Name, sp.SpellLevel, sp.MPCost, sp.Description)
						}
					}
				}
				if len(castable) == 0 {
					fmt.Println("  Not enough MP. Attacking instead.")
					actions = append(actions, combat.Action{ActorID: pc.ID, Kind: combat.ActionAttack, TargetID: targetEnemy.ID})
					continue
				}

				spellChoice := prompt("  Cast which spell? (number): ")
				idx, err := strconv.Atoi(strings.TrimSpace(spellChoice))
				if err != nil || idx < 1 || idx > len(castable) {
					fmt.Println("  Invalid. Attacking instead.")
					actions = append(actions, combat.Action{ActorID: pc.ID, Kind: combat.ActionAttack, TargetID: targetEnemy.ID})
					continue
				}

				spell := castable[idx-1]
				_ = magic.ConsumeMP(caster, &spell)

				// Resolve spell
				switch spell.Effect {
				case "damage":
					target := &magic.SpellTarget{
						Weaknesses:  []string{},
						Resistances: []string{},
					}
					// Check monster weaknesses
					for _, m := range gd.Monsters {
						if m.Name == targetEnemy.Name {
							target.Weaknesses = m.Weaknesses
							target.Resistances = m.Resistances
							break
						}
					}

					if spell.Target == "all_enemies" {
						totalDmg := 0
						for _, e := range enemies {
							if e.CurrentHP <= 0 {
								continue
							}
							dmg := magic.ResolveSpellDamage(&spell, target, rng)
							e.CurrentHP -= dmg
							totalDmg += dmg
							if e.CurrentHP <= 0 {
								e.CurrentHP = 0
								fmt.Printf("  %s casts %s on %s for %d damage - DEFEATED!\n", pc.Name, spell.Name, e.Name, dmg)
							} else {
								fmt.Printf("  %s casts %s on %s for %d damage (HP:%d)\n", pc.Name, spell.Name, e.Name, dmg, e.CurrentHP)
							}
						}
					} else {
						dmg := magic.ResolveSpellDamage(&spell, target, rng)
						targetEnemy.CurrentHP -= dmg
						if targetEnemy.CurrentHP <= 0 {
							targetEnemy.CurrentHP = 0
							fmt.Printf("  %s casts %s on %s for %d damage - DEFEATED!\n", pc.Name, spell.Name, targetEnemy.Name, dmg)
						} else {
							fmt.Printf("  %s casts %s on %s for %d damage (HP:%d)\n", pc.Name, spell.Name, targetEnemy.Name, dmg, targetEnemy.CurrentHP)
						}
					}

				case "status":
					landed := magic.ResolveStatusSpell(&spell, targetEnemy.VIT, rng)
					if landed {
						targetEnemy.Status = character.Status(spell.StatusEffect)
						fmt.Printf("  %s casts %s - %s falls asleep!\n", pc.Name, spell.Name, targetEnemy.Name)
					} else {
						fmt.Printf("  %s casts %s - but it missed!\n", pc.Name, spell.Name)
					}

				case "heal":
					healAmt := magic.ResolveHealSpell(&spell, rng)
					// Find most damaged party member
					var healTarget *combat.Combatant
					lowestPct := 101
					for _, p := range partyCombatants {
						if p.CurrentHP <= 0 {
							continue
						}
						pct := p.CurrentHP * 100 / p.MaxHP
						if pct < lowestPct {
							lowestPct = pct
							healTarget = p
						}
					}
					if healTarget != nil {
						healTarget.CurrentHP += healAmt
						if healTarget.CurrentHP > healTarget.MaxHP {
							healTarget.CurrentHP = healTarget.MaxHP
						}
						fmt.Printf("  %s casts %s on %s - healed %d HP (HP:%d/%d)\n",
							pc.Name, spell.Name, healTarget.Name, healAmt, healTarget.CurrentHP, healTarget.MaxHP)
					}
				}

				// Don't add to combat actions since we resolved manually
				continue

			case "i", "item":
				if inv.Consumables["potion"] > 0 {
					inv.Consumables["potion"]--
					// Heal self
					healAmt := 30
					pc.CurrentHP += healAmt
					if pc.CurrentHP > pc.MaxHP {
						pc.CurrentHP = pc.MaxHP
					}
					fmt.Printf("  %s uses Potion - healed %d HP (HP:%d/%d) [%d potions left]\n",
						pc.Name, healAmt, pc.CurrentHP, pc.MaxHP, inv.Consumables["potion"])
				} else {
					fmt.Println("  No potions! Attacking instead.")
					actions = append(actions, combat.Action{ActorID: pc.ID, Kind: combat.ActionAttack, TargetID: targetEnemy.ID})
				}
				continue

			case "f", "flee":
				if rng.IntN(100) < 40 {
					fmt.Println("  Got away safely!")
					// Sync HP back
					for i, pc := range partyCombatants {
						party[i].CurrentHP = pc.CurrentHP
					}
					return true
				}
				fmt.Println("  Couldn't escape!")
				continue

			default:
				// Default to attack
				actions = append(actions, combat.Action{ActorID: pc.ID, Kind: combat.ActionAttack, TargetID: targetEnemy.ID})
			}
		}

		// Enemy actions
		for _, e := range enemies {
			if e.CurrentHP <= 0 || e.Status == character.StatusSleep {
				if e.Status == character.StatusSleep {
					fmt.Printf("  %s is asleep.\n", e.Name)
				}
				continue
			}
			target := combat.SelectEnemyTarget(partyCombatants, rng)
			if target != nil {
				actions = append(actions, combat.Action{ActorID: e.ID, Kind: combat.ActionAttack, TargetID: target.ID})
			}
		}

		// Resolve
		results := combat.ResolveTurn(partyCombatants, enemies, actions, stats, rng)
		for _, r := range results {
			if r.Kind == combat.ActionAttack {
				if r.TotalDmg > 0 {
					status := ""
					if r.Killed {
						status = " - DEFEATED!"
					}
					// Find target name
					targetName := ""
					for _, c := range partyCombatants {
						if c.ID == r.TargetID {
							targetName = c.Name
						}
					}
					for _, e := range enemies {
						if e.ID == r.TargetID {
							targetName = e.Name
						}
					}
					hitCount := 0
					for _, h := range r.Hits {
						if !h.Missed {
							hitCount++
						}
					}
					critStr := ""
					for _, h := range r.Hits {
						if h.Crit {
							critStr = " CRIT!"
							break
						}
					}
					fmt.Printf("  %s attacks %s: %d damage (%d hits)%s%s\n",
						r.ActorName, targetName, r.TotalDmg, hitCount, critStr, status)
				}
			}
		}

		// Check victory/defeat
		if combat.CheckVictory(enemies) {
			// Sync HP back to characters
			for i, pc := range partyCombatants {
				party[i].CurrentHP = pc.CurrentHP
				party[i].Status = pc.Status
			}
			return true
		}
		if combat.CheckDefeat(partyCombatants) {
			for i, pc := range partyCombatants {
				party[i].CurrentHP = pc.CurrentHP
				party[i].Status = pc.Status
			}
			return false
		}
	}

	return false
}

func prompt(msg string) string {
	fmt.Print(msg)
	return readLine()
}

func readLine() string {
	line, _ := reader.ReadString('\n')
	return strings.TrimSpace(line)
}
