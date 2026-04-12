package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// TestTurnSnapshotRoundTrips protects the on-disk schema: a populated
// snapshot must survive a JSON marshal/unmarshal cycle with every field
// intact. If this breaks, existing capture files become unreadable.
func TestTurnSnapshotRoundTrips(t *testing.T) {
	orig := TurnSnapshot{
		SchemaVersion: TurnSnapshotSchemaVersion,
		Seed:          42,
		Strategy:      "cautious",
		Turn:          17,
		CapturedAt:    "2026-04-11T12:34:56Z",
		PreState: &api.GameState{
			ID:       "game-1",
			Phase:    "combat",
			Gold:     250,
			Party:    []api.PartyMemberState{{Name: "Wulfgar", Level: 5, HP: 40, MaxHP: 50}},
			Enemies:  []api.EnemyState{{ID: 1, Name: "Slime", HP: 10, MaxHP: 10}},
			CurrentQ: 2,
		},
		Action: &api.GameActionRequest{
			Type: "",
			Actions: []api.MemberActionReq{
				{Slot: 0, Type: "attack", TargetID: 1},
			},
		},
		PostState: &api.GameState{
			ID:        "game-1",
			Phase:     "combat",
			Gold:      250,
			Party:     []api.PartyMemberState{{Name: "Wulfgar", Level: 5, HP: 40, MaxHP: 50}},
			Enemies:   []api.EnemyState{{ID: 1, Name: "Slime", HP: 2, MaxHP: 10}},
			CombatLog: []string{"Wulfgar attacks Slime for 8 damage."},
		},
		CombatLog: []string{"Wulfgar attacks Slime for 8 damage."},
	}

	data, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got TurnSnapshot
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if got.SchemaVersion != orig.SchemaVersion {
		t.Errorf("schema_version: got %d, want %d", got.SchemaVersion, orig.SchemaVersion)
	}
	if got.Seed != orig.Seed || got.Strategy != orig.Strategy || got.Turn != orig.Turn {
		t.Errorf("seed/strategy/turn mismatch: got %+v", got)
	}
	if got.PreState == nil || got.PreState.Phase != "combat" {
		t.Errorf("pre_state lost: %+v", got.PreState)
	}
	if got.PostState == nil || len(got.PostState.Enemies) != 1 || got.PostState.Enemies[0].HP != 2 {
		t.Errorf("post_state lost: %+v", got.PostState)
	}
	if got.Action == nil || len(got.Action.Actions) != 1 || got.Action.Actions[0].Type != "attack" {
		t.Errorf("action lost: %+v", got.Action)
	}
	if len(got.CombatLog) != 1 {
		t.Errorf("combat_log lost: %+v", got.CombatLog)
	}
}

// TestCaptureHookSeedFilter verifies that PauseEvents from non-target seeds
// are silently ignored — no files, no pending buffer leaks.
func TestCaptureHookSeedFilter(t *testing.T) {
	dir := t.TempDir()
	hook, err := NewCaptureHook(CaptureConfig{TargetSeed: 42, TargetTurn: -1, OutDir: dir})
	if err != nil {
		t.Fatalf("NewCaptureHook: %v", err)
	}
	ev := mockEvent(HookBeforeAction, 99, 0)
	if err := hook(ev); err != nil {
		t.Fatalf("before: %v", err)
	}
	ev.Phase = HookAfterAction
	if err := hook(ev); err != nil {
		t.Fatalf("after: %v", err)
	}
	if files := listJSON(t, dir); len(files) != 0 {
		t.Errorf("expected 0 files for non-matching seed, got %d: %v", len(files), files)
	}
}

// TestCaptureHookTurnFilter verifies TargetTurn=N writes exactly one file
// for that turn when fed events across a range of turns.
func TestCaptureHookTurnFilter(t *testing.T) {
	dir := t.TempDir()
	hook, err := NewCaptureHook(CaptureConfig{TargetSeed: 42, TargetTurn: 5, OutDir: dir})
	if err != nil {
		t.Fatalf("NewCaptureHook: %v", err)
	}
	for turn := 0; turn < 10; turn++ {
		if err := hook(mockEvent(HookBeforeAction, 42, turn)); err != nil {
			t.Fatalf("before turn %d: %v", turn, err)
		}
		if err := hook(mockEvent(HookAfterAction, 42, turn)); err != nil {
			t.Fatalf("after turn %d: %v", turn, err)
		}
	}
	files := listJSON(t, dir)
	if len(files) != 1 {
		t.Fatalf("expected 1 file, got %d: %v", len(files), files)
	}
	if !strings.Contains(files[0], "turn-0005") {
		t.Errorf("expected turn-0005 file, got %q", files[0])
	}
}

// TestCaptureHookEveryTurn verifies TargetTurn=-1 captures every turn of
// the target seed.
func TestCaptureHookEveryTurn(t *testing.T) {
	dir := t.TempDir()
	hook, err := NewCaptureHook(CaptureConfig{TargetSeed: 42, TargetTurn: -1, OutDir: dir})
	if err != nil {
		t.Fatalf("NewCaptureHook: %v", err)
	}
	const n = 5
	for turn := 0; turn < n; turn++ {
		if err := hook(mockEvent(HookBeforeAction, 42, turn)); err != nil {
			t.Fatal(err)
		}
		if err := hook(mockEvent(HookAfterAction, 42, turn)); err != nil {
			t.Fatal(err)
		}
	}
	files := listJSON(t, dir)
	if len(files) != n {
		t.Fatalf("expected %d files, got %d: %v", n, len(files), files)
	}
}

// TestRunOneInvokesPauseHookInOrder runs a real playthrough and asserts
// that every Before is followed by an After on the same turn, turn numbers
// are monotonic, and the count aligns with res.TurnsElapsed.
func TestRunOneInvokesPauseHookInOrder(t *testing.T) {
	gd := gamedata.Load("../../../shared")

	type rec struct {
		phase HookPhase
		turn  int
	}
	var events []rec
	opts := DefaultRunOptions()
	opts.PauseHook = func(ev PauseEvent) error {
		events = append(events, rec{phase: ev.Phase, turn: ev.Turn})
		return nil
	}

	res, err := RunOne(gd, "../../../shared", 42, &CautiousStrategy{}, opts)
	if err != nil {
		t.Fatalf("RunOne: %v", err)
	}
	if len(events) == 0 {
		t.Fatal("no hook events recorded")
	}
	if len(events)%2 != 0 {
		t.Fatalf("events should come in before/after pairs, got %d", len(events))
	}
	lastTurn := -1
	for i := 0; i < len(events); i += 2 {
		b, a := events[i], events[i+1]
		if b.phase != HookBeforeAction || a.phase != HookAfterAction {
			t.Fatalf("pair %d not before/after: %+v %+v", i/2, b, a)
		}
		if b.turn != a.turn {
			t.Fatalf("pair %d turns mismatch: before=%d after=%d", i/2, b.turn, a.turn)
		}
		if b.turn < lastTurn {
			t.Fatalf("turn went backwards at pair %d: %d < %d", i/2, b.turn, lastTurn)
		}
		lastTurn = b.turn
	}
	pairs := len(events) / 2
	// Promotion turns skip ProcessAction so the hook fires fewer times
	// than TurnsElapsed; it must never exceed TurnsElapsed.
	if pairs > res.TurnsElapsed {
		t.Errorf("hook pairs %d exceeds TurnsElapsed %d", pairs, res.TurnsElapsed)
	}
}

// TestRunOneCaptureEndToEnd wires a real CaptureHook into a short run and
// verifies files are produced with the expected shape.
func TestRunOneCaptureEndToEnd(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	dir := t.TempDir()
	hook, err := NewCaptureHook(CaptureConfig{TargetSeed: 42, TargetTurn: -1, OutDir: dir})
	if err != nil {
		t.Fatalf("NewCaptureHook: %v", err)
	}
	opts := DefaultRunOptions()
	opts.MaxTurns = 50 // keep the test fast — we only need to see capture work
	opts.PauseHook = hook

	if _, err := RunOne(gd, "../../../shared", 42, &CautiousStrategy{}, opts); err != nil {
		t.Fatalf("RunOne: %v", err)
	}

	files := listJSON(t, dir)
	if len(files) == 0 {
		t.Fatal("no capture files written")
	}

	path := filepath.Join(dir, files[0])
	raw, err := os.ReadFile(path) // #nosec G304 -- test-only, temp dir
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var snap TurnSnapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		t.Fatalf("unmarshal %s: %v", path, err)
	}
	if snap.SchemaVersion != TurnSnapshotSchemaVersion {
		t.Errorf("schema_version: got %d, want %d", snap.SchemaVersion, TurnSnapshotSchemaVersion)
	}
	if snap.Seed != 42 {
		t.Errorf("seed: got %d, want 42", snap.Seed)
	}
	if snap.Strategy != "cautious" {
		t.Errorf("strategy: got %q, want cautious", snap.Strategy)
	}
	if snap.PreState == nil {
		t.Error("pre_state is nil")
	}
	if snap.Action == nil {
		t.Error("action is nil")
	}
	if snap.PostState == nil {
		t.Error("post_state is nil")
	}
	if snap.CapturedAt == "" {
		t.Error("captured_at is empty")
	}
}

// TestNilPauseHookIsZeroOverhead is a structural guard: a nil PauseHook
// must never be invoked. If someone edits the turn loop and forgets the
// nil-guard, this test panics.
func TestNilPauseHookIsZeroOverhead(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	opts := DefaultRunOptions()
	opts.MaxTurns = 10
	// PauseHook left nil on purpose.
	if _, err := RunOne(gd, "../../../shared", 42, &CautiousStrategy{}, opts); err != nil {
		t.Fatalf("RunOne with nil hook: %v", err)
	}
}

// --- helpers ---

func mockEvent(phase HookPhase, seed int64, turn int) PauseEvent {
	return PauseEvent{
		Phase:    phase,
		Seed:     seed,
		Strategy: "test",
		Turn:     turn,
		State:    &api.GameState{ID: "test", Phase: "world"},
		Action:   &api.GameActionRequest{Type: "advance"},
	}
}

func listJSON(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("readdir %s: %v", dir, err)
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	return out
}
