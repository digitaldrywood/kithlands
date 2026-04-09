package api

import (
	"encoding/json"
	"net/http"

	"github.com/digitaldrywood/kithlands/internal/auth"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
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

func NewServer(db *pgxpool.Pool, gd *gamedata.GameData) *Server {
	return &Server{
		db:     db,
		gd:     gd,
		auth:   auth.NewService(db),
		filter: safety.NewFilter(),
		games:  NewGameManager(gd),
	}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	// Public
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("GET /api/data/classes", s.handleGetClasses)
	mux.HandleFunc("GET /api/data/stats", s.handleGetStats)

	// Protected (auth required)
	mux.Handle("POST /api/wizard", s.auth.Middleware(http.HandlerFunc(s.handleWizard)))
	mux.Handle("POST /api/game/new", s.auth.Middleware(http.HandlerFunc(s.handleNewGame)))
	mux.Handle("GET /api/game/{id}", s.auth.Middleware(http.HandlerFunc(s.handleGetGame)))
	mux.Handle("POST /api/game/{id}/action", s.auth.Middleware(http.HandlerFunc(s.handleGameAction)))
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

func jsonResp(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func httpError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
