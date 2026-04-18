package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
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

func TestIsAllowedRejectsOutsideRoots(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	s := &scanner{allowRoots: []string{root}}

	inside := filepath.Join(root, "sub", "a.png")
	if !s.isAllowed(inside) {
		t.Errorf("expected %q to be allowed under %q", inside, root)
	}

	outsidePath := filepath.Join(outside, "a.png")
	if s.isAllowed(outsidePath) {
		t.Errorf("expected %q to be rejected (outside %q)", outsidePath, root)
	}
}

func TestHandleImageRejectsPathsOutsideAllowRoots(t *testing.T) {
	root := t.TempDir()
	other := t.TempDir()
	writePNG(t, filepath.Join(other, "escape.png"))

	s := &scanner{allowRoots: []string{root}}
	req := httptest.NewRequest(http.MethodGet, "/img?path="+filepath.Join(other, "escape.png"), nil)
	w := httptest.NewRecorder()
	s.handleImage(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for path outside allow-roots, got %d", w.Code)
	}
}

func TestHandleImageServesAllowedFile(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "ok.png")
	writePNG(t, target)

	s := &scanner{allowRoots: []string{root}}
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
	s := &scanner{allowRoots: []string{root}}
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
