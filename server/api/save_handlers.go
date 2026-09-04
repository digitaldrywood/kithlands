package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"net/http"
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
	g.mu.Lock()
	defer g.mu.Unlock()

	if (g.inDungeon() || g.finalEncounterActive()) && g.phase == "combat" {
		return nil, fmt.Errorf("finish or flee the encounter before saving")
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
		"dungeon":                g.dungeon,
		"final_encounter":        g.finalEncounter,
		"current_quest":          g.currentQ,
		"phase":                  g.phase,
		"discovered":             g.discovered,
		"spell_books":            g.spellBooks,
		"transport":              g.trans,
		"collected_hidden_items": g.collectedHiddenItems,
		"triggered_flags":        g.triggeredFlags,
		"building_side_quests":   g.buildingSideQuests,
		"last_round_actions":     g.lastRoundActions,
		"world_encounter_count":  g.worldEncounterCount,
		"loot_roll_sequence":     g.lootRollSeq,
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
		SpawnNodeID: g.loc.Nodes[0].ID,
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
		FinalEncounter       *FinalEncounterProgress                `json:"final_encounter"`
		Dungeon              *DungeonProgress                       `json:"dungeon"`
		CurrentQ             int                                    `json:"current_quest"`
		Phase                string                                 `json:"phase"`
		Discovered           map[string]bool                        `json:"discovered"`
		SpellBooks           map[string]*magic.SpellBook            `json:"spell_books"`
		Transport            *transport.State                       `json:"transport"`
		CollectedHiddenItems map[string]bool                        `json:"collected_hidden_items"`
		TriggeredFlags       map[string]bool                        `json:"triggered_flags"`
		BuildingSideQuests   map[string]generator.BuildingSideQuest `json:"building_side_quests"`
		LastRoundActions     []MemberActionReq                      `json:"last_round_actions"`
		WorldEncounterCount  int                                    `json:"world_encounter_count"`
		LootRollSequence     uint64                                 `json:"loot_roll_sequence"`
	}
	if err := json.Unmarshal(ss.WorldState, &worldState); err != nil {
		return nil, fmt.Errorf("unmarshaling world state: %w", err)
	}

	generator.PrepareObjectives(quests, loc, loc.Nodes[0].ID, gd.QuestObjectives)
	walk := locality.Walk(loc, loc.Nodes[0].ID)
	tileMap := locality.GenerateTileMap(loc, loc.Nodes[0].ID, walk)

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
	buildingSideQuests := worldState.BuildingSideQuests
	if buildingSideQuests == nil {
		buildingSideQuests = make(map[string]generator.BuildingSideQuest)
	}

	legacyTransport := worldState.Transport == nil
	trans := worldState.Transport
	if trans == nil {
		trans = transport.NewState()
	}

	game := &Game{
		finalEncounter:       worldState.FinalEncounter,
		dungeon:              worldState.Dungeon,
		id:                   fmt.Sprintf("game_%d", time.Now().UnixNano()),
		gd:                   gd,
		rng:                  rng,
		rngSeed:              ss.RNGSeed,
		loc:                  loc,
		walk:                 walk,
		tileMap:              tileMap,
		party:                party,
		spellBooks:           spellBooks,
		inv:                  &inv,
		quests:               quests,
		buildingSideQuests:   buildingSideQuests,
		currentQ:             worldState.CurrentQ,
		phase:                "world", // always resume in world
		diff:                 balance.GetDifficulty(ss.Difficulty),
		discovered:           discovered,
		collectedHiddenItems: collectedHidden,
		triggeredFlags:       triggeredFlags,
		worldEncounterCount:  worldState.WorldEncounterCount,
		lootRollSeq:          worldState.LootRollSequence,
		trans:                trans,
		lastRoundActions:     cloneMemberActionReqs(worldState.LastRoundActions),
		location: LocationState{
			Kind:        LocationWorld,
			WorldNodeID: walk.Spawn.ID,
		},
	}

	// Saves written before the transport pipeline landed have no transport
	// block. Reconcile by replaying unlock checks against the quest state so
	// the player doesn't get forced back to T1 on a mid/late-game load.
	if legacyTransport {
		game.checkTransportUnlocks()
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
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		req.Name = fmt.Sprintf("Save %s", time.Now().Format("Jan 2 15:04"))
	}

	ss, err := game.ToSaveState(req.Name, user.ID)
	if err != nil {
		httpError(w, err.Error(), http.StatusInternalServerError)
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
	"quest_complete": "Quest Complete",
	"battle_victory": "Battle Victory",
	"inn_rest":       "Inn Rest",
	"temple_visit":   "Temple Visit",
	"pre_combat":     "Before Combat",
	"level_up":       "Level Up",
	"purchase":       "Equipment Purchase",
	"timed":          "Timed",
	"victory":        "Victory",
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
		TriggerEvent string `json:"trigger_event"`
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

	ss, err := game.ToSaveState(saveName, user.ID)
	if err != nil {
		httpError(w, err.Error(), http.StatusInternalServerError)
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
	s.games.applyInteriorTemplates(game.tileMap)
	if err := s.games.attachSettlementMap(game); err != nil {
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
		 ON CONFLICT (id) DO UPDATE SET last_used_at = NOW()`,
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
