package api

import (
	"fmt"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

// Request/response types

type WizardRequest struct {
	TownName    string              `json:"town_name"`
	People      []WizardPersonReq   `json:"people"`
	Places      []string            `json:"places"`
	BigBuilding string              `json:"big_building"`
}

type WizardPersonReq struct {
	Name     string `json:"name"`
	Relation string `json:"relation"`
}

type NewGameRequest struct {
	TownName    string            `json:"town_name"`
	People      []WizardPersonReq `json:"people"`
	Places      []string          `json:"places"`
	BigBuilding string            `json:"big_building"`
	Party       []PartyMemberReq  `json:"party"`
	Difficulty  string            `json:"difficulty"`
}

type PartyMemberReq struct {
	Name    string `json:"name"`
	ClassID string `json:"class_id"`
}

type GameActionRequest struct {
	Type     string `json:"type"`     // attack, spell, item, flee, advance, travel
	TargetID int    `json:"target_id,omitempty"`
	SpellID  string `json:"spell_id,omitempty"`
	ItemID   string `json:"item_id,omitempty"`
	SlotIdx  int    `json:"slot_idx,omitempty"` // which party member is acting
}

// GameState is the full state sent to the client.
type GameState struct {
	ID        string              `json:"id"`
	Phase     string              `json:"phase"` // world, combat, quest_complete, victory, defeat
	Party     []PartyMemberState  `json:"party"`
	Enemies   []EnemyState        `json:"enemies,omitempty"`
	Quests    []QuestState        `json:"quests"`
	CurrentQ  int                 `json:"current_quest"`
	Gold      int                 `json:"gold"`
	Potions   int                 `json:"potions"`
	Location  string              `json:"location"`
	Message   string              `json:"message,omitempty"`
	CombatLog []string              `json:"combat_log,omitempty"`
	TileMap   *locality.TileMap    `json:"tilemap,omitempty"`
}

type PartyMemberState struct {
	Name      string `json:"name"`
	ClassID   string `json:"class_id"`
	ClassName string `json:"class_name"`
	Level     int    `json:"level"`
	HP        int    `json:"hp"`
	MaxHP     int    `json:"max_hp"`
	STR       int    `json:"str"`
	AGI       int    `json:"agi"`
	INT       int    `json:"int_stat"`
	XP        int    `json:"xp"`
	XPNext    int    `json:"xp_next"`
	Status    string `json:"status"`
	Spells    []SpellState `json:"spells,omitempty"`
}

type SpellState struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Charges int    `json:"charges"`
}

type EnemyState struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	HP   int    `json:"hp"`
	MaxHP int   `json:"max_hp"`
}

type QuestState struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Act         int    `json:"act"`
	Completed   bool   `json:"completed"`
}

// Game holds the live state of one game session.
type Game struct {
	id         string
	gd         *gamedata.GameData
	rng        *rand.Rand
	loc        *locality.Locality
	walk       *locality.WalkResult
	tileMap    *locality.TileMap
	party      []*character.Character
	spellBooks map[string]*magic.SpellBook
	inv        *inventory.Inventory
	quests     []generator.Quest
	currentQ   int
	phase      string // world, combat, quest_complete, victory, defeat
	enemies    []*combat.Combatant
	combatLog  []string
	message    string
	diff       balance.Difficulty
	mu         sync.Mutex
}

func (g *Game) State() GameState {
	g.mu.Lock()
	defer g.mu.Unlock()

	state := GameState{
		ID:        g.id,
		Phase:     g.phase,
		CurrentQ:  g.currentQ,
		Gold:      g.inv.Gold,
		Potions:   g.inv.Consumables["potion"],
		Message:   g.message,
		CombatLog: g.combatLog,
	}

	if g.loc != nil {
		state.Location = g.loc.Name
		state.TileMap = g.tileMap
	}

	for _, c := range g.party {
		cls := g.gd.ClassByID(c.ClassID)
		pm := PartyMemberState{
			Name:      c.Name,
			ClassID:   c.ClassID,
			ClassName: cls.Name,
			Level:     c.Level,
			HP:        c.CurrentHP,
			MaxHP:     c.MaxHP,
			STR:       c.STR,
			AGI:       c.AGI,
			INT:       c.INT,
			XP:        c.XP,
			XPNext:    character.XPToNextLevel(c.Level, &g.gd.Stats.XPCurve),
			Status:    string(c.Status),
		}

		if sb, ok := g.spellBooks[c.Name]; ok {
			for lvl, spellIDs := range sb.KnownSpells {
				for _, sid := range spellIDs {
					sp := g.gd.SpellByID(sid)
					if sp != nil {
						pm.Spells = append(pm.Spells, SpellState{
							ID:      sid,
							Name:    sp.Name,
							Charges: sb.Charges[lvl],
						})
					}
				}
			}
		}

		state.Party = append(state.Party, pm)
	}

	for _, e := range g.enemies {
		if e.CurrentHP > 0 {
			state.Enemies = append(state.Enemies, EnemyState{
				ID: e.ID, Name: e.Name, HP: e.CurrentHP, MaxHP: e.MaxHP,
			})
		}
	}

	for _, q := range g.quests {
		state.Quests = append(state.Quests, QuestState{
			Name: q.Name, Description: q.Description, Act: q.Act, Completed: q.Completed,
		})
	}

	return state
}

func (g *Game) ProcessAction(req GameActionRequest) (*GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.combatLog = nil
	g.message = ""

	switch g.phase {
	case "world":
		return g.processWorldAction(req)
	case "combat":
		return g.processCombatAction(req)
	case "quest_complete":
		return g.processAdvance(req)
	default:
		state := g.stateUnlocked()
		return &state, nil
	}
}

func (g *Game) processWorldAction(req GameActionRequest) (*GameState, error) {
	if g.currentQ >= len(g.quests) {
		g.phase = "victory"
		g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
		state := g.stateUnlocked()
		return &state, nil
	}

	// Travel to next quest, chance of encounter
	q := &g.quests[g.currentQ]
	g.message = fmt.Sprintf("Traveling toward: %s", q.Name)

	if g.rng.IntN(100) < 50 {
		// Random encounter
		partyLevels := make([]int, len(g.party))
		for i, c := range g.party {
			partyLevels[i] = c.Level
		}
		encLvl := balance.EncounterLevel(partyLevels, "normal", 0, g.currentQ)
		g.enemies = balance.GenerateEncounter(g.gd.Monsters, encLvl, g.diff, g.rng)
		g.phase = "combat"
		g.combatLog = append(g.combatLog, "Enemies appear!")
		for _, e := range g.enemies {
			g.combatLog = append(g.combatLog, fmt.Sprintf("  %s (HP: %d)", e.Name, e.MaxHP))
		}
	} else {
		// No encounter, advance quest
		q.Completed = true
		g.message = fmt.Sprintf("Quest complete: %s\n%s\n+%d XP, +%d gold",
			q.Name, q.Completion, q.Reward.XP, q.Reward.Gold)
		g.inv.Gold += q.Reward.Gold
		for _, c := range g.party {
			if c.IsAlive() {
				c.XP += q.Reward.XP
			}
		}
		g.checkLevelUps()
		g.restParty()
		g.currentQ++
		if g.currentQ >= len(g.quests) {
			g.phase = "victory"
			g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
		} else {
			g.phase = "quest_complete"
		}
	}

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) processCombatAction(req GameActionRequest) (*GameState, error) {
	stats := &g.gd.Stats.Combat

	// Handle spell/item for the acting slot
	if req.Type == "spell" && req.SpellID != "" {
		return g.processCombatSpell(req)
	}
	if req.Type == "item" {
		return g.processCombatItem(req)
	}
	if req.Type == "flee" {
		if g.rng.IntN(100) < 40 {
			g.phase = "world"
			g.message = "Got away safely!"
			g.enemies = nil
			state := g.stateUnlocked()
			return &state, nil
		}
		g.combatLog = append(g.combatLog, "Couldn't escape!")
	}

	// Build combatants from current party state
	combatants := g.makeCombatants()

	// Player attacks
	var actions []combat.Action
	for _, pc := range combatants {
		if pc.CurrentHP <= 0 {
			continue
		}
		var target *combat.Combatant
		for _, e := range g.enemies {
			if e.CurrentHP > 0 {
				target = e
				break
			}
		}
		if target != nil {
			actions = append(actions, combat.Action{ActorID: pc.ID, Kind: combat.ActionAttack, TargetID: target.ID})
		}
	}

	// Enemy attacks
	for _, e := range g.enemies {
		if e.CurrentHP <= 0 || e.Status == character.StatusSleep {
			continue
		}
		target := combat.SelectEnemyTarget(combatants, g.rng)
		if target != nil {
			actions = append(actions, combat.Action{ActorID: e.ID, Kind: combat.ActionAttack, TargetID: target.ID})
		}
	}

	results := combat.ResolveTurn(combatants, g.enemies, actions, stats, g.rng)
	for _, r := range results {
		if r.TotalDmg > 0 {
			targetName := g.findCombatantName(combatants, r.TargetID)
			status := ""
			if r.Killed {
				status = " - DEFEATED!"
			}
			g.combatLog = append(g.combatLog, fmt.Sprintf("%s attacks %s for %d damage%s",
				r.ActorName, targetName, r.TotalDmg, status))
		}
	}

	// Sync HP back
	for i, pc := range combatants {
		g.party[i].CurrentHP = pc.CurrentHP
		g.party[i].Status = pc.Status
	}

	if combat.CheckVictory(g.enemies) {
		totalXP, totalGold := 0, 0
		for _, e := range g.enemies {
			for _, m := range g.gd.Monsters {
				if m.Name == e.Name {
					totalXP += m.XPReward
					totalGold += m.GoldReward
					break
				}
			}
		}
		g.inv.Gold += totalGold
		living := 0
		for _, c := range g.party {
			if c.IsAlive() {
				living++
			}
		}
		if living > 0 {
			each := totalXP / living
			for _, c := range g.party {
				if c.IsAlive() {
					c.XP += each
				}
			}
		}
		g.combatLog = append(g.combatLog, fmt.Sprintf("Victory! +%d XP, +%d gold", totalXP, totalGold))
		g.checkLevelUps()
		g.enemies = nil

		// Complete current quest
		if g.currentQ < len(g.quests) {
			q := &g.quests[g.currentQ]
			q.Completed = true
			g.inv.Gold += q.Reward.Gold
			for _, c := range g.party {
				if c.IsAlive() {
					c.XP += q.Reward.XP
				}
			}
			g.combatLog = append(g.combatLog, fmt.Sprintf("Quest complete: %s (+%d XP, +%d gold)", q.Name, q.Reward.XP, q.Reward.Gold))
			g.restParty()
			g.currentQ++
		}

		if g.currentQ >= len(g.quests) {
			g.phase = "victory"
			g.message = fmt.Sprintf("%s is saved!", g.loc.Name)
		} else {
			g.phase = "quest_complete"
		}
	} else if combat.CheckDefeat(combatants) {
		g.phase = "defeat"
		g.message = "Your party has fallen. Game over."
	}

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) processCombatSpell(req GameActionRequest) (*GameState, error) {
	spell := g.gd.SpellByID(req.SpellID)
	if spell == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("spell not found")
	}

	// Find caster
	var caster *character.Character
	for _, c := range g.party {
		if sb, ok := g.spellBooks[c.Name]; ok && sb.CanCast(spell) {
			caster = c
			sb.ConsumeCharge(spell.SpellLevel)
			break
		}
	}
	if caster == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("no caster available")
	}

	switch spell.Effect {
	case "damage":
		target := &magic.SpellTarget{}
		for _, e := range g.enemies {
			if e.CurrentHP > 0 {
				for _, m := range g.gd.Monsters {
					if m.Name == e.Name {
						target.Weaknesses = m.Weaknesses
						target.Resistances = m.Resistances
					}
				}
				dmg := magic.ResolveSpellDamage(spell, target, g.rng)
				e.CurrentHP -= dmg
				if e.CurrentHP <= 0 {
					e.CurrentHP = 0
					g.combatLog = append(g.combatLog, fmt.Sprintf("%s casts %s on %s for %d - DEFEATED!", caster.Name, spell.Name, e.Name, dmg))
				} else {
					g.combatLog = append(g.combatLog, fmt.Sprintf("%s casts %s on %s for %d (HP:%d)", caster.Name, spell.Name, e.Name, dmg, e.CurrentHP))
				}
				if spell.Target == "single_enemy" {
					break
				}
			}
		}
	case "heal":
		amt := magic.ResolveHealSpell(spell, g.rng)
		// Heal most damaged
		var target *character.Character
		for _, c := range g.party {
			if c.IsAlive() && (target == nil || c.CurrentHP < target.CurrentHP) {
				target = c
			}
		}
		if target != nil {
			target.Heal(amt)
			g.combatLog = append(g.combatLog, fmt.Sprintf("%s casts %s on %s for %d HP", caster.Name, spell.Name, target.Name, amt))
		}
	}

	// Enemy turn after spell
	combatants := g.makeCombatants()
	var enemyActions []combat.Action
	for _, e := range g.enemies {
		if e.CurrentHP <= 0 {
			continue
		}
		target := combat.SelectEnemyTarget(combatants, g.rng)
		if target != nil {
			enemyActions = append(enemyActions, combat.Action{ActorID: e.ID, Kind: combat.ActionAttack, TargetID: target.ID})
		}
	}
	if len(enemyActions) > 0 {
		results := combat.ResolveTurn(combatants, g.enemies, enemyActions, &g.gd.Stats.Combat, g.rng)
		for _, r := range results {
			if r.TotalDmg > 0 {
				name := g.findCombatantName(combatants, r.TargetID)
				status := ""
				if r.Killed {
					status = " - DEFEATED!"
				}
				g.combatLog = append(g.combatLog, fmt.Sprintf("%s attacks %s for %d%s", r.ActorName, name, r.TotalDmg, status))
			}
		}
		for i, pc := range combatants {
			g.party[i].CurrentHP = pc.CurrentHP
			g.party[i].Status = pc.Status
		}
	}

	if combat.CheckVictory(g.enemies) {
		g.combatLog = append(g.combatLog, "Victory!")
		g.enemies = nil
		if g.currentQ < len(g.quests) {
			g.quests[g.currentQ].Completed = true
			g.currentQ++
		}
		g.restParty()
		g.checkLevelUps()
		if g.currentQ >= len(g.quests) {
			g.phase = "victory"
		} else {
			g.phase = "quest_complete"
		}
	} else if combat.CheckDefeat(combatants) {
		g.phase = "defeat"
		g.message = "Your party has fallen."
	}

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) processCombatItem(req GameActionRequest) (*GameState, error) {
	if g.inv.Consumables["potion"] <= 0 {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("no potions")
	}
	g.inv.Consumables["potion"]--

	// Heal most damaged party member
	var target *character.Character
	for _, c := range g.party {
		if c.IsAlive() && (target == nil || c.CurrentHP < target.CurrentHP) {
			target = c
		}
	}
	if target != nil {
		target.Heal(30)
		g.combatLog = append(g.combatLog, fmt.Sprintf("%s uses Potion - healed 30 HP (HP:%d/%d)", target.Name, target.CurrentHP, target.MaxHP))
	}

	// Enemy turn
	combatants := g.makeCombatants()
	var enemyActions []combat.Action
	for _, e := range g.enemies {
		if e.CurrentHP <= 0 {
			continue
		}
		t := combat.SelectEnemyTarget(combatants, g.rng)
		if t != nil {
			enemyActions = append(enemyActions, combat.Action{ActorID: e.ID, Kind: combat.ActionAttack, TargetID: t.ID})
		}
	}
	if len(enemyActions) > 0 {
		results := combat.ResolveTurn(combatants, g.enemies, enemyActions, &g.gd.Stats.Combat, g.rng)
		for _, r := range results {
			if r.TotalDmg > 0 {
				name := g.findCombatantName(combatants, r.TargetID)
				g.combatLog = append(g.combatLog, fmt.Sprintf("%s attacks %s for %d", r.ActorName, name, r.TotalDmg))
			}
		}
		for i, pc := range combatants {
			g.party[i].CurrentHP = pc.CurrentHP
			g.party[i].Status = pc.Status
		}
	}

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) processAdvance(req GameActionRequest) (*GameState, error) {
	g.phase = "world"
	g.message = ""
	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) makeCombatants() []*combat.Combatant {
	var result []*combat.Combatant
	for i, c := range g.party {
		cls := g.gd.ClassByID(c.ClassID)
		bareHand := 0
		if cls.BareHand != nil {
			bareHand = cls.BareHand.BaseDamage + c.Level*c.STR/2
		}
		result = append(result, &combat.Combatant{
			ID: i, Name: c.Name, IsPlayer: true,
			STR: c.STR, AGI: c.AGI, INT: c.INT, VIT: c.VIT, LCK: c.LCK,
			HitPct: c.HitPct, MaxHP: c.MaxHP, CurrentHP: c.CurrentHP,
			Status:         c.Status,
			WeaponPower:    g.inv.WeaponPower(i, g.gd),
			ArmorAbsorb:    g.inv.TotalAbsorb(i, g.gd),
			BareHandDamage: bareHand,
		})
	}
	return result
}

func (g *Game) findCombatantName(party []*combat.Combatant, id int) string {
	for _, c := range party {
		if c.ID == id {
			return c.Name
		}
	}
	for _, e := range g.enemies {
		if e.ID == id {
			return e.Name
		}
	}
	return "?"
}

func (g *Game) checkLevelUps() {
	for _, c := range g.party {
		for character.CanLevelUp(c, &g.gd.Stats.XPCurve) {
			cls := g.gd.ClassByID(c.ClassID)
			old := c.Level
			character.LevelUp(c, cls, &g.gd.Stats, g.rng)
			g.combatLog = append(g.combatLog, fmt.Sprintf("%s leveled up! %d -> %d (HP: %d)", c.Name, old, c.Level, c.MaxHP))
		}
	}
}

func (g *Game) restParty() {
	for _, c := range g.party {
		c.CurrentHP = c.MaxHP
		c.Status = character.StatusNone
	}
	for _, sb := range g.spellBooks {
		sb.RestoreAllCharges()
	}
}

func (g *Game) stateUnlocked() GameState {
	// Must be called with lock held; calls State() logic inline
	state := GameState{
		ID: g.id, Phase: g.phase, CurrentQ: g.currentQ,
		Gold: g.inv.Gold, Potions: g.inv.Consumables["potion"],
		Message: g.message, CombatLog: g.combatLog,
	}
	if g.loc != nil {
		state.Location = g.loc.Name
	}
	for _, c := range g.party {
		cls := g.gd.ClassByID(c.ClassID)
		pm := PartyMemberState{
			Name: c.Name, ClassID: c.ClassID, ClassName: cls.Name,
			Level: c.Level, HP: c.CurrentHP, MaxHP: c.MaxHP,
			STR: c.STR, AGI: c.AGI, INT: c.INT, XP: c.XP,
			XPNext: character.XPToNextLevel(c.Level, &g.gd.Stats.XPCurve),
			Status: string(c.Status),
		}
		if sb, ok := g.spellBooks[c.Name]; ok {
			for lvl, ids := range sb.KnownSpells {
				for _, sid := range ids {
					sp := g.gd.SpellByID(sid)
					if sp != nil {
						pm.Spells = append(pm.Spells, SpellState{ID: sid, Name: sp.Name, Charges: sb.Charges[lvl]})
					}
				}
			}
		}
		state.Party = append(state.Party, pm)
	}
	for _, e := range g.enemies {
		if e.CurrentHP > 0 {
			state.Enemies = append(state.Enemies, EnemyState{ID: e.ID, Name: e.Name, HP: e.CurrentHP, MaxHP: e.MaxHP})
		}
	}
	for _, q := range g.quests {
		state.Quests = append(state.Quests, QuestState{Name: q.Name, Description: q.Description, Act: q.Act, Completed: q.Completed})
	}
	return state
}

// GameManager holds active game sessions.
type GameManager struct {
	gd    *gamedata.GameData
	games map[string]*Game
	mu    sync.RWMutex
}

func NewGameManager(gd *gamedata.GameData) *GameManager {
	return &GameManager{gd: gd, games: make(map[string]*Game)}
}

func (gm *GameManager) CreateGame(req NewGameRequest) (*Game, error) {
	if len(req.Party) == 0 || len(req.Party) > 4 {
		return nil, fmt.Errorf("party must have 1-4 members")
	}

	rng := rand.New(rand.NewPCG(uint64(time.Now().UnixNano()), 0))

	// Build locality
	var wizPeople []locality.WizardPerson
	for _, p := range req.People {
		wizPeople = append(wizPeople, locality.WizardPerson{Name: p.Name, Relation: p.Relation})
	}
	loc := locality.BuildFromWizard(locality.WizardInput{
		TownName:    req.TownName,
		People:      wizPeople,
		Places:      req.Places,
		BigBuilding: req.BigBuilding,
		Flavor:      "conquest",
		Difficulty:  req.Difficulty,
	})

	// Create party
	var party []*character.Character
	spellBooks := make(map[string]*magic.SpellBook)
	inv := inventory.New()
	inv.Gold = 100
	inv.Consumables["potion"] = 5

	for i, pm := range req.Party {
		cls := gm.gd.ClassByID(pm.ClassID)
		if cls == nil {
			return nil, fmt.Errorf("unknown class: %s", pm.ClassID)
		}
		c := character.New(pm.Name, pm.ClassID, cls)
		party = append(party, c)

		// Equip starting gear
		switch pm.ClassID {
		case "warrior":
			inv.EquipWeapon(i, "short_sword", pm.ClassID, gm.gd)
			inv.EquipArmor(i, "leather_armor", pm.ClassID, gm.gd)
		case "cinder":
			inv.EquipWeapon(i, "wooden_staff", pm.ClassID, gm.gd)
			inv.EquipArmor(i, "cloth_robe", pm.ClassID, gm.gd)
		case "mender":
			inv.EquipWeapon(i, "wooden_club", pm.ClassID, gm.gd)
			inv.EquipArmor(i, "cloth_robe", pm.ClassID, gm.gd)
		case "rogue":
			inv.EquipWeapon(i, "rusty_dagger", pm.ClassID, gm.gd)
			inv.EquipArmor(i, "leather_armor", pm.ClassID, gm.gd)
		case "wayfarer":
			inv.EquipWeapon(i, "short_sword", pm.ClassID, gm.gd)
			inv.EquipArmor(i, "leather_armor", pm.ClassID, gm.gd)
		}

		// Spell books for casters
		if len(cls.Magic.Schools) > 0 {
			sb := magic.NewSpellBook()
			sb.UpdateCharges(c.Level, cls, &gm.gd.Spells, false)
			sb.RestoreAllCharges()
			for _, spell := range gm.gd.Spells.Spells {
				for _, school := range cls.Magic.Schools {
					if spell.School == school && spell.SpellLevel == 1 {
						sb.LearnSpell(spell.ID, spell.SpellLevel, gm.gd.Spells.ChargeTable.MaxSpellsPerLvl)
					}
				}
			}
			spellBooks[c.Name] = sb
		}
	}

	// Generate campaign
	quests := generator.GenerateCampaign(loc, loc.Nodes[0].ID, rng)
	walk := locality.Walk(loc, loc.Nodes[0].ID)
	tileMap := locality.GenerateTileMap(loc, loc.Nodes[0].ID)

	game := &Game{
		id:         fmt.Sprintf("game_%d", time.Now().UnixNano()),
		gd:         gm.gd,
		rng:        rng,
		loc:        loc,
		walk:       walk,
		tileMap:    tileMap,
		party:      party,
		spellBooks: spellBooks,
		inv:        inv,
		quests:     quests,
		currentQ:   0,
		phase:      "world",
		diff:       balance.GetDifficulty(req.Difficulty),
	}

	gm.mu.Lock()
	gm.games[game.id] = game
	gm.mu.Unlock()

	return game, nil
}

func (gm *GameManager) GetGame(id string) *Game {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	return gm.games[id]
}

func buildLocality(req WizardRequest) *locality.Locality {
	var people []locality.WizardPerson
	for _, p := range req.People {
		people = append(people, locality.WizardPerson{Name: p.Name, Relation: p.Relation})
	}
	return locality.BuildFromWizard(locality.WizardInput{
		TownName:    req.TownName,
		People:      people,
		Places:      req.Places,
		BigBuilding: req.BigBuilding,
		Flavor:      "conquest",
		Difficulty:  "normal",
	})
}
