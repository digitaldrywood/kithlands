package api

import (
	"encoding/json"
	"net/http"

	"github.com/digitaldrywood/kithlands/internal/auth"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/safety"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	db     *pgxpool.Pool
	gd     *gamedata.GameData
	auth   *auth.Service
	filter *safety.Filter
	games  *GameManager
}

func NewServer(db *pgxpool.Pool, gd *gamedata.GameData, sharedDir string) *Server {
	s := &Server{
		db:     db,
		gd:     gd,
		filter: safety.NewFilter(),
		games:  NewGameManager(gd, sharedDir),
	}
	if db != nil {
		s.auth = auth.NewService(db)
	}
	return s
}

func (s *Server) GetGameManager() *GameManager {
	return s.games
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	// Public
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("GET /api/data/classes", s.handleGetClasses)
	mux.HandleFunc("GET /api/data/stats", s.handleGetStats)

	// Protected (auth required)
	mux.Handle("POST /api/osm/preview", s.auth.Middleware(http.HandlerFunc(s.handleOSMPreview)))
	mux.Handle("POST /api/geocode", s.auth.Middleware(http.HandlerFunc(s.handleGeocode)))
	mux.Handle("POST /api/wizard", s.auth.Middleware(http.HandlerFunc(s.handleWizard)))
	mux.Handle("POST /api/game/new", s.auth.Middleware(http.HandlerFunc(s.handleNewGame)))
	mux.Handle("GET /api/game/{id}", s.auth.Middleware(http.HandlerFunc(s.handleGetGame)))
	mux.Handle("POST /api/game/{id}/action", s.auth.Middleware(http.HandlerFunc(s.handleGameAction)))
	mux.Handle("POST /api/game/{id}/promote", s.auth.Middleware(http.HandlerFunc(s.handlePromote)))
	mux.Handle("GET /api/game/{id}/shop/{nodeId}", s.auth.Middleware(http.HandlerFunc(s.handleShop)))
	mux.Handle("GET /api/game/{id}/npc/{nodeId}/talk", s.auth.Middleware(http.HandlerFunc(s.handleNPCTalk)))
	mux.Handle("POST /api/game/{id}/buy", s.auth.Middleware(http.HandlerFunc(s.handleBuy)))
	mux.Handle("POST /api/game/{id}/equip", s.auth.Middleware(http.HandlerFunc(s.handleEquip)))
	mux.Handle("POST /api/game/{id}/learn", s.auth.Middleware(http.HandlerFunc(s.handleLearnSpell)))

	// Save/Load
	mux.Handle("POST /api/game/{id}/save", s.auth.Middleware(http.HandlerFunc(s.handleSaveGame)))
	mux.Handle("POST /api/game/{id}/autosave", s.auth.Middleware(http.HandlerFunc(s.handleAutosave)))
	mux.Handle("GET /api/saves", s.auth.Middleware(http.HandlerFunc(s.handleListSaves)))
	mux.Handle("POST /api/saves/{saveId}/load", s.auth.Middleware(http.HandlerFunc(s.handleLoadSave)))
	mux.Handle("DELETE /api/saves/{saveId}", s.auth.Middleware(http.HandlerFunc(s.handleDeleteSave)))
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	if msg := s.filter.CheckInput(req.Email); msg != "" {
		httpError(w, msg, http.StatusBadRequest)
		return
	}

	token, err := s.auth.RegisterOrLogin(r.Context(), req.Email)
	if err != nil {
		httpError(w, "login failed", http.StatusInternalServerError)
		return
	}

	jsonResp(w, map[string]string{"token": token})
}

func (s *Server) handleGeocode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Query string `json:"query"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Query == "" {
		httpError(w, "query required", http.StatusBadRequest)
		return
	}

	result, err := locality.Geocode(r.Context(), req.Query)
	if err != nil {
		httpError(w, err.Error(), http.StatusNotFound)
		return
	}

	jsonResp(w, result)
}

func (s *Server) handleGetClasses(w http.ResponseWriter, r *http.Request) {
	jsonResp(w, s.gd.Classes)
}

func (s *Server) handleGetStats(w http.ResponseWriter, r *http.Request) {
	jsonResp(w, s.gd.Stats)
}

func (s *Server) handleWizard(w http.ResponseWriter, r *http.Request) {
	var req WizardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Validate all inputs through safety filter
	if msg := s.filter.CheckInput(req.TownName); msg != "" {
		httpError(w, "town name: "+msg, http.StatusBadRequest)
		return
	}
	for _, p := range req.People {
		if msg := s.filter.CheckInput(p.Name); msg != "" {
			httpError(w, "person name: "+msg, http.StatusBadRequest)
			return
		}
	}
	for _, p := range req.Places {
		if msg := s.filter.CheckInput(p); msg != "" {
			httpError(w, "place name: "+msg, http.StatusBadRequest)
			return
		}
	}

	loc := buildLocality(req)
	jsonResp(w, loc)
}

func (s *Server) handleNewGame(w http.ResponseWriter, r *http.Request) {
	var req NewGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	game, err := s.games.CreateGame(req)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonResp(w, game.State())
}

func (s *Server) handleGetGame(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	game := s.games.GetGame(id)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	jsonResp(w, game.State())
}

func (s *Server) handleGameAction(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	game := s.games.GetGame(id)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req GameActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	result, err := game.ProcessAction(req)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonResp(w, result)
}

func (s *Server) handlePromote(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	game := s.games.GetGame(id)
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}

	var req PromoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}

	result, err := game.Promote(req.Accept)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, result)
}

func (s *Server) handleOSMPreview(w http.ResponseWriter, r *http.Request) {
	var req OSMPreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Lat == 0 && req.Lng == 0 {
		httpError(w, "lat and lng required", http.StatusBadRequest)
		return
	}
	if req.RadiusMiles <= 0 {
		req.RadiusMiles = 1.5
	}

	radiusM := milesToMeters(req.RadiusMiles)
	nodes, actualRadiusM, err := locality.PreviewOSM(r.Context(), req.Lat, req.Lng, radiusM)
	if err != nil {
		httpError(w, "OSM query failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	// Convert locality.Node to OSMPreviewNode for JSON response
	var previewNodes []OSMPreviewNode
	for _, n := range nodes {
		pn := OSMPreviewNode{
			ID:         n.ID,
			Name:       n.Name,
			Kind:       string(n.Kind),
			Tags:       n.Tags,
			Importance: n.Importance,
		}
		if n.Coord != nil {
			pn.Lat = n.Coord.Lat
			pn.Lng = n.Coord.Lng
		}
		previewNodes = append(previewNodes, pn)
	}

	resp := OSMPreviewResponse{
		Nodes:       previewNodes,
		RadiusMiles: float64(actualRadiusM) / 1609.34,
		Cached:      false,
	}
	jsonResp(w, resp)
}

func jsonResp(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(data)
}

func httpError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
