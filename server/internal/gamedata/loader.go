package gamedata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/dungeon"
	"github.com/digitaldrywood/kithlands/internal/generator"
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
	EncounterPacing    EncounterPacing
	Campaign           generator.CampaignConfig
	FinalEncounter     FinalEncounter
	Dungeons           []dungeon.Definition
	QuestObjectives    map[string]generator.ObjectiveDefinition
	Classes            []Class
	Stats              StatsConfig
	Items              ItemsData
	Loot               LootData
	Abilities          []Ability
	Chests             ChestCatalog
	Spells             SpellsData
	Monsters           []Monster
	Formations         []Formation
	Transport          TransportData
	Palettes           Palettes
	Dialogue           DialoguePool
	NaturalDiscoveries []NaturalDiscovery
	Showcase           ShowcaseData
	BattleCharacters   BattleCharactersData

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
	lootRarityByID      map[string]*LootRarity
	lootAffixByID       map[string]*LootAffix
	gemByID             map[string]*Gem
	gemRecipeByID       map[string]*GemRecipe
	equipSlotByID       map[string]*EquipmentSlotDefinition
	equipmentByID       map[string]*EquipmentBase
}

// Load reads and validates all game data from the shared directory.
// It panics with a clear message if any file is missing or malformed,
// per standing order: "A malformed classes.json should crash the server
// with a clear error, not produce a broken game."
func Load(sharedDir string) *GameData {
	gd := &GameData{}
	gd.EncounterPacing = loadJSON[EncounterPacing](sharedDir, "encounter_pacing.json")
	if err := gd.EncounterPacing.Validate(); err != nil {
		panic(err)
	}
	gd.Campaign = loadJSON[generator.CampaignConfig](sharedDir, "campaign.json")
	if err := gd.Campaign.Validate(); err != nil {
		panic(fmt.Sprintf("gamedata: %v", err))
	}
	gd.QuestObjectives = loadJSON[map[string]generator.ObjectiveDefinition](sharedDir, "quest_objectives.json")
	if err := generator.ValidateObjectiveDefinitions(gd.QuestObjectives); err != nil {
		panic(err)
	}

	gd.Classes = loadJSON[[]Class](sharedDir, "classes.json")
	gd.Stats = loadJSON[StatsConfig](sharedDir, "stats.json")
	gd.Items = loadJSON[ItemsData](sharedDir, "items.json")
	gd.Loot = loadJSON[LootData](sharedDir, "loot.json")
	gd.Abilities = loadJSON[[]Ability](sharedDir, "abilities.json")
	gd.Chests = loadJSON[ChestCatalog](sharedDir, "chests.json")
	gd.Spells = loadJSON[SpellsData](sharedDir, "spells.json")
	gd.Monsters = loadJSON[[]Monster](sharedDir, "monsters.json")
	gd.FinalEncounter = loadJSON[FinalEncounter](sharedDir, "final_encounter.json")
	gd.Formations = loadJSON[[]Formation](sharedDir, "formations.json")
	gd.Transport = loadJSON[TransportData](sharedDir, "transport.json")
	gd.Palettes = loadJSON[Palettes](sharedDir, "palettes.json")
	gd.Dialogue = loadJSON[DialoguePool](sharedDir, "dialogue.json")
	gd.NaturalDiscoveries = loadJSON[[]NaturalDiscovery](sharedDir, "natural_discoveries.json")
	gd.Showcase = loadJSON[ShowcaseData](sharedDir, "showcase.json")
	gd.BattleCharacters = loadJSON[BattleCharactersData](sharedDir, "battle_characters.json")
	gd.expandBattleCharacterStates()

	gd.buildIndexes()
	gd.validate()
	var err error
	gd.Dungeons, err = dungeon.Load(sharedDir)
	if err != nil {
		panic(fmt.Sprintf("gamedata: %v", err))
	}
	gd.validateDungeons()
	gd.validateFinalEncounter()

	return gd
}

func cloneBattleAttachmentFrames(
	source map[string]BattleAttachmentFrame,
	visibility *bool,
) map[string]BattleAttachmentFrame {
	cloned := make(map[string]BattleAttachmentFrame, len(source))
	for id, pose := range source {
		if visibility != nil {
			visible := *visibility
			pose.Visible = &visible
		}
		cloned[id] = pose
	}
	return cloned
}

// expandBattleCharacterStates applies shared presentation recipes to missing
// states. Explicitly authored identity states always win; recipes only reuse
// that identity's own atlas frames and attachment sockets.
func (gd *GameData) expandBattleCharacterStates() {
	for profileIndex := range gd.BattleCharacters.Classes {
		profile := &gd.BattleCharacters.Classes[profileIndex]
		if profile.StateRecipe == "" {
			continue
		}
		recipe, ok := gd.BattleCharacters.StateRecipes[profile.StateRecipe]
		if !ok {
			panic(fmt.Sprintf("gamedata: battle character %q references missing state recipe %q", profile.ID, profile.StateRecipe))
		}
		signature, ok := profile.States[profile.DefaultState]
		if !ok || len(signature.Frames) == 0 {
			panic(fmt.Sprintf("gamedata: battle character %q cannot expand recipe %q without default state %q", profile.ID, profile.StateRecipe, profile.DefaultState))
		}
		signatureFrames := make(map[int]BattleStateFrame, len(signature.Frames))
		for _, frame := range signature.Frames {
			signatureFrames[frame.Frame] = frame
		}

		for stateID, recipeState := range recipe.States {
			if _, authored := profile.States[stateID]; authored {
				continue
			}
			frames := make([]BattleStateFrame, 0, len(recipeState.Frames))
			for recipeFrameIndex, recipeFrame := range recipeState.Frames {
				sourceFrame, exists := signatureFrames[recipeFrame.Frame]
				if !exists {
					panic(fmt.Sprintf("gamedata: battle character %q recipe state %q frame %d references unauthored atlas frame %d", profile.ID, stateID, recipeFrameIndex, recipeFrame.Frame))
				}
				frames = append(frames, BattleStateFrame{
					Frame:       recipeFrame.Frame,
					Duration:    recipeFrame.Duration,
					Body:        recipeFrame.Body,
					Attachments: cloneBattleAttachmentFrames(sourceFrame.Attachments, recipeState.AttachmentsVisible),
				})
			}
			profile.States[stateID] = BattleStateDefinition{
				CueFrame:      recipeState.CueFrame,
				BodyKey:       signature.BodyKey,
				BodyPath:      signature.BodyPath,
				HoldLastFrame: recipeState.HoldLastFrame,
				Frames:        frames,
			}
		}
	}
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
func (gd *GameData) ConsumableByID(id string) *Consumable {
	for i := range gd.Items.Consumables {
		if gd.Items.Consumables[i].ID == id {
			return &gd.Items.Consumables[i]
		}
	}
	return nil
}
func (gd *GameData) LootRarityByID(id string) *LootRarity {
	return gd.lootRarityByID[id]
}
func (gd *GameData) LootAffixByID(id string) *LootAffix { return gd.lootAffixByID[id] }
func (gd *GameData) GemByID(id string) *Gem             { return gd.gemByID[id] }
func (gd *GameData) GemRecipeByID(id string) *GemRecipe { return gd.gemRecipeByID[id] }
func (gd *GameData) EquipmentSlotByID(id string) *EquipmentSlotDefinition {
	return gd.equipSlotByID[id]
}
func (gd *GameData) EquipmentBaseByID(id string) *EquipmentBase { return gd.equipmentByID[id] }
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

	gd.equipSlotByID = make(map[string]*EquipmentSlotDefinition, len(gd.Items.EquipmentSlots))
	for i := range gd.Items.EquipmentSlots {
		gd.equipSlotByID[gd.Items.EquipmentSlots[i].ID] = &gd.Items.EquipmentSlots[i]
	}
	gd.buildEquipmentIndex()

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

	gd.lootRarityByID = make(map[string]*LootRarity, len(gd.Loot.Rarities))
	for i := range gd.Loot.Rarities {
		gd.lootRarityByID[gd.Loot.Rarities[i].ID] = &gd.Loot.Rarities[i]
	}
	gd.lootAffixByID = make(map[string]*LootAffix, len(gd.Loot.Affixes))
	for i := range gd.Loot.Affixes {
		gd.lootAffixByID[gd.Loot.Affixes[i].ID] = &gd.Loot.Affixes[i]
	}
	gd.gemByID = make(map[string]*Gem, len(gd.Loot.Gems))
	for i := range gd.Loot.Gems {
		gd.gemByID[gd.Loot.Gems[i].ID] = &gd.Loot.Gems[i]
	}
	gd.gemRecipeByID = make(map[string]*GemRecipe, len(gd.Loot.Recipes))
	for i := range gd.Loot.Recipes {
		gd.gemRecipeByID[gd.Loot.Recipes[i].ID] = &gd.Loot.Recipes[i]
	}
}

func (gd *GameData) buildEquipmentIndex() {
	gd.equipmentByID = make(map[string]*EquipmentBase)
	add := func(base EquipmentBase) {
		if base.Stats["evade_penalty"] < 0 {
			panic(fmt.Sprintf("gamedata: equipment %q evade_penalty must be a nonnegative cost", base.ID))
		}
		if prior := gd.equipmentByID[base.ID]; prior != nil {
			panic(fmt.Sprintf("gamedata: duplicate equipment base id %q", base.ID))
		}
		base.Classes = append([]string(nil), base.Classes...)
		base.Stats = cloneIntMap(base.Stats)
		gd.equipmentByID[base.ID] = &base
	}
	for _, item := range gd.Items.Weapons {
		add(EquipmentBase{
			ID: item.ID, Name: item.Name, IconKey: item.IconKey, Kind: "weapon", Category: "weapon", Tier: item.Tier,
			RequiredLevel: 1, Classes: item.Classes,
			BuyPrice: item.BuyPrice, SellPrice: item.SellPrice,
			Stats: map[string]int{
				"power": item.Power, "hit_pct": item.HitPct, "crit_pct": item.CritPct,
				"spell_damage_pct": item.SpellDamagePct,
			},
		})
	}
	for _, item := range gd.Items.Armor {
		add(EquipmentBase{
			ID: item.ID, Name: item.Name, IconKey: item.IconKey, Kind: "armor", Category: "armor", Tier: item.Tier,
			RequiredLevel: 1, Classes: item.Classes,
			BuyPrice: item.BuyPrice, SellPrice: item.SellPrice,
			Stats: map[string]int{
				"absorb": item.Absorb, "magic_defense": item.MagicDefense, "evade_penalty": item.EvadePenalty,
			},
		})
	}
	for _, item := range gd.Items.Shields {
		add(EquipmentBase{
			ID: item.ID, Name: item.Name, IconKey: item.IconKey, Kind: "armor", Category: "shield", Tier: item.Tier,
			RequiredLevel: 1, Classes: item.Classes,
			BuyPrice: item.BuyPrice, SellPrice: item.SellPrice,
			Stats: map[string]int{"absorb": item.Absorb, "evade_penalty": item.EvadePenalty},
		})
	}
	for _, item := range gd.Items.Helmets {
		add(EquipmentBase{
			ID: item.ID, Name: item.Name, IconKey: item.IconKey, Kind: "armor", Category: "helmet", Tier: item.Tier,
			RequiredLevel: 1, Classes: item.Classes, Stats: map[string]int{"absorb": item.Absorb},
			BuyPrice: item.BuyPrice, SellPrice: item.SellPrice,
		})
	}
	for _, item := range gd.Items.Gear {
		add(EquipmentBase(item))
	}
}

func cloneIntMap(source map[string]int) map[string]int {
	copy := make(map[string]int, len(source))
	for key, value := range source {
		copy[key] = value
	}
	return copy
}

func (gd *GameData) validate() {
	gd.validateLoot()
	gd.validateNaturalDiscoveries()

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

	validateEquipmentSlots(gd.Items.EquipmentSlots)

	for _, w := range gd.Items.Weapons {
		if w.ID == "" {
			panic("gamedata: weapon with empty id")
		}
		if w.Power < 0 {
			panic(fmt.Sprintf("gamedata: weapon %q has negative power", w.ID))
		}
		validateWeaponSpellDamage(w)
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

	for _, gear := range gd.Items.Gear {
		if gear.ID == "" || gear.Name == "" || gear.Category == "" {
			panic("gamedata: gear id, name, and category must be non-empty")
		}
		if !validLootKind(gear.Kind) || gear.Kind == "weapon" {
			panic(fmt.Sprintf("gamedata: gear %q has invalid kind %q", gear.ID, gear.Kind))
		}
		if gear.Tier < 1 || gear.RequiredLevel < 1 || gear.BuyPrice < 0 || gear.SellPrice < 0 {
			panic(fmt.Sprintf("gamedata: gear %q has invalid tier, level, or price", gear.ID))
		}
		if len(gear.Stats) == 0 {
			panic(fmt.Sprintf("gamedata: gear %q has no stats", gear.ID))
		}
		for stat := range gear.Stats {
			if !validLootStat(stat) {
				panic(fmt.Sprintf("gamedata: gear %q has invalid stat %q", gear.ID, stat))
			}
		}
		accepted := false
		for _, slot := range gd.Items.EquipmentSlots {
			accepted = accepted || slices.Contains(slot.Accepts, gear.Category)
		}
		if !accepted {
			panic(fmt.Sprintf("gamedata: gear %q category %q has no equipment slot", gear.ID, gear.Category))
		}
		validateClassRefs("gear", gear.ID, gear.Classes, classIDs)
	}

	for _, class := range gd.Classes {
		for slotID, itemID := range class.StartingLoadout {
			slot := gd.EquipmentSlotByID(slotID)
			if slot == nil {
				panic(fmt.Sprintf("gamedata: class %q starter slot %q not found", class.ID, slotID))
			}
			base := gd.EquipmentBaseByID(itemID)
			if base == nil {
				panic(fmt.Sprintf("gamedata: class %q starter equipment %q not found", class.ID, itemID))
			}
			if !slices.Contains(slot.Accepts, base.Category) {
				panic(fmt.Sprintf("gamedata: class %q starter equipment %q does not fit slot %q", class.ID, itemID, slotID))
			}
			if !slices.Contains(base.Classes, class.ID) {
				panic(fmt.Sprintf("gamedata: class %q cannot equip starter equipment %q", class.ID, itemID))
			}
		}
	}

	for _, a := range gd.Abilities {
		if a.ID == "" {
			panic("gamedata: ability with empty id")
		}
		if a.Name == "" {
			panic(fmt.Sprintf("gamedata: ability %q has empty name", a.ID))
		}
		validateCinematicTier("ability", a.ID, a.CinematicTier)
		validateBattleEffectPresentation("ability", a.ID, a.Presentation)
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
		validateBattleEffectPresentation("spell", s.ID, s.Presentation)
	}

	validSizes := map[string]bool{"small": true, "medium": true, "large": true, "boss": true}
	for _, m := range gd.Monsters {
		if m.ID == "" {
			panic("gamedata: monster with empty id")
		}
		if strings.TrimSpace(m.FieldNote) == "" {
			panic(fmt.Sprintf("gamedata: monster %q has empty field_note", m.ID))
		}
		if len(m.Habitats) == 0 {
			panic(fmt.Sprintf("gamedata: monster %q has no habitats", m.ID))
		}
		for _, habitat := range m.Habitats {
			if strings.TrimSpace(habitat) == "" {
				panic(fmt.Sprintf("gamedata: monster %q has empty habitat", m.ID))
			}
		}
		if strings.TrimSpace(m.Tactics) == "" {
			panic(fmt.Sprintf("gamedata: monster %q has empty tactics", m.ID))
		}
		if m.HP <= 0 {
			panic(fmt.Sprintf("gamedata: monster %q has invalid hp: %d", m.ID, m.HP))
		}
		if !validSizes[m.Size] {
			panic(fmt.Sprintf("gamedata: monster %q has invalid size: %q", m.ID, m.Size))
		}
		for _, drop := range m.Drops {
			if drop.ChancePct < 1 || drop.ChancePct > 100 || !gd.validChestItemID(drop.ItemID) {
				panic(fmt.Sprintf("gamedata: monster %q has invalid drop %q", m.ID, drop.ItemID))
			}
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

	validMoods := map[string]bool{"friendly": true, "neutral": true, "mysterious": true}
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
			if !validMoods[l.Mood] {
				panic(fmt.Sprintf("gamedata: dialogue.json archetype %q line %d has invalid mood %q", arch, i, l.Mood))
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

func validateWeaponSpellDamage(weapon Weapon) {
	if weapon.SpellDamagePct < 0 || weapon.SpellDamagePct > 100 {
		panic(fmt.Sprintf("gamedata: weapon %q spell_damage_pct must be between 0 and 100", weapon.ID))
	}
	if weapon.SpellDamagePct > 0 && weapon.Type != "staff" {
		panic(fmt.Sprintf("gamedata: weapon %q spell_damage_pct requires staff type", weapon.ID))
	}
	if strings.Contains(strings.ToLower(weapon.Special), "spell damage") {
		panic(fmt.Sprintf("gamedata: weapon %q must author spell damage with spell_damage_pct, not special text", weapon.ID))
	}
}

func (gd *GameData) validateNaturalDiscoveries() {
	if len(gd.NaturalDiscoveries) == 0 {
		panic("gamedata: natural_discoveries.json is empty")
	}

	ids := make(map[string]bool, len(gd.NaturalDiscoveries))
	validKinds := map[string]bool{"clue": true, "supply_cache": true, "hidden_passage": true}
	for _, discovery := range gd.NaturalDiscoveries {
		if strings.TrimSpace(discovery.ID) == "" {
			panic("gamedata: natural discovery with empty id")
		}
		if ids[discovery.ID] {
			panic(fmt.Sprintf("gamedata: duplicate natural discovery id %q", discovery.ID))
		}
		ids[discovery.ID] = true
		if !validKinds[discovery.Kind] {
			panic(fmt.Sprintf("gamedata: natural discovery %q has invalid kind %q", discovery.ID, discovery.Kind))
		}
		if strings.TrimSpace(discovery.Title) == "" || strings.TrimSpace(discovery.Prompt) == "" ||
			strings.TrimSpace(discovery.SuccessMessage) == "" || strings.TrimSpace(discovery.ExhaustedMessage) == "" {
			panic(fmt.Sprintf("gamedata: natural discovery %q has incomplete presentation copy", discovery.ID))
		}
		if discovery.RequiresKeyItem != "" {
			if gd.KeyItemByID(discovery.RequiresKeyItem) == nil {
				panic(fmt.Sprintf("gamedata: natural discovery %q requires unknown key item %q", discovery.ID, discovery.RequiresKeyItem))
			}
			if strings.TrimSpace(discovery.LockedMessage) == "" {
				panic(fmt.Sprintf("gamedata: natural discovery %q requires locked_message", discovery.ID))
			}
		} else if discovery.ConsumeKeyItem {
			panic(fmt.Sprintf("gamedata: natural discovery %q consumes no required key item", discovery.ID))
		}
		if strings.TrimSpace(discovery.QuestRevealMessage) == "" || !strings.Contains(discovery.QuestRevealMessage, "{quest_name}") {
			panic(fmt.Sprintf("gamedata: natural discovery %q requires quest_reveal_message", discovery.ID))
		}
		for i, reward := range discovery.Rewards {
			label := fmt.Sprintf("natural discovery %q reward %d", discovery.ID, i)
			if reward.Amount <= 0 {
				panic(fmt.Sprintf("gamedata: %s amount must be positive", label))
			}
			switch reward.Kind {
			case "gold":
				if reward.ItemID != "" {
					panic(fmt.Sprintf("gamedata: %s gold reward cannot set item_id", label))
				}
			case "consumable":
				if gd.ConsumableByID(reward.ItemID) == nil {
					panic(fmt.Sprintf("gamedata: %s references unknown consumable %q", label, reward.ItemID))
				}
			case "key_item":
				if gd.KeyItemByID(reward.ItemID) == nil {
					panic(fmt.Sprintf("gamedata: %s references unknown key item %q", label, reward.ItemID))
				}
				if reward.Amount != 1 {
					panic(fmt.Sprintf("gamedata: %s key-item amount must be 1", label))
				}
			default:
				panic(fmt.Sprintf("gamedata: %s has invalid kind %q", label, reward.Kind))
			}
		}
	}
}

func (gd *GameData) validateBattleCharacters(baseClassIDs map[string]bool) {
	cfg := gd.BattleCharacters
	if cfg.FrameSize <= 0 {
		panic("gamedata: battle_characters.json frame_size must be positive")
	}
	if len(cfg.FeetAnchor) != 2 || cfg.FeetAnchor[0] < 0 || cfg.FeetAnchor[0] > float64(cfg.FrameSize) || cfg.FeetAnchor[1] < 0 || cfg.FeetAnchor[1] > float64(cfg.FrameSize) {
		panic("gamedata: battle_characters.json has invalid feet_anchor")
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
	if len(cfg.StateRecipes) == 0 {
		panic("gamedata: battle_characters.json has no state_recipes")
	}
	for recipeID, recipe := range cfg.StateRecipes {
		if strings.TrimSpace(recipeID) == "" || len(recipe.States) == 0 {
			panic(fmt.Sprintf("gamedata: battle_characters.json has invalid state recipe %q", recipeID))
		}
		for stateID, state := range recipe.States {
			if !requiredStates[stateID] {
				panic(fmt.Sprintf("gamedata: battle state recipe %q has unknown state %q", recipeID, stateID))
			}
			if state.HoldLastFrame && stateID != "ko_defeated" {
				panic(fmt.Sprintf("gamedata: battle state recipe %q state %q cannot hold its last frame", recipeID, stateID))
			}
			if len(state.Frames) == 0 {
				panic(fmt.Sprintf("gamedata: battle state recipe %q state %q has no frames", recipeID, stateID))
			}
			if state.CueFrame != nil {
				found := false
				for _, frame := range state.Frames {
					if frame.Frame == *state.CueFrame {
						found = true
					}
				}
				if !found {
					panic(fmt.Sprintf("gamedata: battle character %q state %q has invalid cue_frame", recipeID, stateID))
				}
			}
			for frameIndex, frame := range state.Frames {
				if frame.Frame < 0 || frame.Duration <= 0 ||
					frame.Body.X < -float64(cfg.FrameSize) || frame.Body.X > float64(cfg.FrameSize) ||
					frame.Body.Y < -float64(cfg.FrameSize) || frame.Body.Y > float64(cfg.FrameSize) ||
					frame.Body.Angle < -180 || frame.Body.Angle > 180 {
					panic(fmt.Sprintf("gamedata: battle state recipe %q state %q frame %d is invalid", recipeID, stateID, frameIndex))
				}
			}
		}
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
		if profile.StateRecipe != "" {
			if _, ok := cfg.StateRecipes[profile.StateRecipe]; !ok {
				panic(fmt.Sprintf("gamedata: battle character %q references invalid state recipe %q", profile.ID, profile.StateRecipe))
			}
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
		if profile.Status == "approved_runtime" {
			for _, stateID := range cfg.RequiredStates {
				if _, ok := profile.States[stateID]; !ok {
					panic(fmt.Sprintf("gamedata: approved battle character %q is missing required state %q", profile.ID, stateID))
				}
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
			if state.HoldLastFrame && stateID != "ko_defeated" {
				panic(fmt.Sprintf("gamedata: battle character %q state %q cannot hold its last frame", profile.ID, stateID))
			}
			if state.BodyKey == "" || state.BodyPath == "" || len(state.Frames) == 0 {
				panic(fmt.Sprintf("gamedata: battle character %q state %q is incomplete", profile.ID, stateID))
			}
			if state.CueFrame != nil {
				found := false
				for _, frame := range state.Frames {
					if frame.Frame == *state.CueFrame {
						found = true
					}
				}
				if !found {
					panic(fmt.Sprintf("gamedata: battle character %q state %q has invalid cue_frame", profile.ID, stateID))
				}
			}
			for frameIndex, frame := range state.Frames {
				if frame.Frame < 0 || frame.Duration <= 0 {
					panic(fmt.Sprintf("gamedata: battle character %q state %q frame %d is invalid", profile.ID, stateID, frameIndex))
				}
				if frame.Body.X < -float64(cfg.FrameSize) || frame.Body.X > float64(cfg.FrameSize) ||
					frame.Body.Y < -float64(cfg.FrameSize) || frame.Body.Y > float64(cfg.FrameSize) ||
					frame.Body.Angle < -180 || frame.Body.Angle > 180 {
					panic(fmt.Sprintf("gamedata: battle character %q state %q frame %d has an invalid body transform", profile.ID, stateID, frameIndex))
				}
				for attachmentID := range frame.Attachments {
					if _, ok := profile.Attachments[attachmentID]; !ok {
						panic(fmt.Sprintf("gamedata: battle character %q state %q references unknown attachment %q", profile.ID, stateID, attachmentID))
					}
				}
				for attachmentID := range profile.Attachments {
					if _, ok := frame.Attachments[attachmentID]; !ok {
						panic(fmt.Sprintf("gamedata: battle character %q state %q frame %d is missing attachment %q", profile.ID, stateID, frameIndex, attachmentID))
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
		if len(member.Loadout) == 0 {
			weapon := gd.WeaponByID(member.WeaponID)
			if weapon == nil || !containsString(weapon.Classes, member.ClassID) {
				panic(fmt.Sprintf("gamedata: showcase.json member %q cannot equip weapon %q", member.Name, member.WeaponID))
			}
			armor := gd.ArmorByID(member.ArmorID)
			if armor == nil || !containsString(armor.Classes, member.ClassID) {
				panic(fmt.Sprintf("gamedata: showcase.json member %q cannot equip armor %q", member.Name, member.ArmorID))
			}
		} else {
			maxSockets := 0
			for _, rarity := range gd.Loot.Rarities {
				maxSockets = max(maxSockets, rarity.Sockets.Max)
			}
			for slotID, baseID := range member.Loadout {
				slot := gd.EquipmentSlotByID(slotID)
				base := gd.EquipmentBaseByID(baseID)
				if slot == nil || base == nil || !slices.Contains(slot.Accepts, base.Category) {
					panic(fmt.Sprintf("gamedata: showcase.json member %q has invalid %q loadout item %q", member.Name, slotID, baseID))
				}
				if !slices.Contains(base.Classes, member.ClassID) || base.RequiredLevel > cfg.Level {
					panic(fmt.Sprintf("gamedata: showcase.json member %q cannot equip %q at level %d", member.Name, baseID, cfg.Level))
				}
			}
			for slotID, gemIDs := range member.Sockets {
				baseID := member.Loadout[slotID]
				base := gd.EquipmentBaseByID(baseID)
				if base == nil || len(gemIDs) > maxSockets {
					panic(fmt.Sprintf("gamedata: showcase.json member %q has invalid sockets for slot %q", member.Name, slotID))
				}
				for _, gemID := range gemIDs {
					gem := gd.GemByID(gemID)
					if gem == nil || gem.RequiredLevel > cfg.Level {
						panic(fmt.Sprintf("gamedata: showcase.json member %q cannot socket gem %q at level %d", member.Name, gemID, cfg.Level))
					}
					compatible := false
					for _, effect := range gem.Effects {
						compatible = compatible || effect.Kind == base.Kind
					}
					if !compatible {
						panic(fmt.Sprintf("gamedata: showcase.json gem %q is incompatible with %q", gemID, baseID))
					}
				}
			}
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
	validateShowcaseAuditValues("effect family", cfg.BattleCharacterAudit.EffectFamilies)
	for _, family := range cfg.BattleCharacterAudit.EffectFamilies {
		validateBattleEffectPresentation("showcase effect family", family, &BattleEffectPresentation{EffectFamily: family, IntensityTier: 1})
	}
	validateShowcaseIntensityTiers(cfg.BattleCharacterAudit.IntensityTiers)
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

func validateEquipmentSlots(slots []EquipmentSlotDefinition) {
	if len(slots) == 0 {
		panic("gamedata: items.json must define equipment_slots")
	}
	ids := make(map[string]bool, len(slots))
	orders := make(map[int]bool, len(slots))
	for _, slot := range slots {
		if slot.ID == "" || slot.Name == "" || slot.Group == "" {
			panic("gamedata: equipment slot id, name, and group must be non-empty")
		}
		if ids[slot.ID] {
			panic(fmt.Sprintf("gamedata: duplicate equipment slot id %q", slot.ID))
		}
		if slot.Order <= 0 || orders[slot.Order] {
			panic(fmt.Sprintf("gamedata: equipment slot %q has invalid or duplicate order %d", slot.ID, slot.Order))
		}
		if len(slot.Accepts) == 0 {
			panic(fmt.Sprintf("gamedata: equipment slot %q accepts no item categories", slot.ID))
		}
		accepted := make(map[string]bool, len(slot.Accepts))
		for _, category := range slot.Accepts {
			if category == "" || accepted[category] {
				panic(fmt.Sprintf("gamedata: equipment slot %q has empty or duplicate accepted category %q", slot.ID, category))
			}
			accepted[category] = true
		}
		ids[slot.ID] = true
		orders[slot.Order] = true
	}
	for _, required := range []struct {
		slotID   string
		category string
	}{
		{slotID: "main_hand", category: "weapon"},
		{slotID: "body", category: "armor"},
	} {
		found := false
		for _, slot := range slots {
			if slot.ID == required.slotID && slices.Contains(slot.Accepts, required.category) {
				found = true
				break
			}
		}
		if !found {
			panic(fmt.Sprintf("gamedata: equipment slot %q must accept %q", required.slotID, required.category))
		}
	}
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

func validateBattleEffectPresentation(kind, id string, presentation *BattleEffectPresentation) {
	if presentation == nil {
		return
	}
	validFamilies := map[string]bool{
		"restorative_light": true, "ward_blessing": true, "fire": true,
		"ice": true, "lightning": true, "status_dark": true,
		"holy_revival": true, "focus": true, "counter": true,
		"steal": true, "backstab": true, "inspire": true,
	}
	if !validFamilies[presentation.EffectFamily] {
		panic(fmt.Sprintf("gamedata: %s %q has invalid effect_family: %q", kind, id, presentation.EffectFamily))
	}
	if presentation.IntensityTier < 1 || presentation.IntensityTier > 3 {
		panic(fmt.Sprintf("gamedata: %s %q has invalid intensity_tier: %d", kind, id, presentation.IntensityTier))
	}
}

func validateShowcaseIntensityTiers(tiers []int) {
	if len(tiers) == 0 {
		panic("gamedata: showcase.json battle character audit has no intensity tiers")
	}
	seen := make(map[int]bool, len(tiers))
	for _, tier := range tiers {
		if tier < 1 || tier > 3 || seen[tier] {
			panic(fmt.Sprintf("gamedata: showcase.json battle character audit has invalid intensity tier %d", tier))
		}
		seen[tier] = true
	}
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
	if gd.EquipmentBaseByID(id) != nil || gd.GemByID(id) != nil {
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
