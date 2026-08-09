package gamedata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/transport"
)

// TransportData holds transportation tier definitions from transport.json.
type TransportData struct {
	Tiers         []transport.Tier     `json:"tiers"`
	ConquestSkins map[string]SkinEntry `json:"conquest_skins"`
}

// SkinEntry is a flavor-specific sprite mapping for a transport tier.
type SkinEntry struct {
	Name   string `json:"name"`
	Sprite string `json:"sprite"`
}

// DialogueLine is a single NPC dialogue line with mood metadata.
type DialogueLine struct {
	Text string `json:"text"`
	Mood string `json:"mood"` // friendly, neutral, mysterious
}

// DialogueArchetype holds the line pool for one NPC archetype.
type DialogueArchetype struct {
	Lines []DialogueLine `json:"lines"`
}

// DialoguePool holds all archetype dialogue pools loaded from dialogue.json.
type DialoguePool struct {
	Archetypes map[string]DialogueArchetype `json:"archetypes"`
}

// GameData holds all loaded game data from shared/.
type GameData struct {
	Classes          []Class
	Stats            StatsConfig
	Items            ItemsData
	Abilities        []Ability
	Chests           ChestCatalog
	Spells           SpellsData
	Monsters         []Monster
	Formations       []Formation
	Transport        TransportData
	Palettes         Palettes
	Dialogue         DialoguePool
	Showcase         ShowcaseData
	BattleCharacters BattleCharactersData

	classByID           map[string]*Class
	weaponByID          map[string]*Weapon
	abilityByID         map[string]*Ability
	armorByID           map[string]*Armor
	shieldByID          map[string]*Shield
	spellByID           map[string]*Spell
	monsterByID         map[string]*Monster
	formationByID       map[string]*Formation
	keyItemByID         map[string]*KeyItem
	chestByID           map[string]*ChestDefinition
	battleCharacterByID map[string]*BattleCharacterProfile
}

// Load reads and validates all game data from the shared directory.
// It panics with a clear message if any file is missing or malformed,
// per standing order: "A malformed classes.json should crash the server
// with a clear error, not produce a broken game."
func Load(sharedDir string) *GameData {
	gd := &GameData{}

	gd.Classes = loadJSON[[]Class](sharedDir, "classes.json")
	gd.Stats = loadJSON[StatsConfig](sharedDir, "stats.json")
	gd.Items = loadJSON[ItemsData](sharedDir, "items.json")
	gd.Abilities = loadJSON[[]Ability](sharedDir, "abilities.json")
	gd.Chests = loadJSON[ChestCatalog](sharedDir, "chests.json")
	gd.Spells = loadJSON[SpellsData](sharedDir, "spells.json")
	gd.Monsters = loadJSON[[]Monster](sharedDir, "monsters.json")
	gd.Formations = loadJSON[[]Formation](sharedDir, "formations.json")
	gd.Transport = loadJSON[TransportData](sharedDir, "transport.json")
	gd.Palettes = loadJSON[Palettes](sharedDir, "palettes.json")
	gd.Dialogue = loadJSON[DialoguePool](sharedDir, "dialogue.json")
	gd.Showcase = loadJSON[ShowcaseData](sharedDir, "showcase.json")
	gd.BattleCharacters = loadJSON[BattleCharactersData](sharedDir, "battle_characters.json")

	gd.buildIndexes()
	gd.validate()

	return gd
}

func (gd *GameData) ClassByID(id string) *Class         { return gd.classByID[id] }
func (gd *GameData) WeaponByID(id string) *Weapon       { return gd.weaponByID[id] }
func (gd *GameData) AbilityByID(id string) *Ability     { return gd.abilityByID[id] }
func (gd *GameData) ArmorByID(id string) *Armor         { return gd.armorByID[id] }
func (gd *GameData) ShieldByID(id string) *Shield       { return gd.shieldByID[id] }
func (gd *GameData) SpellByID(id string) *Spell         { return gd.spellByID[id] }
func (gd *GameData) MonsterByID(id string) *Monster     { return gd.monsterByID[id] }
func (gd *GameData) FormationByID(id string) *Formation { return gd.formationByID[id] }
func (gd *GameData) KeyItemByID(id string) *KeyItem     { return gd.keyItemByID[id] }
func (gd *GameData) ChestByID(id string) *ChestDefinition {
	return gd.chestByID[id]
}
func (gd *GameData) BattleCharacterByID(id string) *BattleCharacterProfile {
	return gd.battleCharacterByID[id]
}

func (gd *GameData) buildIndexes() {
	gd.classByID = make(map[string]*Class, len(gd.Classes))
	for i := range gd.Classes {
		gd.classByID[gd.Classes[i].ID] = &gd.Classes[i]
	}

	gd.weaponByID = make(map[string]*Weapon, len(gd.Items.Weapons))
	for i := range gd.Items.Weapons {
		gd.weaponByID[gd.Items.Weapons[i].ID] = &gd.Items.Weapons[i]
	}

	gd.abilityByID = make(map[string]*Ability, len(gd.Abilities))
	for i := range gd.Abilities {
		gd.abilityByID[gd.Abilities[i].ID] = &gd.Abilities[i]
	}

	gd.armorByID = make(map[string]*Armor, len(gd.Items.Armor))
	for i := range gd.Items.Armor {
		gd.armorByID[gd.Items.Armor[i].ID] = &gd.Items.Armor[i]
	}

	gd.shieldByID = make(map[string]*Shield, len(gd.Items.Shields))
	for i := range gd.Items.Shields {
		gd.shieldByID[gd.Items.Shields[i].ID] = &gd.Items.Shields[i]
	}

	// Backfill MP cost for spells that omit it: cost = spell_level * 2 per GDD §8.1.
	// Explicit mp_cost in spells.json always wins.
	for i := range gd.Spells.Spells {
		if gd.Spells.Spells[i].MPCost == 0 {
			gd.Spells.Spells[i].MPCost = gd.Spells.Spells[i].SpellLevel * 2
		}
	}

	gd.spellByID = make(map[string]*Spell, len(gd.Spells.Spells))
	for i := range gd.Spells.Spells {
		gd.spellByID[gd.Spells.Spells[i].ID] = &gd.Spells.Spells[i]
	}

	gd.monsterByID = make(map[string]*Monster, len(gd.Monsters))
	for i := range gd.Monsters {
		gd.monsterByID[gd.Monsters[i].ID] = &gd.Monsters[i]
	}

	gd.formationByID = make(map[string]*Formation, len(gd.Formations))
	for i := range gd.Formations {
		gd.formationByID[gd.Formations[i].ID] = &gd.Formations[i]
	}

	gd.keyItemByID = make(map[string]*KeyItem, len(gd.Items.KeyItems))
	for i := range gd.Items.KeyItems {
		gd.keyItemByID[gd.Items.KeyItems[i].ID] = &gd.Items.KeyItems[i]
	}

	gd.chestByID = make(map[string]*ChestDefinition, len(gd.Chests))
	for id, chest := range gd.Chests {
		chestCopy := chest
		gd.chestByID[id] = &chestCopy
	}

	gd.battleCharacterByID = make(map[string]*BattleCharacterProfile, len(gd.BattleCharacters.Classes))
	for i := range gd.BattleCharacters.Classes {
		profile := &gd.BattleCharacters.Classes[i]
		gd.battleCharacterByID[profile.ID] = profile
	}
}

func (gd *GameData) validate() {
	if len(gd.Classes) == 0 {
		panic("gamedata: classes.json is empty")
	}

	classIDs := make(map[string]bool, len(gd.Classes))
	for _, c := range gd.Classes {
		if c.ID == "" {
			panic("gamedata: class with empty id")
		}
		if classIDs[c.ID] {
			panic(fmt.Sprintf("gamedata: duplicate class id %q", c.ID))
		}
		classIDs[c.ID] = true
		if c.Name == "" {
			panic(fmt.Sprintf("gamedata: class %q has empty name", c.ID))
		}
		if c.DefaultRow != "" && c.DefaultRow != "front" && c.DefaultRow != "back" {
			panic(fmt.Sprintf("gamedata: class %q has invalid default_row: %q", c.ID, c.DefaultRow))
		}
		if c.HPPerLevel <= 0 {
			panic(fmt.Sprintf("gamedata: class %q has invalid hp_per_level: %d", c.ID, c.HPPerLevel))
		}
		if c.StrongLevelRate < 0 || c.StrongLevelRate > 100 {
			panic(fmt.Sprintf("gamedata: class %q has invalid strong_level_rate_pct: %d", c.ID, c.StrongLevelRate))
		}
		validateGrowth(c.ID, "str", c.StatGrowthEights.STR)
		validateGrowth(c.ID, "agi", c.StatGrowthEights.AGI)
		validateGrowth(c.ID, "int", c.StatGrowthEights.INT)
		validateGrowth(c.ID, "vit", c.StatGrowthEights.VIT)
		validateGrowth(c.ID, "lck", c.StatGrowthEights.LCK)
	}

	if gd.Stats.XPCurve.MaxLevel <= 0 {
		panic("gamedata: stats.json xp_curve.max_level must be > 0")
	}
	prev := 0
	for lvl := 1; lvl <= gd.Stats.XPCurve.MaxLevel; lvl++ {
		v, ok := gd.Stats.XPCurve.RefTable[strconv.Itoa(lvl)]
		if !ok {
			panic(fmt.Sprintf("gamedata: stats.json xp_curve.reference_table missing level %d", lvl))
		}
		if v <= prev {
			panic(fmt.Sprintf("gamedata: stats.json xp_curve.reference_table not monotonic at level %d: %d <= %d", lvl, v, prev))
		}
		prev = v
	}
	if gd.Stats.Combat.BaseHitChance <= 0 {
		panic("gamedata: stats.json combat.base_hit_chance must be > 0")
	}
	if gd.Stats.Combat.MinDamagePerHit <= 0 {
		panic("gamedata: stats.json combat.min_damage_per_hit must be > 0")
	}

	for _, w := range gd.Items.Weapons {
		if w.ID == "" {
			panic("gamedata: weapon with empty id")
		}
		if w.Power < 0 {
			panic(fmt.Sprintf("gamedata: weapon %q has negative power", w.ID))
		}
		if (w.VisualID == "") != (w.AnimationSet == "") {
			panic(fmt.Sprintf("gamedata: weapon %q must define visual_id and animation_set together", w.ID))
		}
		validateClassRefs("weapon", w.ID, w.Classes, classIDs)
	}

	for _, a := range gd.Items.Armor {
		if a.ID == "" {
			panic("gamedata: armor with empty id")
		}
		validateClassRefs("armor", a.ID, a.Classes, classIDs)
	}

	for _, s := range gd.Items.Shields {
		if s.ID == "" {
			panic("gamedata: shield with empty id")
		}
		if (s.VisualID == "") != (s.AnimationSet == "") {
			panic(fmt.Sprintf("gamedata: shield %q must define visual_id and animation_set together", s.ID))
		}
		validateClassRefs("shield", s.ID, s.Classes, classIDs)
	}

	for _, h := range gd.Items.Helmets {
		if h.ID == "" {
			panic("gamedata: helmet with empty id")
		}
		validateClassRefs("helmet", h.ID, h.Classes, classIDs)
	}

	for _, a := range gd.Abilities {
		if a.ID == "" {
			panic("gamedata: ability with empty id")
		}
		if a.Name == "" {
			panic(fmt.Sprintf("gamedata: ability %q has empty name", a.ID))
		}
		validateCinematicTier("ability", a.ID, a.CinematicTier)
	}

	for _, s := range gd.Spells.Spells {
		if s.ID == "" {
			panic("gamedata: spell with empty id")
		}
		if s.SpellLevel < 1 || s.SpellLevel > 8 {
			panic(fmt.Sprintf("gamedata: spell %q has invalid spell_level: %d", s.ID, s.SpellLevel))
		}
		if s.Target == "" {
			panic(fmt.Sprintf("gamedata: spell %q has empty target", s.ID))
		}
		if len(s.TargetModes) > 0 {
			foundDefault := false
			for _, mode := range s.TargetModes {
				if mode == "" {
					panic(fmt.Sprintf("gamedata: spell %q has empty target_modes entry", s.ID))
				}
				if mode == s.Target {
					foundDefault = true
				}
			}
			if !foundDefault {
				panic(fmt.Sprintf("gamedata: spell %q target_modes must include default target %q", s.ID, s.Target))
			}
		}
		validateCinematicTier("spell", s.ID, s.CinematicTier)
	}

	validSizes := map[string]bool{"small": true, "medium": true, "large": true, "boss": true}
	for _, m := range gd.Monsters {
		if m.ID == "" {
			panic("gamedata: monster with empty id")
		}
		if m.HP <= 0 {
			panic(fmt.Sprintf("gamedata: monster %q has invalid hp: %d", m.ID, m.HP))
		}
		if !validSizes[m.Size] {
			panic(fmt.Sprintf("gamedata: monster %q has invalid size: %q", m.ID, m.Size))
		}
	}

	for _, ki := range gd.Items.KeyItems {
		if ki.ID == "" {
			panic("gamedata: key_item with empty id")
		}
		if ki.Name == "" {
			panic(fmt.Sprintf("gamedata: key_item %q has empty name", ki.ID))
		}
		if ki.BuyPrice < 0 {
			panic(fmt.Sprintf("gamedata: key_item %q has negative buy_price", ki.ID))
		}
	}

	if len(gd.Chests) == 0 {
		panic("gamedata: chests.json is empty")
	}
	for id, chest := range gd.Chests {
		if strings.TrimSpace(id) == "" {
			panic("gamedata: chest with empty id")
		}
		validateChestReward(gd, id, chest.Kind, chest.ItemID, chest.Amount, chest.MonsterFormationID, chest.RewardKind, chest.RewardItemID, chest.RewardAmount)
		for i, variant := range chest.Variants {
			if variant.IfFlag == "" && variant.IfFlagNot == "" {
				panic(fmt.Sprintf("gamedata: chest %q variant %d must set if_flag or if_flag_not", id, i))
			}
			validateChestReward(gd, fmt.Sprintf("%s variant %d", id, i), variant.Kind, variant.ItemID, variant.Amount, variant.MonsterFormationID, variant.RewardKind, variant.RewardItemID, variant.RewardAmount)
		}
	}

	requiredArchetypes := []string{
		"merchant", "priestess", "elder", "innkeeper", "guard", "blacksmith",
		"child", "farmer", "sage", "traveler", "default",
	}
	for _, arch := range requiredArchetypes {
		a, ok := gd.Dialogue.Archetypes[arch]
		if !ok {
			panic(fmt.Sprintf("gamedata: dialogue.json missing archetype %q", arch))
		}
		if len(a.Lines) < 15 {
			panic(fmt.Sprintf("gamedata: dialogue.json archetype %q has %d lines, need >= 15", arch, len(a.Lines)))
		}
		for i, l := range a.Lines {
			if l.Text == "" {
				panic(fmt.Sprintf("gamedata: dialogue.json archetype %q line %d has empty text", arch, i))
			}
		}
	}

	validLayouts := map[string]bool{
		"line": true, "vshape": true, "triangle": true,
		"boss_minions": true, "scattered": true, "rows": true,
	}
	for _, f := range gd.Formations {
		if f.ID == "" {
			panic("gamedata: formation with empty id")
		}
		if !validLayouts[f.Layout] {
			panic(fmt.Sprintf("gamedata: formation %q has invalid layout: %q", f.ID, f.Layout))
		}
		if f.MinEncounterLevel < 1 {
			panic(fmt.Sprintf("gamedata: formation %q has invalid min_encounter_level: %d", f.ID, f.MinEncounterLevel))
		}
		if len(f.Slots) == 0 {
			panic(fmt.Sprintf("gamedata: formation %q has no slots", f.ID))
		}
		for _, tag := range f.TerrainTags {
			if strings.TrimSpace(tag) == "" {
				panic(fmt.Sprintf("gamedata: formation %q has empty terrain tag", f.ID))
			}
		}
		for _, s := range f.Slots {
			if gd.monsterByID[s.MonsterID] == nil {
				panic(fmt.Sprintf("gamedata: formation %q slot references unknown monster: %q", f.ID, s.MonsterID))
			}
			if s.Min < 1 {
				panic(fmt.Sprintf("gamedata: formation %q slot %q has invalid min: %d", f.ID, s.MonsterID, s.Min))
			}
			if s.Max < s.Min {
				panic(fmt.Sprintf("gamedata: formation %q slot %q has max < min: %d < %d", f.ID, s.MonsterID, s.Max, s.Min))
			}
		}
	}

	if len(gd.Transport.Tiers) == 0 {
		panic("gamedata: transport.json has no tiers")
	}
	for _, t := range gd.Transport.Tiers {
		if t.ID == "" {
			panic("gamedata: transport tier with empty id")
		}
		if t.RangeEdges <= 0 {
			panic(fmt.Sprintf("gamedata: transport tier %q has invalid range_edges: %d", t.ID, t.RangeEdges))
		}
		if t.Unlock == "" {
			panic(fmt.Sprintf("gamedata: transport tier %q has empty unlock condition", t.ID))
		}
	}

	gd.validateBattleCharacters(classIDs)
	gd.validateShowcase(classIDs)
}

func (gd *GameData) validateBattleCharacters(baseClassIDs map[string]bool) {
	cfg := gd.BattleCharacters
	if cfg.FrameSize <= 0 {
		panic("gamedata: battle_characters.json frame_size must be positive")
	}
	if len(cfg.RequiredStates) == 0 {
		panic("gamedata: battle_characters.json has no required_states")
	}
	requiredStates := make(map[string]bool, len(cfg.RequiredStates))
	for _, state := range cfg.RequiredStates {
		if strings.TrimSpace(state) == "" || requiredStates[state] {
			panic(fmt.Sprintf("gamedata: battle_characters.json has invalid required state %q", state))
		}
		requiredStates[state] = true
	}
	weaponVisuals := make(map[string]bool, len(cfg.WeaponAssets))
	assetKeys := make(map[string]bool, len(cfg.WeaponAssets)+len(cfg.OffHandAssets))
	for _, asset := range cfg.WeaponAssets {
		if asset.VisualID == "" || asset.Key == "" || asset.Path == "" || weaponVisuals[asset.VisualID] || assetKeys[asset.Key] {
			panic(fmt.Sprintf("gamedata: battle_characters.json has invalid weapon asset %q", asset.VisualID))
		}
		weaponVisuals[asset.VisualID] = true
		assetKeys[asset.Key] = true
	}
	for _, weapon := range gd.Items.Weapons {
		if weapon.VisualID != "" && !weaponVisuals[weapon.VisualID] {
			panic(fmt.Sprintf("gamedata: weapon %q references missing battle asset %q", weapon.ID, weapon.VisualID))
		}
	}
	offHandVisuals := make(map[string]bool, len(cfg.OffHandAssets))
	for _, asset := range cfg.OffHandAssets {
		if asset.VisualID == "" || asset.Key == "" || asset.Path == "" || offHandVisuals[asset.VisualID] || assetKeys[asset.Key] {
			panic(fmt.Sprintf("gamedata: battle_characters.json has invalid off-hand asset %q", asset.VisualID))
		}
		offHandVisuals[asset.VisualID] = true
		assetKeys[asset.Key] = true
	}
	for _, shield := range gd.Items.Shields {
		if shield.VisualID != "" && !offHandVisuals[shield.VisualID] {
			panic(fmt.Sprintf("gamedata: shield %q references missing battle asset %q", shield.ID, shield.VisualID))
		}
	}

	runtimeIDs := make(map[string]bool, len(baseClassIDs)*2)
	for _, class := range gd.Classes {
		runtimeIDs[class.ID] = true
		if class.PromotesTo != "" {
			runtimeIDs[class.PromotesTo] = true
		}
	}
	if len(cfg.Classes) != len(runtimeIDs) {
		panic(fmt.Sprintf("gamedata: battle_characters.json has %d identities, want %d", len(cfg.Classes), len(runtimeIDs)))
	}

	seen := make(map[string]bool, len(cfg.Classes))
	validStatuses := map[string]bool{
		"production_pending":      true,
		"visual_approval_pending": true,
		"approved_runtime":        true,
	}
	for _, profile := range cfg.Classes {
		if !runtimeIDs[profile.ID] || seen[profile.ID] {
			panic(fmt.Sprintf("gamedata: battle_characters.json has invalid identity %q", profile.ID))
		}
		seen[profile.ID] = true
		if !validStatuses[profile.Status] {
			panic(fmt.Sprintf("gamedata: battle character %q has invalid status %q", profile.ID, profile.Status))
		}
		if profile.DefaultState != "" && !requiredStates[profile.DefaultState] {
			panic(fmt.Sprintf("gamedata: battle character %q has invalid default_state %q", profile.ID, profile.DefaultState))
		}
		if len(profile.States) > 0 && profile.DefaultState == "" {
			panic(fmt.Sprintf("gamedata: battle character %q has states but no default_state", profile.ID))
		}
		if profile.DefaultState != "" {
			if _, ok := profile.States[profile.DefaultState]; !ok {
				panic(fmt.Sprintf("gamedata: battle character %q default_state %q is not authored", profile.ID, profile.DefaultState))
			}
		}
		for attachmentID, attachment := range profile.Attachments {
			if strings.TrimSpace(attachmentID) == "" || len(attachment.Origin) != 2 {
				panic(fmt.Sprintf("gamedata: battle character %q has invalid attachment %q", profile.ID, attachmentID))
			}
		}
		for stateID, state := range profile.States {
			if !requiredStates[stateID] {
				panic(fmt.Sprintf("gamedata: battle character %q has unknown state %q", profile.ID, stateID))
			}
			if state.BodyKey == "" || state.BodyPath == "" || len(state.Frames) == 0 {
				panic(fmt.Sprintf("gamedata: battle character %q state %q is incomplete", profile.ID, stateID))
			}
			for frameIndex, frame := range state.Frames {
				if frame.Frame < 0 || frame.Duration <= 0 {
					panic(fmt.Sprintf("gamedata: battle character %q state %q frame %d is invalid", profile.ID, stateID, frameIndex))
				}
				for attachmentID := range frame.Attachments {
					if _, ok := profile.Attachments[attachmentID]; !ok {
						panic(fmt.Sprintf("gamedata: battle character %q state %q references unknown attachment %q", profile.ID, stateID, attachmentID))
					}
				}
			}
		}
	}
}

func (gd *GameData) validateShowcase(classIDs map[string]bool) {
	cfg := gd.Showcase
	if strings.TrimSpace(cfg.Title) == "" {
		panic("gamedata: showcase.json has empty title")
	}
	if cfg.Level < 1 || cfg.Level > gd.Stats.XPCurve.MaxLevel {
		panic(fmt.Sprintf("gamedata: showcase.json has invalid level %d", cfg.Level))
	}
	if len(cfg.Party) == 0 || len(cfg.Party) > 4 {
		panic(fmt.Sprintf("gamedata: showcase.json party must have 1-4 members, got %d", len(cfg.Party)))
	}
	seenNames := make(map[string]bool, len(cfg.Party))
	for i, member := range cfg.Party {
		if strings.TrimSpace(member.Name) == "" {
			panic(fmt.Sprintf("gamedata: showcase.json party member %d has empty name", i))
		}
		if seenNames[member.Name] {
			panic(fmt.Sprintf("gamedata: showcase.json repeats party member name %q", member.Name))
		}
		seenNames[member.Name] = true
		if !classIDs[member.ClassID] {
			panic(fmt.Sprintf("gamedata: showcase.json member %q references unknown class %q", member.Name, member.ClassID))
		}
		if characterRow := member.Row; characterRow != "" && characterRow != "front" && characterRow != "back" {
			panic(fmt.Sprintf("gamedata: showcase.json member %q has invalid row %q", member.Name, characterRow))
		}
		weapon := gd.WeaponByID(member.WeaponID)
		if weapon == nil || !containsString(weapon.Classes, member.ClassID) {
			panic(fmt.Sprintf("gamedata: showcase.json member %q cannot equip weapon %q", member.Name, member.WeaponID))
		}
		armor := gd.ArmorByID(member.ArmorID)
		if armor == nil || !containsString(armor.Classes, member.ClassID) {
			panic(fmt.Sprintf("gamedata: showcase.json member %q cannot equip armor %q", member.Name, member.ArmorID))
		}
		class := gd.ClassByID(member.ClassID)
		for _, spellID := range member.Spells {
			spell := gd.SpellByID(spellID)
			if spell == nil {
				panic(fmt.Sprintf("gamedata: showcase.json member %q references unknown spell %q", member.Name, spellID))
			}
			if !containsString(class.Magic.Schools, spell.School) || spell.SpellLevel > class.Magic.MaxSpellLevel {
				panic(fmt.Sprintf("gamedata: showcase.json member %q cannot learn spell %q", member.Name, spellID))
			}
		}
	}
	knownConsumables := make(map[string]bool, len(gd.Items.Consumables))
	for _, item := range gd.Items.Consumables {
		knownConsumables[item.ID] = true
	}
	for itemID, qty := range cfg.Consumables {
		if !knownConsumables[itemID] || qty < 0 {
			panic(fmt.Sprintf("gamedata: showcase.json has invalid consumable %q quantity %d", itemID, qty))
		}
	}
	if cfg.Encounter.Level < 1 || len(cfg.Encounter.MonsterIDs) == 0 {
		panic("gamedata: showcase.json encounter requires a positive level and monsters")
	}
	for _, monsterID := range cfg.Encounter.MonsterIDs {
		if gd.MonsterByID(monsterID) == nil {
			panic(fmt.Sprintf("gamedata: showcase.json references unknown monster %q", monsterID))
		}
	}
	validateShowcaseAuditValues("animation state", cfg.BattleCharacterAudit.AnimationStates)
	validateShowcaseAuditValues("effect mode", cfg.BattleCharacterAudit.EffectModes)
}

func validateShowcaseAuditValues(label string, values []string) {
	if len(values) == 0 {
		panic(fmt.Sprintf("gamedata: showcase.json battle character audit has no %ss", label))
	}
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			panic(fmt.Sprintf("gamedata: showcase.json battle character audit has empty %s", label))
		}
		if seen[value] {
			panic(fmt.Sprintf("gamedata: showcase.json battle character audit repeats %s %q", label, value))
		}
		seen[value] = true
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func validateClassRefs(kind, id string, refs []string, classIDs map[string]bool) {
	if len(refs) == 0 {
		panic(fmt.Sprintf("gamedata: %s %q has no class restrictions", kind, id))
	}
	seen := map[string]bool{}
	for _, ref := range refs {
		if ref == "" {
			panic(fmt.Sprintf("gamedata: %s %q has empty class reference", kind, id))
		}
		if !classIDs[ref] {
			panic(fmt.Sprintf("gamedata: %s %q references unknown class %q", kind, id, ref))
		}
		if seen[ref] {
			panic(fmt.Sprintf("gamedata: %s %q repeats class %q", kind, id, ref))
		}
		seen[ref] = true
	}
}

func validateCinematicTier(kind, id, tier string) {
	if tier == "" || tier == "brisk" || tier == "major" {
		return
	}
	panic(fmt.Sprintf("gamedata: %s %q has invalid cinematic_tier: %q", kind, id, tier))
}

func validateGrowth(classID, stat string, value int) {
	if value < 0 || value > 8 {
		panic(fmt.Sprintf("gamedata: class %q stat_growth_eighths.%s must be 0-8, got %d", classID, stat, value))
	}
}

func validateChestReward(gd *GameData, label, kind, itemID string, amount int, formationID, rewardKind, rewardItemID string, rewardAmount int) {
	validKinds := map[string]bool{
		"item":        true,
		"gil":         true,
		"key_item":    true,
		"monster_box": true,
	}
	if !validKinds[kind] {
		panic(fmt.Sprintf("gamedata: chest %q has invalid kind %q", label, kind))
	}

	switch kind {
	case "item":
		if itemID == "" {
			panic(fmt.Sprintf("gamedata: chest %q item reward missing item_id", label))
		}
		if !gd.validChestItemID(itemID) {
			panic(fmt.Sprintf("gamedata: chest %q references unknown item %q", label, itemID))
		}
	case "gil":
		if amount <= 0 {
			panic(fmt.Sprintf("gamedata: chest %q gil reward must set amount > 0", label))
		}
	case "key_item":
		if itemID == "" {
			panic(fmt.Sprintf("gamedata: chest %q key_item reward missing item_id", label))
		}
		if gd.KeyItemByID(itemID) == nil {
			panic(fmt.Sprintf("gamedata: chest %q references unknown key item %q", label, itemID))
		}
	case "monster_box":
		if gd.FormationByID(formationID) == nil {
			panic(fmt.Sprintf("gamedata: chest %q monster_box references unknown formation %q", label, formationID))
		}
		validateChestReward(gd, label+" reward", rewardKind, rewardItemID, rewardAmount, "", "", "", 0)
	}
}

func (gd *GameData) validChestItemID(id string) bool {
	if gd.WeaponByID(id) != nil || gd.ArmorByID(id) != nil {
		return true
	}
	for i := range gd.Items.Consumables {
		if gd.Items.Consumables[i].ID == id {
			return true
		}
	}
	return false
}

func loadJSON[T any](dir, filename string) T {
	path := filepath.Join(dir, filename)
	data, err := os.ReadFile(path)
	if err != nil {
		panic(fmt.Sprintf("gamedata: reading %s: %v", path, err))
	}

	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		panic(fmt.Sprintf("gamedata: parsing %s: %v", path, err))
	}

	return result
}
