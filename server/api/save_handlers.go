package api

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/digitaldrywood/kithlands/internal/auth"
	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/magic"
	"github.com/digitaldrywood/kithlands/internal/save"
	"github.com/digitaldrywood/kithlands/internal/transport"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SaveGameData is the full serializable game state stored in JSONB.
type SaveGameData struct {
	Party      []*character.Character      `json:"party"`
	SpellBooks map[string]*magic.SpellBook `json:"spell_books"`
	Inventory  *inventory.Inventory        `json:"inventory"`
	Quests     []generator.Quest           `json:"quests"`
	CurrentQ   int                         `json:"current_quest"`
	Phase      string                      `json:"phase"`
	Discovered map[string]bool             `json:"discovered"`
	PlayerX    int                         `json:"player_x"`
	PlayerY    int                         `json:"player_y"`
}

// ToSaveState serializes the live game into a SaveState for database storage.
func (g *Game) ToSaveState(name, userID string) (*save.SaveState, error) {
	return g.ToSaveStateWithWorldPosition(name, userID, nil)
}

// ToSaveStateWithWorldPosition validates an optional renderer position before
// serializing the server-owned checkpoint. Existing non-world callers omit it
// and retain the last approved overworld tile.
func (g *Game) ToSaveStateWithWorldPosition(name, userID string, position *WorldPosition) (*save.SaveState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if (g.inDungeon() || g.finalEncounterActive() || g.objectiveEncounterActive()) && g.phase == "combat" {
		return nil, fmt.Errorf("finish or flee the encounter before saving")
	}
	if position != nil {
		if err := g.updateWorldCheckpointLocked(*position, g.location.WorldNodeID); err != nil {
			return nil, fmt.Errorf("updating world checkpoint: %w", err)
		}
	}

	partyJSON, err := json.Marshal(g.party)
	if err != nil {
		return nil, fmt.Errorf("marshaling party: %w", err)
	}

	invJSON, err := json.Marshal(g.inv)
	if err != nil {
		return nil, fmt.Errorf("marshaling inventory: %w", err)
	}

	questJSON, err := json.Marshal(g.quests)
	if err != nil {
		return nil, fmt.Errorf("marshaling quests: %w", err)
	}

	worldState := map[string]any{
		"active_dungeon_id":          g.activeDungeonID,
		"dungeons":                   g.dungeons,
		"final_encounter":            g.finalEncounter,
		"current_quest":              g.currentQ,
		"phase":                      g.phase,
		"discovered":                 g.discovered,
		"spell_books":                g.spellBooks,
		"transport":                  g.trans,
		"collected_hidden_items":     g.collectedHiddenItems,
		"triggered_flags":            g.triggeredFlags,
		"natural_discovery_claimed":  g.naturalDiscoveryClaimed,
		"natural_discovery_revealed": g.naturalDiscoveryRevealed,
		"building_side_quests":       g.buildingSideQuests,
		"last_round_actions":         g.lastRoundActions,
		"world_encounter_count":      g.worldEncounterCount,
		"encounter_travel":           g.encounterTravel,
		"loot_roll_sequence":         g.lootRollSeq,
		"battle_rewards":             g.battleRewards,
		"shop_stocks":                g.shopStocks,
		"world_checkpoint":           g.worldCheckpoint,
		"interior_templates":         g.interiorChoices(),
	}
	worldJSON, err := json.Marshal(worldState)
	if err != nil {
		return nil, fmt.Errorf("marshaling world state: %w", err)
	}

	// Compute play time (approximate)
	playTime := 0

	return &save.SaveState{
		UserID:      userID,
		LocalityID:  g.loc.ID,
		Name:        name,
		Flavor:      "conquest",
		Difficulty:  g.diff.ID,
		SpawnNodeID: g.walk.Spawn.ID,
		Party:       partyJSON,
		Inventory:   invJSON,
		QuestState:  questJSON,
		WorldState:  worldJSON,
		RNGSeed:     g.rngSeed,
		PlayTimeSec: playTime,
	}, nil
}

// FromSaveState reconstructs a Game from a SaveState.
func FromSaveState(ss *save.SaveState, gd *gamedata.GameData, loc *locality.Locality) (*Game, error) {
	var party []*character.Character
	if err := json.Unmarshal(ss.Party, &party); err != nil {
		return nil, fmt.Errorf("unmarshaling party: %w", err)
	}

	// Legacy save migration (GDD §8.1 rewrite): pre-MP saves marshaled
	// Character without MP/MaxMP, so json.Unmarshal leaves both at zero.
	// Recompute MaxMP from the class curve for any caster whose class has
	// a non-zero starting MMP or mp_per_level. Characters saved under the
	// MP system already have MaxMP > 0 and are skipped.
	migrateLegacyMP(party, gd)
	migrateLegacyRows(party, gd)

	var inv inventory.Inventory
	if err := json.Unmarshal(ss.Inventory, &inv); err != nil {
		return nil, fmt.Errorf("unmarshaling inventory: %w", err)
	}
	inv.Normalize()
	inv.DiscoverGemRecipes(gd)

	var quests []generator.Quest
	if err := json.Unmarshal(ss.QuestState, &quests); err != nil {
		return nil, fmt.Errorf("unmarshaling quests: %w", err)
	}

	var worldState struct {
		InteriorTemplates map[string]string           `json:"interior_templates"`
		FinalEncounter    *FinalEncounterProgress     `json:"final_encounter"`
		ActiveDungeonID   string                      `json:"active_dungeon_id"`
		Dungeons          map[string]*DungeonProgress `json:"dungeons"`
		// Dungeon is the pre-catalog save shape. It is migrated into
		// Dungeons below and is no longer emitted by new saves.
		Dungeon                  *DungeonProgress                       `json:"dungeon"`
		CurrentQ                 int                                    `json:"current_quest"`
		Phase                    string                                 `json:"phase"`
		Discovered               map[string]bool                        `json:"discovered"`
		SpellBooks               map[string]*magic.SpellBook            `json:"spell_books"`
		Transport                *transport.State                       `json:"transport"`
		CollectedHiddenItems     map[string]bool                        `json:"collected_hidden_items"`
		TriggeredFlags           map[string]bool                        `json:"triggered_flags"`
		NaturalDiscoveryClaimed  map[string]bool                        `json:"natural_discovery_claimed"`
		NaturalDiscoveryRevealed map[string]bool                        `json:"natural_discovery_revealed"`
		BuildingSideQuests       map[string]generator.BuildingSideQuest `json:"building_side_quests"`
		LastRoundActions         []MemberActionReq                      `json:"last_round_actions"`
		EncounterTravel          EncounterTravelState                   `json:"encounter_travel"`
		WorldEncounterCount      int                                    `json:"world_encounter_count"`
		LootRollSequence         uint64                                 `json:"loot_roll_sequence"`
		BattleRewards            *battleRewardsReceipt                  `json:"battle_rewards"`
		ShopStocks               map[string]*ShopStock                  `json:"shop_stocks"`
		WorldCheckpoint          json.RawMessage                        `json:"world_checkpoint"`
	}
	if err := json.Unmarshal(ss.WorldState, &worldState); err != nil {
		return nil, fmt.Errorf("unmarshaling world state: %w", err)
	}
	quests, worldState.CurrentQ = migrateRequiredCampaign(quests, worldState.CurrentQ)
	refreshPendingCampaignXP(quests, worldState.CurrentQ, gd)
	worldState.FinalEncounter = migrateFinalEncounterProgress(
		worldState.FinalEncounter,
		quests,
		gd.FinalEncounter.QuestTemplateID,
	)

	spawnID := savedQuestSpawn(ss.SpawnNodeID, loc, quests, worldState.CurrentQ)
	generator.PrepareObjectives(quests, loc, spawnID, gd.QuestObjectives)
	walk := locality.Walk(loc, spawnID)
	tileMap := locality.GenerateTileMap(loc, spawnID, walk)

	rng := rand.New(rand.NewPCG(uint64(ss.RNGSeed), 0))

	spellBooks := worldState.SpellBooks
	if spellBooks == nil {
		spellBooks = make(map[string]*magic.SpellBook)
	}

	discovered := worldState.Discovered
	if discovered == nil {
		discovered = make(map[string]bool)
	}

	collectedHidden := worldState.CollectedHiddenItems
	if collectedHidden == nil {
		collectedHidden = make(map[string]bool)
	}
	triggeredFlags := worldState.TriggeredFlags
	if triggeredFlags == nil {
		triggeredFlags = make(map[string]bool)
	}
	legacyNaturalDiscoveryClaims := worldState.NaturalDiscoveryClaimed == nil
	naturalDiscoveryClaimed := worldState.NaturalDiscoveryClaimed
	if naturalDiscoveryClaimed == nil {
		naturalDiscoveryClaimed = make(map[string]bool)
	}
	naturalDiscoveryRevealed := worldState.NaturalDiscoveryRevealed
	if naturalDiscoveryRevealed == nil {
		naturalDiscoveryRevealed = make(map[string]bool)
	}
	buildingSideQuests := worldState.BuildingSideQuests
	if buildingSideQuests == nil {
		buildingSideQuests = make(map[string]generator.BuildingSideQuest)
	}
	shopStocks := worldState.ShopStocks
	if shopStocks == nil {
		shopStocks = make(map[string]*ShopStock)
	}

	dungeons := worldState.Dungeons
	if dungeons == nil {
		dungeons = make(map[string]*DungeonProgress)
	}
	activeDungeonID := worldState.ActiveDungeonID
	if legacy := worldState.Dungeon; legacy != nil {
		legacyID := legacy.ID
		if legacyID == "" && len(gd.Dungeons) > 0 {
			legacyID = gd.Dungeons[0].ID
			legacy.ID = legacyID
		}
		if legacyID != "" && dungeons[legacyID] == nil {
			dungeons[legacyID] = legacy
		}
		if activeDungeonID == "" && legacy.Active {
			activeDungeonID = legacyID
		}
	}
	if activeDungeonID == "" {
		for i := range gd.Dungeons {
			id := gd.Dungeons[i].ID
			if progress := dungeons[id]; progress != nil && progress.Active {
				activeDungeonID = id
				break
			}
		}
	}
	activeDungeon := dungeons[activeDungeonID]
	if activeDungeon == nil {
		activeDungeonID = ""
	}

	legacyTransport := worldState.Transport == nil
	trans := worldState.Transport
	if trans == nil {
		trans = transport.NewState()
	}

	game := &Game{
		savedInteriorTemplates:   worldState.InteriorTemplates,
		finalEncounter:           worldState.FinalEncounter,
		dungeon:                  activeDungeon,
		dungeons:                 dungeons,
		activeDungeonID:          activeDungeonID,
		id:                       fmt.Sprintf("game_%d", time.Now().UnixNano()),
		gd:                       gd,
		rng:                      rng,
		rngSeed:                  ss.RNGSeed,
		loc:                      loc,
		walk:                     walk,
		tileMap:                  tileMap,
		party:                    party,
		spellBooks:               spellBooks,
		inv:                      &inv,
		quests:                   quests,
		buildingSideQuests:       buildingSideQuests,
		currentQ:                 worldState.CurrentQ,
		phase:                    "world", // always resume in world
		diff:                     balance.GetDifficulty(ss.Difficulty),
		discovered:               discovered,
		collectedHiddenItems:     collectedHidden,
		triggeredFlags:           triggeredFlags,
		naturalDiscoveryClaimed:  naturalDiscoveryClaimed,
		naturalDiscoveryRevealed: naturalDiscoveryRevealed,
		worldEncounterCount:      worldState.WorldEncounterCount,
		encounterTravel:          validEncounterTravel(worldState.EncounterTravel),
		lootRollSeq:              worldState.LootRollSequence,
		battleRewards:            worldState.BattleRewards,
		shopStocks:               shopStocks,
		trans:                    trans,
		lastRoundActions:         cloneMemberActionReqs(worldState.LastRoundActions),
		location: LocationState{
			Kind:        LocationWorld,
			WorldNodeID: walk.Spawn.ID,
		},
	}

	if err := game.reconcileDungeonMaterialRewards(); err != nil {
		return nil, fmt.Errorf("restore crafting rewards: %w", err)
	}

	// Saves written before the transport pipeline landed have no transport
	// block. Reconcile by replaying unlock checks against the quest state so
	// the player doesn't get forced back to T1 on a mid/late-game load.
	if legacyTransport {
		game.checkTransportUnlocks()
	}
	game.reconcileNaturalDiscoveryState(legacyNaturalDiscoveryClaims)
	var savedCheckpoint *WorldCheckpoint
	if len(worldState.WorldCheckpoint) > 0 && string(worldState.WorldCheckpoint) != "null" {
		var checkpoint WorldCheckpoint
		if json.Unmarshal(worldState.WorldCheckpoint, &checkpoint) == nil {
			savedCheckpoint = &checkpoint
		}
	}
	dungeonOriginNodeID := ""
	if activeDungeon != nil && activeDungeon.Active {
		if def := game.dungeonDefinitionByID(activeDungeon.ID); def != nil {
			if entry := game.dungeonEntryNode(def); entry != nil {
				dungeonOriginNodeID = entry.ID
			}
		}
	}
	// Accept the exact pre-footbridge map signature, then revalidate the
	// position against the new map. This migration only opens river tiles;
	// arbitrary stale or corrupt map signatures still use normal recovery.
	if savedCheckpoint != nil && savedCheckpoint.MapSignature != worldMapSignature(tileMap) {
		legacyMap := locality.GenerateTileMapBeforeFootbridges(loc, spawnID, walk)
		if savedCheckpoint.MapSignature == worldMapSignature(legacyMap) {
			savedCheckpoint.MapSignature = worldMapSignature(tileMap)
		}
	}
	game.worldCheckpoint = resolveWorldCheckpoint(savedCheckpoint, tileMap, loc, game.worldTraversal(), spawnID, dungeonOriginNodeID)
	if game.worldCheckpoint != nil {
		game.location.WorldNodeID = game.worldCheckpoint.WorldNodeID
		if activeDungeon != nil && activeDungeon.Active {
			if activeDungeon.Origin.WorldNodeID != game.worldCheckpoint.WorldNodeID ||
				(activeDungeon.Origin.Kind != LocationWorld && activeDungeon.Origin.Kind != LocationSettlement) {
				activeDungeon.Origin = LocationState{
					Kind:        LocationWorld,
					WorldNodeID: game.worldCheckpoint.WorldNodeID,
				}
			}
		}
	}

	game.restoreDungeon()
	game.restoreFinalEncounter()
	return game, nil
}

// migrateLegacyMP backfills MP fields on characters loaded from pre-MP-pool
// saves (GDD §8.1 rewrite). Zero MaxMP on a caster class is the signal:
// new characters always land with MaxMP > 0 during character.New().
func migrateLegacyMP(party []*character.Character, gd *gamedata.GameData) {
	for _, c := range party {
		if c == nil || c.MaxMP != 0 {
			continue
		}
		cls := gd.ClassByID(c.ClassID)
		if cls == nil {
			continue
		}
		if cls.StartingStats.MMP == 0 && cls.MPPerLevel == 0 {
			continue
		}
		levels := c.Level - 1
		if levels < 0 {
			levels = 0
		}
		c.MaxMP = cls.StartingStats.MMP + cls.MPPerLevel*levels
		c.CurrentMP = c.MaxMP
	}
}

func migrateLegacyRows(party []*character.Character, gd *gamedata.GameData) {
	for _, c := range party {
		if c == nil || c.Row != "" {
			continue
		}
		c.Row = character.DefaultRow(gd.ClassByID(c.ClassID))
	}
}

// migrateRequiredCampaign removes the old generated side quests that were
// inserted into the linear currentQ route. Their rewards, if already earned,
// remain on the saved party and inventory; unfinished entries are retired so
// loading an older save cannot make optional content a prerequisite for Q12.
func migrateRequiredCampaign(quests []generator.Quest, current int) ([]generator.Quest, int) {
	mainQuests := make([]generator.Quest, 0, len(quests))
	mainBeforeCurrent := 0
	for i, quest := range quests {
		if isLegacyLinearSideQuest(quest) {
			continue
		}
		mainQuests = append(mainQuests, quest)
		if i < current {
			mainBeforeCurrent++
		}
	}
	if mainBeforeCurrent > len(mainQuests) {
		mainBeforeCurrent = len(mainQuests)
	}
	return mainQuests, mainBeforeCurrent
}

func isLegacyLinearSideQuest(quest generator.Quest) bool {
	// The removed campaign generator assigned every inserted side quest an ID
	// of side_<content ID>_<index>. Preserve other optional quest forms so new
	// discovery-driven content remains save compatible.
	return quest.IsSideQuest && strings.HasPrefix(quest.ID, "side_")
}

// migrateFinalEncounterProgress drops finale state created by a retired
// linear side quest. Only progress whose quest ID belongs to the retained,
// authored final quest may survive migration.
func migrateFinalEncounterProgress(progress *FinalEncounterProgress, quests []generator.Quest, finalTemplateID string) *FinalEncounterProgress {
	if progress == nil {
		return nil
	}
	for _, quest := range quests {
		if quest.ID == progress.QuestID && quest.TemplateID == finalTemplateID && !quest.IsPromotion && !quest.IsSideQuest {
			return progress
		}
	}
	return nil
}

// Save API handlers

func (s *Server) handleSaveGame(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	user := auth.UserFromContext(r.Context())
	if user == nil {
		httpError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name          string         `json:"name"`
		WorldPosition *WorldPosition `json:"world_position,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		req.Name = fmt.Sprintf("Save %s", time.Now().Format("Jan 2 15:04"))
	}

	ss, err := game.ToSaveStateWithWorldPosition(req.Name, user.ID, req.WorldPosition)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrInvalidWorldCheckpoint) {
			status = http.StatusBadRequest
		}
		httpError(w, err.Error(), status)
		return
	}

	// Store locality first
	if s.db != nil {
		s.saveLocality(r.Context(), game, user.ID)
	}

	saveSvc := save.NewService(s.db)
	if err := saveSvc.Create(r.Context(), ss); err != nil {
		httpError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResp(w, map[string]string{"status": "saved", "name": ss.Name})
}

// Autosave trigger event labels for display.
var autosaveTriggerLabels = map[string]string{
	"quest_complete":    "Quest Complete",
	"battle_victory":    "Battle Victory",
	"inn_rest":          "Inn Rest",
	"temple_visit":      "Temple Visit",
	"pre_combat":        "Before Combat",
	"level_up":          "Level Up",
	"purchase":          "Equipment Purchase",
	"natural_discovery": "Natural Discovery",
	"timed":             "Timed",
	"victory":           "Victory",
}

func (s *Server) handleAutosave(w http.ResponseWriter, r *http.Request) {
	gameID := r.PathValue("id")
	game := s.games.GetGame(gameID)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	user := auth.UserFromContext(r.Context())
	if user == nil {
		httpError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		TriggerEvent  string         `json:"trigger_event"`
		WorldPosition *WorldPosition `json:"world_position,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.TriggerEvent = "timed"
	}
	if req.TriggerEvent == "" {
		req.TriggerEvent = "timed"
	}

	label := autosaveTriggerLabels[req.TriggerEvent]
	if label == "" {
		label = req.TriggerEvent
	}
	saveName := fmt.Sprintf("Autosave - %s - %s", label, time.Now().Format("3:04pm"))

	ss, err := game.ToSaveStateWithWorldPosition(saveName, user.ID, req.WorldPosition)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrInvalidWorldCheckpoint) {
			status = http.StatusBadRequest
		}
		httpError(w, err.Error(), status)
		return
	}
	ss.SaveType = "autosave"
	ss.TriggerEvent = req.TriggerEvent

	if s.db != nil {
		s.saveLocality(r.Context(), game, user.ID)
	}

	saveSvc := save.NewService(s.db)
	if err := saveSvc.Create(r.Context(), ss); err != nil {
		httpError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Enforce rolling window: keep at most 3 autosaves
	if err := saveSvc.DeleteOldestAutosaves(r.Context(), user.ID, 3); err != nil {
		// Log but don't fail the request
		fmt.Printf("warning: failed to trim autosaves: %v\n", err)
	}

	jsonResp(w, map[string]string{"status": "autosaved", "name": saveName})
}

// A campaign's seed survives save/load and distinguishes separate runs in the
// same locality. Names, party levels and save type can change between snapshots.
func saveAdventureID(state *save.SaveState) string {
	if state.RNGSeed == 0 || state.LocalityID == "" {
		return state.ID // Do not merge legacy saves with incomplete identity.
	}
	identity := fmt.Sprintf("%s/%s/%d", state.UserID, state.LocalityID, state.RNGSeed)
	return fmt.Sprintf("%x", sha256.Sum256([]byte(identity)))
}

func (s *Server) handleListSaves(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		httpError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	saveSvc := save.NewService(s.db)
	saves, err := saveSvc.ListByUser(r.Context(), user.ID)
	if err != nil {
		httpError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Build summary list
	type SaveSummary struct {
		AdventureID  string    `json:"adventure_id"`
		ID           string    `json:"id"`
		Name         string    `json:"name"`
		SaveType     string    `json:"save_type"`
		TriggerEvent string    `json:"trigger_event,omitempty"`
		Flavor       string    `json:"flavor"`
		Difficulty   string    `json:"difficulty"`
		PlayTime     int       `json:"play_time"`
		UpdatedAt    time.Time `json:"updated_at"`
		Party        []string  `json:"party"` // party member names
	}

	var summaries []SaveSummary
	for _, sv := range saves {
		var party []*character.Character
		_ = json.Unmarshal(sv.Party, &party)

		names := make([]string, len(party))
		for i, c := range party {
			names[i] = fmt.Sprintf("%s Lv%d", c.Name, c.Level)
		}

		summaries = append(summaries, SaveSummary{
			ID:           sv.ID,
			AdventureID:  saveAdventureID(&sv),
			Name:         sv.Name,
			SaveType:     sv.SaveType,
			TriggerEvent: sv.TriggerEvent,
			Flavor:       sv.Flavor,
			Difficulty:   sv.Difficulty,
			PlayTime:     sv.PlayTimeSec,
			UpdatedAt:    sv.UpdatedAt,
			Party:        names,
		})
	}

	jsonResp(w, map[string]any{"saves": summaries})
}

func (s *Server) handleLoadSave(w http.ResponseWriter, r *http.Request) {
	saveID := r.PathValue("saveId")

	user := auth.UserFromContext(r.Context())
	if user == nil {
		httpError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	saveSvc := save.NewService(s.db)
	ss, err := saveSvc.Load(r.Context(), saveID, user.ID)
	if err != nil {
		httpError(w, "save not found", http.StatusNotFound)
		return
	}

	// Load the locality
	loc, err := s.loadLocality(r.Context(), ss.LocalityID)
	if err != nil {
		httpError(w, "locality not found", http.StatusNotFound)
		return
	}

	game, err := FromSaveState(ss, s.gd, loc)
	if err != nil {
		httpError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.games.applyInteriorTemplates(game.tileMap, 0)
	if err := s.games.attachSettlementMap(game); err != nil {
		httpError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := s.games.restoreInteriorChoices(game); err != nil {
		httpError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.games.mu.Lock()
	s.games.games[game.id] = game
	s.games.mu.Unlock()

	state := game.State()
	jsonResp(w, state)
}

func (s *Server) handleDeleteSave(w http.ResponseWriter, r *http.Request) {
	saveID := r.PathValue("saveId")
	user := auth.UserFromContext(r.Context())
	if user == nil {
		httpError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if s.db != nil {
		_, err := s.db.Exec(r.Context(), "DELETE FROM saves WHERE id = $1 AND user_id = $2", saveID, user.ID)
		if err != nil {
			httpError(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	jsonResp(w, map[string]string{"status": "deleted"})
}

// Helper: persist locality to DB
func (s *Server) saveLocality(ctx context.Context, game *Game, userID string) {
	if s.db == nil {
		return
	}

	game.mu.Lock()
	loc := game.loc
	game.mu.Unlock()

	graphJSON, err := json.Marshal(loc)
	if err != nil {
		return
	}

	// Upsert locality
	_, _ = s.db.Exec(ctx,
		`INSERT INTO localities (id, user_id, source, name, graph)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (id) DO UPDATE SET graph = EXCLUDED.graph, last_used_at = NOW()`,
		loc.ID, userID, loc.Source, loc.Name, graphJSON)
}

// Helper: load locality from DB
func (s *Server) loadLocality(ctx context.Context, localityID string) (*locality.Locality, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no database")
	}

	var graphJSON []byte
	err := s.db.QueryRow(ctx,
		`SELECT graph FROM localities WHERE id = $1`, localityID).Scan(&graphJSON)
	if err != nil {
		return nil, fmt.Errorf("loading locality: %w", err)
	}

	var loc locality.Locality
	if err := json.Unmarshal(graphJSON, &loc); err != nil {
		return nil, fmt.Errorf("unmarshaling locality: %w", err)
	}

	return &loc, nil
}

// saveLocalityForGame is used by external callers
func (s *Server) SaveLocalityForGame(ctx context.Context, db *pgxpool.Pool, game *Game, userID string) {
	s.saveLocality(ctx, game, userID)
}
