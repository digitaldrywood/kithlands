package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func writePNG(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// Minimal valid PNG: 8-byte signature is enough for existence/mimetype
	// checks; the handler just serves bytes from disk.
	sig := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	if err := os.WriteFile(path, sig, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func TestWalkPNGsSkipsNonPNGsAndMissingDirs(t *testing.T) {
	dir := t.TempDir()
	writePNG(t, filepath.Join(dir, "a.png"))
	writePNG(t, filepath.Join(dir, "sub", "b.PNG"))
	if err := os.WriteFile(filepath.Join(dir, "c.jpg"), []byte("nope"), 0o644); err != nil {
		t.Fatal(err)
	}
	imgs := walkPNGs(dir)
	if got := len(imgs); got != 2 {
		t.Fatalf("expected 2 pngs, got %d (%+v)", got, imgs)
	}

	missing := walkPNGs(filepath.Join(dir, "does-not-exist"))
	if len(missing) != 0 {
		t.Fatalf("missing dir should return empty, got %+v", missing)
	}
}

func TestGlobPNGsRespectsPrefix(t *testing.T) {
	dir := t.TempDir()
	writePNG(t, filepath.Join(dir, "revalidate-01.png"))
	writePNG(t, filepath.Join(dir, "revalidate-02.png"))
	writePNG(t, filepath.Join(dir, "other.png"))

	reval := globPNGs(dir, "revalidate-")
	if len(reval) != 2 {
		t.Fatalf("expected 2 revalidate-*.png, got %d", len(reval))
	}
	all := globPNGs(dir, "")
	if len(all) != 3 {
		t.Fatalf("expected 3 pngs total, got %d", len(all))
	}
}

func TestIsAllowedOnlyAcceptsScannedPaths(t *testing.T) {
	root := t.TempDir()
	scanned := filepath.Join(root, "seen.png")
	unscanned := filepath.Join(root, "never-seen.png")
	writePNG(t, scanned)
	writePNG(t, unscanned)

	s := &scanner{allowPaths: map[string]struct{}{scanned: {}}}
	if !s.isAllowed(scanned) {
		t.Errorf("expected scanned path %q to be allowed", scanned)
	}
	if s.isAllowed(unscanned) {
		t.Errorf("unscanned PNG under same root %q must NOT be allowed", unscanned)
	}
}

func TestHandleImageRejectsUnscannedFileUnderScannedDirectory(t *testing.T) {
	root := t.TempDir()
	scanned := filepath.Join(root, "shown.png")
	sibling := filepath.Join(root, "hidden.png")
	writePNG(t, scanned)
	writePNG(t, sibling)

	s := &scanner{allowPaths: map[string]struct{}{scanned: {}}}
	req := httptest.NewRequest(http.MethodGet, "/img?path="+sibling, nil)
	w := httptest.NewRecorder()
	s.handleImage(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for sibling not surfaced by scan, got %d", w.Code)
	}
}

func TestHandleImageServesExactScanPath(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "ok.png")
	writePNG(t, target)

	s := &scanner{allowPaths: map[string]struct{}{target: {}}}
	req := httptest.NewRequest(http.MethodGet, "/img?path="+target, nil)
	w := httptest.NewRecorder()
	s.handleImage(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body=%q)", w.Code, w.Body.String())
	}
	if !strings.HasPrefix(w.Body.String(), "\x89PNG") {
		t.Fatalf("expected PNG signature in body, got %q", w.Body.String())
	}
}

func TestHandleImageRejectsNonPNG(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "evil.txt")
	if err := os.WriteFile(target, []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := &scanner{allowPaths: map[string]struct{}{target: {}}}
	req := httptest.NewRequest(http.MethodGet, "/img?path="+target, nil)
	w := httptest.NewRecorder()
	s.handleImage(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-png, got %d", w.Code)
	}
}

func TestHandleSourcesReturnsScanResult(t *testing.T) {
	s := &scanner{}
	s.latest = scanResult{
		ScannedAt: 1700000000,
		Groups:    []Group{{ID: "g1", Label: "Group 1", Kind: "pm", Images: []Image{{Path: "/x.png", Name: "x.png"}}}},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/sources", nil)
	w := httptest.NewRecorder()
	s.handleSources(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status: %d", w.Code)
	}

	var got scanResult
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ScannedAt != 1700000000 || len(got.Groups) != 1 || got.Groups[0].ID != "g1" {
		t.Fatalf("unexpected payload: %+v", got)
	}
}

func TestWorktreeLabelStripsPrefix(t *testing.T) {
	cases := map[string]string{
		"/home/x/projects/digitaldrywood/kithlands-issue-250-foo": "issue-250-foo",
		"/some/path/other-repo":                                   "other-repo",
		"/x/kithlands":                                            "kithlands",
	}
	for in, want := range cases {
		if got := worktreeLabel(in); got != want {
			t.Errorf("worktreeLabel(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestScannerRunSurfacesOnlyConfiguredRoots(t *testing.T) {
	base := t.TempDir()
	tmp := filepath.Join(base, "tmp")
	projects := filepath.Join(base, "projects")
	openclaw := filepath.Join(base, "openclaw")

	writePNG(t, filepath.Join(tmp, "revalidate-01.png"))
	writePNG(t, filepath.Join(tmp, "other-tmp.png"))
	writePNG(t, filepath.Join(openclaw, "oc-1.png"))

	// One matching worktree with a .git marker + client/tmp PNG.
	wt := filepath.Join(projects, "kithlands-issue-999-demo")
	if err := os.MkdirAll(wt, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(wt, ".git"), []byte("gitdir: ..\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	writePNG(t, filepath.Join(wt, "client", "tmp", "wt-shot.png"))

	// Unrelated sibling with .git that MUST NOT be scanned.
	other := filepath.Join(projects, "unrelated-repo")
	if err := os.MkdirAll(other, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(other, ".git"), []byte("gitdir: ..\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	writePNG(t, filepath.Join(other, "client", "tmp", "other-shot.png"))

	s := newScanner(scannerConfig{
		projectsDir:  projects,
		openclawDir:  openclaw,
		tmpDir:       tmp,
		worktreeGlob: "kithlands",
	})
	s.run()
	snap := s.snapshot()

	groupIDs := map[string]int{}
	for _, g := range snap.Groups {
		groupIDs[g.ID] = len(g.Images)
	}

	if _, ok := groupIDs["pm-revalidate"]; !ok {
		t.Errorf("missing pm-revalidate group (got groups: %+v)", groupIDs)
	}
	if _, ok := groupIDs["openclaw"]; !ok {
		t.Errorf("missing openclaw group (got groups: %+v)", groupIDs)
	}
	if _, ok := groupIDs["wt-kithlands-issue-999-demo"]; !ok {
		t.Errorf("matching worktree group missing (got groups: %+v)", groupIDs)
	}
	if _, ok := groupIDs["wt-unrelated-repo"]; ok {
		t.Errorf("unrelated sibling was ingested — worktreeGlob is not filtering (got groups: %+v)", groupIDs)
	}
	if _, ok := groupIDs["misc-tmp"]; ok {
		t.Errorf("misc-tmp group should NOT exist — unscoped /tmp scan is a privacy leak (got groups: %+v)", groupIDs)
	}
	if groupIDs["pm-revalidate"] != 1 {
		t.Errorf("pm-revalidate should hold 1 image, got %d", groupIDs["pm-revalidate"])
	}

	// Exact-path allow list must contain every surfaced image and nothing else.
	s.mu.RLock()
	allowed := len(s.allowPaths)
	s.mu.RUnlock()
	if allowed == 0 {
		t.Fatalf("expected allowPaths to be populated after run()")
	}
	// The unrelated sibling's PNG must NOT be in the allow list.
	s.mu.RLock()
	_, otherAllowed := s.allowPaths[filepath.Join(other, "client", "tmp", "other-shot.png")]
	s.mu.RUnlock()
	if otherAllowed {
		t.Errorf("unrelated sibling's PNG ended up in allowPaths")
	}
}

func TestWalkAndGlobSkipSymlinks(t *testing.T) {
	dir := t.TempDir()
	secret := filepath.Join(t.TempDir(), "secret.png")
	writePNG(t, secret)
	writePNG(t, filepath.Join(dir, "real.png"))
	link := filepath.Join(dir, "escape.png")
	if err := os.Symlink(secret, link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}

	glob := globPNGs(dir, "")
	for _, img := range glob {
		if img.Path == link {
			t.Errorf("globPNGs surfaced symlink %q — symlinks must be skipped", link)
		}
	}

	walk := walkPNGs(dir)
	for _, img := range walk {
		if img.Path == link {
			t.Errorf("walkPNGs surfaced symlink %q — symlinks must be skipped", link)
		}
	}
}

func TestWalkPNGsSkipsBrowserCacheDirs(t *testing.T) {
	root := t.TempDir()
	writePNG(t, filepath.Join(root, "proof.png"))
	writePNG(t, filepath.Join(root, "ms-playwright", "chrome", "cached.png"))
	writePNG(t, filepath.Join(root, "xdg-cache", "thumbnails", "thumb.png"))
	writePNG(t, filepath.Join(root, ".cache", "node-gyp", "cache.png"))

	got := walkPNGs(root)
	if len(got) != 1 {
		t.Fatalf("expected only proof.png to survive the skip list, got %d (%+v)", len(got), got)
	}
	if filepath.Base(got[0].Path) != "proof.png" {
		t.Errorf("surfaced unexpected file: %s", got[0].Path)
	}
}

func TestWorktreeDiscoveryPrefersGitWorktreeList(t *testing.T) {
	base := t.TempDir()
	projects := filepath.Join(base, "projects")
	if err := os.MkdirAll(projects, 0o755); err != nil {
		t.Fatal(err)
	}
	// Real worktree set up with `git init`.
	real := filepath.Join(projects, "kithlands-real")
	if err := os.MkdirAll(real, 0o755); err != nil {
		t.Fatal(err)
	}
	// `git init` silently succeeds; if git is missing the test skips.
	if err := exec.Command("git", "-C", real, "init", "-q").Run(); err != nil {
		t.Skipf("git unavailable: %v", err)
	}
	// Prefix-matching sibling that is NOT part of the real worktree — it's
	// its own git repo. git worktree list from `real` must NOT include it.
	impostor := filepath.Join(projects, "kithlands-old")
	if err := os.MkdirAll(impostor, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := exec.Command("git", "-C", impostor, "init", "-q").Run(); err != nil {
		t.Fatal(err)
	}

	dirs := gitWorktreeList(real)
	if len(dirs) == 0 {
		t.Fatalf("gitWorktreeList returned nothing for %s", real)
	}
	for _, d := range dirs {
		if d == impostor {
			t.Errorf("git worktree list must NOT include unrelated sibling repo %q", impostor)
		}
	}
}

func TestCapImages(t *testing.T) {
	in := make([]Image, 500)
	out := capImages(in, 200)
	if len(out) != 200 {
		t.Fatalf("expected 200, got %d", len(out))
	}
	out = capImages(in, 0)
	if len(out) != 500 {
		t.Fatalf("limit=0 should be noop, got %d", len(out))
	}
}

func TestParseListenAddrs(t *testing.T) {
	cases := map[string][]string{
		"127.0.0.1:3999":                         {"127.0.0.1:3999"},
		"127.0.0.1:3999,100.64.0.5:3999":         {"127.0.0.1:3999", "100.64.0.5:3999"},
		"  127.0.0.1:3999 ,, 100.64.0.5:3999  ,": {"127.0.0.1:3999", "100.64.0.5:3999"},
		",,":                                     {},
	}
	for in, want := range cases {
		got := parseListenAddrs(in)
		if len(got) != len(want) {
			t.Errorf("parseListenAddrs(%q) = %v, want %v", in, got, want)
			continue
		}
		for i := range got {
			if got[i] != want[i] {
				t.Errorf("parseListenAddrs(%q)[%d] = %q, want %q", in, i, got[i], want[i])
			}
		}
	}
}
