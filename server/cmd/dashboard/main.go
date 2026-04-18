// Dashboard is a dev-only local HTTP server that aggregates PM/worker
// screenshots from every active Kithlands worktree and exposes them as a
// single dark-themed web UI. It is never shipped to users and has no auth —
// it is intended to live behind Tailscale, which means the default listen
// address is loopback only; pass -listen 0.0.0.0:3999 (or the Tailscale IP)
// to expose the server beyond the host.
package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed index.html
var staticFS embed.FS

// maxImagesPerGroup caps how many thumbnails a single tab holds. Keeps both
// the rescan cost and JSON payload bounded when a worktree's
// client/test-results accumulates thousands of Playwright artifacts.
const maxImagesPerGroup = 200

type Image struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	ModTime int64  `json:"mod_time"`
	Size    int64  `json:"size"`
}

type Group struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	Kind   string  `json:"kind"`
	Images []Image `json:"images"`
}

type scanResult struct {
	ScannedAt int64   `json:"scanned_at"`
	Groups    []Group `json:"groups"`
}

// dirCacheEntry remembers the walk result for a directory so we can skip the
// full recursive walk when nothing in the tree has changed since the last
// scan. We use the directory's own mtime as a coarse invalidation signal:
// most scanners (Playwright, PM revalidation scripts, walk-sheet generators)
// touch the parent mtime when they write a new file.
type dirCacheEntry struct {
	mtime   int64
	entries []Image
}

type scanner struct {
	mu          sync.RWMutex
	latest      scanResult
	allowPaths  map[string]struct{}
	projectsDir string
	openclawDir string
	tmpDir      string

	// walkCache keys the last walk of a recursive root by its stat mtime.
	// Serialized via mu alongside the scan result.
	walkCache map[string]dirCacheEntry
}

type scannerConfig struct {
	projectsDir string // parent dir that holds sibling kithlands-* worktrees
	openclawDir string
	tmpDir      string
}

func defaultScannerConfig() scannerConfig {
	home, _ := os.UserHomeDir()
	if home == "" {
		if u, err := user.Current(); err == nil {
			home = u.HomeDir
		}
	}
	projects := ""
	// Derive the projects dir from the running binary's repo root: go up one
	// level from the repo so the dashboard works in any clone path.
	if wd, err := os.Getwd(); err == nil {
		parent := filepath.Dir(wd)
		if fi, err := os.Stat(parent); err == nil && fi.IsDir() {
			projects = parent
		}
	}
	if projects == "" && home != "" {
		projects = filepath.Join(home, "projects", "digitaldrywood")
	}
	return scannerConfig{
		projectsDir: projects,
		openclawDir: filepath.Join(home, ".openclaw", "workspace", "tmp"),
		tmpDir:      "/tmp",
	}
}

func newScanner(cfg scannerConfig) *scanner {
	return &scanner{
		projectsDir: cfg.projectsDir,
		openclawDir: cfg.openclawDir,
		tmpDir:      cfg.tmpDir,
		walkCache:   map[string]dirCacheEntry{},
	}
}

func (s *scanner) worktreeDirs() []string {
	if s.projectsDir == "" {
		return nil
	}
	entries, err := os.ReadDir(s.projectsDir)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path := filepath.Join(s.projectsDir, e.Name())
		// Require a .git entry (worktree or repo) before treating as source.
		if _, err := os.Stat(filepath.Join(path, ".git")); err != nil {
			continue
		}
		out = append(out, path)
	}
	sort.Strings(out)
	return out
}

// walkPNGs recursively walks root collecting every *.png file. Returns
// silently on errors (directories might not exist — that is expected).
func walkPNGs(root string) []Image {
	var imgs []Image
	_ = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			// Skip common noise dirs.
			base := d.Name()
			if base == "node_modules" || base == ".git" || base == "vendor" {
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(strings.ToLower(d.Name()), ".png") {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		imgs = append(imgs, Image{
			Path:    p,
			Name:    d.Name(),
			ModTime: info.ModTime().Unix(),
			Size:    info.Size(),
		})
		return nil
	})
	return imgs
}

// cachedWalkPNGs walks `root` unless the directory subtree looks unchanged
// since the previous scan (stat mtime of the root matches the cached value).
// The root mtime is a deliberately coarse signal — it catches the common
// Playwright / script "new file landed in a known dir" case without a real
// fsnotify dependency.
func (s *scanner) cachedWalkPNGs(root string) []Image {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil
	}
	mtime := info.ModTime().Unix()

	s.mu.RLock()
	prev, ok := s.walkCache[root]
	s.mu.RUnlock()
	if ok && prev.mtime == mtime {
		return prev.entries
	}

	imgs := walkPNGs(root)

	s.mu.Lock()
	s.walkCache[root] = dirCacheEntry{mtime: mtime, entries: imgs}
	s.mu.Unlock()
	return imgs
}

// globPNGs returns PNGs directly inside dir (non-recursive) that match an
// optional prefix filter (empty prefix = all .png).
func globPNGs(dir, prefix string) []Image {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var imgs []Image
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		lower := strings.ToLower(name)
		if !strings.HasSuffix(lower, ".png") {
			continue
		}
		if prefix != "" && !strings.HasPrefix(name, prefix) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		imgs = append(imgs, Image{
			Path:    filepath.Join(dir, name),
			Name:    name,
			ModTime: info.ModTime().Unix(),
			Size:    info.Size(),
		})
	}
	return imgs
}

func sortByNewest(imgs []Image) {
	sort.Slice(imgs, func(i, j int) bool {
		return imgs[i].ModTime > imgs[j].ModTime
	})
}

func capImages(imgs []Image, limit int) []Image {
	if limit > 0 && len(imgs) > limit {
		return imgs[:limit]
	}
	return imgs
}

// worktreeLabel turns a directory name into something a human can read in a
// tab header. Strips the leading repo prefix when present.
func worktreeLabel(dir string) string {
	base := filepath.Base(dir)
	if strings.HasPrefix(base, "kithlands-") {
		return strings.TrimPrefix(base, "kithlands-")
	}
	return base
}

func (s *scanner) run() {
	groups := make([]Group, 0, 16)
	allow := make(map[string]struct{}, 128)
	addGroup := func(g Group) {
		g.Images = capImages(g.Images, maxImagesPerGroup)
		for _, img := range g.Images {
			allow[img.Path] = struct{}{}
		}
		groups = append(groups, g)
	}

	// PM revalidation — highest signal, first tab.
	reval := globPNGs(s.tmpDir, "revalidate-")
	sortByNewest(reval)
	addGroup(Group{ID: "pm-revalidate", Label: "PM Revalidation", Kind: "pm", Images: reval})

	// Per-worktree PNGs (client/tmp, client/test-results, client/e2e/tmp).
	for _, wt := range s.worktreeDirs() {
		var all []Image
		for _, sub := range []string{"client/tmp", "client/test-results", "client/e2e/tmp"} {
			all = append(all, s.cachedWalkPNGs(filepath.Join(wt, sub))...)
		}
		sortByNewest(all)
		if len(all) == 0 {
			continue
		}
		addGroup(Group{ID: "wt-" + filepath.Base(wt), Label: worktreeLabel(wt), Kind: "worktree", Images: all})
	}

	// OpenClaw workspace.
	oc := globPNGs(s.openclawDir, "")
	sortByNewest(oc)
	if len(oc) > 0 {
		addGroup(Group{ID: "openclaw", Label: "OpenClaw", Kind: "openclaw", Images: oc})
	}

	// Misc /tmp/*.png (everything that's not revalidate-*.png).
	allTmp := globPNGs(s.tmpDir, "")
	misc := make([]Image, 0, len(allTmp))
	for _, img := range allTmp {
		if strings.HasPrefix(img.Name, "revalidate-") {
			continue
		}
		misc = append(misc, img)
	}
	sortByNewest(misc)
	if len(misc) > 0 {
		addGroup(Group{ID: "misc-tmp", Label: "Misc /tmp", Kind: "misc", Images: misc})
	}

	s.mu.Lock()
	s.latest = scanResult{ScannedAt: time.Now().Unix(), Groups: groups}
	s.allowPaths = allow
	s.mu.Unlock()
}

func (s *scanner) snapshot() scanResult {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.latest
}

// isAllowed returns true only when the exact path was surfaced by the most
// recent scan. This is strictly narrower than "path lives under an allowed
// root" — it stops the server from acting as a general PNG file server for
// every image under /tmp or under any worktree.
func (s *scanner) isAllowed(absPath string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.allowPaths[absPath]
	return ok
}

func (s *scanner) handleSources(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(s.snapshot()); err != nil {
		log.Printf("encode sources: %v", err)
	}
}

func (s *scanner) handleImage(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("path")
	if raw == "" {
		http.Error(w, "missing path", http.StatusBadRequest)
		return
	}
	abs, err := filepath.Abs(raw)
	if err != nil {
		http.Error(w, "bad path", http.StatusBadRequest)
		return
	}
	// Defeat symlink trickery that could escape the allow-list.
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// The allow-list stores unresolved scan paths, so we check BOTH: the path
	// as scanned and the symlink-resolved path. This rejects attempts to
	// fetch an image that happens to sit under an allowed directory but was
	// never surfaced by the scanner.
	if !s.isAllowed(abs) && !s.isAllowed(resolved) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if !strings.HasSuffix(strings.ToLower(resolved), ".png") {
		http.Error(w, "not an image", http.StatusBadRequest)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, resolved)
}

func main() {
	listen := flag.String("listen", "127.0.0.1:3999", "listen address (host:port). Default is loopback; pass :3999 or a specific interface to expose on Tailscale.")
	scanInterval := flag.Duration("scan-interval", 3*time.Second, "directory rescan interval")
	projectsDir := flag.String("projects-dir", "", "parent directory that holds sibling kithlands worktrees (defaults to the parent of the process working dir)")
	flag.Parse()

	cfg := defaultScannerConfig()
	if *projectsDir != "" {
		cfg.projectsDir = *projectsDir
	}
	s := newScanner(cfg)
	s.run() // initial scan before starting ticker
	go func() {
		t := time.NewTicker(*scanInterval)
		defer t.Stop()
		for range t.C {
			s.run()
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/sources", s.handleSources)
	mux.HandleFunc("/img", s.handleImage)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})
	mux.Handle("/", http.FileServer(http.FS(staticFS)))

	log.Printf("dashboard listening on %s (projects-dir=%s)", *listen, cfg.projectsDir)
	if err := http.ListenAndServe(*listen, mux); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
}
