package api

import "net/http"

// The public catalog contains base definitions, before encounter scaling.
// Per-save discovery state is returned separately in GameState.Discovered.
func (s *Server) handleGetMonsters(w http.ResponseWriter, r *http.Request) {
	jsonResp(w, s.gd.Monsters)
}
