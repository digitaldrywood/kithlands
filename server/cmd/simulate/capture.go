package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/digitaldrywood/kithlands/api"
)

// TurnSnapshotSchemaVersion is bumped whenever the on-disk TurnSnapshot
// shape changes in a way that breaks readers. Viewers should refuse
// snapshots whose schema_version they do not recognize.
const TurnSnapshotSchemaVersion = 1

// TurnSnapshot is the on-disk artifact for a single captured turn. It
// contains everything a future viewer needs to reconstruct the screen at
// that turn: the state the strategy saw, the action it picked, and the
// state the server returned after executing the action.
type TurnSnapshot struct {
	SchemaVersion int                    `json:"schema_version"`
	Seed          int64                  `json:"seed"`
	Strategy      string                 `json:"strategy"`
	Turn          int                    `json:"turn"`
	CapturedAt    string                 `json:"captured_at"`
	PreState      *api.GameState         `json:"pre_state"`
	Action        *api.GameActionRequest `json:"action"`
	PostState     *api.GameState         `json:"post_state,omitempty"`
	Error         string                 `json:"error,omitempty"`
	CombatLog     []string               `json:"combat_log,omitempty"`
}

// CaptureConfig controls which PauseEvents produce on-disk snapshots.
type CaptureConfig struct {
	TargetSeed int64
	TargetTurn int
	OutDir     string
}

type captureWriter struct {
	cfg     CaptureConfig
	mu      sync.Mutex
	pending map[captureKey]pendingTurn
	now     func() time.Time
}

type captureKey struct {
	seed int64
	turn int
}

type pendingTurn struct {
	preState *api.GameState
	action   *api.GameActionRequest
	strategy string
}

// NewCaptureHook constructs a PauseHook that writes TurnSnapshot JSON files
// to cfg.OutDir. It filters events to cfg.TargetSeed and, if cfg.TargetTurn
// is >= 0, to that specific turn. Returns an error if OutDir is empty or
// cannot be created.
func NewCaptureHook(cfg CaptureConfig) (PauseHook, error) {
	if cfg.OutDir == "" {
		return nil, errors.New("capture: OutDir is required")
	}
	if err := os.MkdirAll(cfg.OutDir, 0o750); err != nil {
		return nil, fmt.Errorf("capture: mkdir %s: %w", cfg.OutDir, err)
	}
	w := &captureWriter{
		cfg:     cfg,
		pending: make(map[captureKey]pendingTurn),
		now:     time.Now,
	}
	return w.handle, nil
}

func (w *captureWriter) interested(seed, turn int64) bool {
	if seed != w.cfg.TargetSeed {
		return false
	}
	if w.cfg.TargetTurn >= 0 && int(turn) != w.cfg.TargetTurn {
		return false
	}
	return true
}

func (w *captureWriter) handle(ev PauseEvent) error {
	if !w.interested(ev.Seed, int64(ev.Turn)) {
		return nil
	}
	key := captureKey{seed: ev.Seed, turn: ev.Turn}

	switch ev.Phase {
	case HookBeforeAction:
		w.mu.Lock()
		w.pending[key] = pendingTurn{
			preState: cloneGameState(ev.State),
			action:   cloneAction(ev.Action),
			strategy: ev.Strategy,
		}
		w.mu.Unlock()
		return nil

	case HookAfterAction:
		w.mu.Lock()
		pending, ok := w.pending[key]
		if ok {
			delete(w.pending, key)
		}
		w.mu.Unlock()
		if !ok {
			// No matching Before — this can happen if the hook was
			// installed mid-run or the Before was filtered out. Skip.
			return nil
		}

		snap := TurnSnapshot{
			SchemaVersion: TurnSnapshotSchemaVersion,
			Seed:          ev.Seed,
			Strategy:      pending.strategy,
			Turn:          ev.Turn,
			CapturedAt:    w.now().UTC().Format(time.RFC3339Nano),
			PreState:      pending.preState,
			Action:        pending.action,
			PostState:     cloneGameState(ev.State),
		}
		if ev.Err != nil {
			snap.Error = ev.Err.Error()
		}
		if snap.PostState != nil {
			snap.CombatLog = append([]string(nil), snap.PostState.CombatLog...)
		}
		return w.writeSnapshot(snap)
	}
	return nil
}

func (w *captureWriter) writeSnapshot(snap TurnSnapshot) error {
	name := fmt.Sprintf("seed-%d-%s-turn-%04d.json", snap.Seed, sanitizeStrategy(snap.Strategy), snap.Turn)
	path := filepath.Join(w.cfg.OutDir, name)
	data, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return fmt.Errorf("capture: marshal turn %d: %w", snap.Turn, err)
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("capture: write %s: %w", path, err)
	}
	return nil
}

// cloneGameState returns a deep copy of s via JSON round-trip. The run
// loop aliases *GameState across turns (game.ProcessAction returns a
// pointer into the Game's internal buffers), so capturing a raw pointer
// would let subsequent turns mutate already-emitted snapshots before the
// After phase had a chance to serialize them.
func cloneGameState(s *api.GameState) *api.GameState {
	if s == nil {
		return nil
	}
	data, err := json.Marshal(s)
	if err != nil {
		return nil
	}
	var out api.GameState
	if err := json.Unmarshal(data, &out); err != nil {
		return nil
	}
	return &out
}

func cloneAction(a *api.GameActionRequest) *api.GameActionRequest {
	if a == nil {
		return nil
	}
	cp := *a
	if a.Actions != nil {
		cp.Actions = append([]api.MemberActionReq(nil), a.Actions...)
	}
	return &cp
}

func sanitizeStrategy(s string) string {
	if s == "" {
		return "unknown"
	}
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '_', c == '-':
			out = append(out, c)
		default:
			out = append(out, '_')
		}
	}
	return string(out)
}
