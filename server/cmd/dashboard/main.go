// Dashboard is a dev-only local HTTP server that aggregates PM/worker
// screenshots from every active Kithlands worktree and exposes them as a
// single dark-themed web UI. It is never shipped to users and has no auth —
// it is intended to live behind Tailscale.
package main

import (
	"embed"
	"encoding/json"
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

type scanner struct {
	mu         sync.RWMutex
	latest     scanResult
	allowRoots []string
	projectDir string
	openclawDir string
}

func newScanner() *scanner {
	home, _ := os.UserHomeDir()
	if home == "" {
		if u, err := user.Current(); err == nil {
			home = u.HomeDir
		}
	}
	projectDir := filepath.Join(home, "projects", "digitaldrywood")
	openclawDir := filepath.Join(home, ".openclaw", "workspace", "tmp")
	return &scanner{
		projectDir:  projectDir,
		openclawDir: openclawDir,
	}
}

func (s *scanner) worktreeDirs() []string {
	entries, err := os.ReadDir(s.projectDir)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path := filepath.Join(s.projectDir, e.Name())
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
	roots := make([]string, 0, 16)

	// PM revalidation — highest signal, first tab.
	reval := globPNGs("/tmp", "revalidate-")
	sortByNewest(reval)
	groups = append(groups, Group{
		ID:     "pm-revalidate",
		Label:  "PM Revalidation",
		Kind:   "pm",
		Images: reval,
	})
	roots = append(roots, "/tmp")

	// Per-worktree PNGs (client/tmp, client/test-results, client/e2e/tmp).
	for _, wt := range s.worktreeDirs() {
		var all []Image
		for _, sub := range []string{"client/tmp", "client/test-results", "client/e2e/tmp"} {
			all = append(all, walkPNGs(filepath.Join(wt, sub))...)
		}
		sortByNewest(all)
		if len(all) == 0 {
			continue
		}
		groups = append(groups, Group{
			ID:     "wt-" + filepath.Base(wt),
			Label:  worktreeLabel(wt),
			Kind:   "worktree",
			Images: all,
		})
		roots = append(roots, wt)
	}

	// OpenClaw workspace.
	oc := globPNGs(s.openclawDir, "")
	sortByNewest(oc)
	if len(oc) > 0 {
		groups = append(groups, Group{
			ID:     "openclaw",
			Label:  "OpenClaw",
			Kind:   "openclaw",
			Images: oc,
		})
	}
	roots = append(roots, s.openclawDir)

	// Misc /tmp/*.png (everything that's not revalidate-*.png).
	allTmp := globPNGs("/tmp", "")
	misc := make([]Image, 0, len(allTmp))
	for _, img := range allTmp {
		if strings.HasPrefix(img.Name, "revalidate-") {
			continue
		}
		misc = append(misc, img)
	}
	sortByNewest(misc)
	if len(misc) > 0 {
		groups = append(groups, Group{
			ID:     "misc-tmp",
			Label:  "Misc /tmp",
			Kind:   "misc",
			Images: misc,
		})
	}

	s.mu.Lock()
	s.latest = scanResult{ScannedAt: time.Now().Unix(), Groups: groups}
	s.allowRoots = roots
	s.mu.Unlock()
}

func (s *scanner) snapshot() scanResult {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.latest
}

func (s *scanner) isAllowed(absPath string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, root := range s.allowRoots {
		rel, err := filepath.Rel(root, absPath)
		if err != nil {
			continue
		}
		if !strings.HasPrefix(rel, "..") && rel != ".." {
			return true
		}
	}
	return false
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
	// Defeat symlink trickery that could escape the allow-roots.
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if !s.isAllowed(resolved) {
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
	port := flag.Int("port", 3999, "listen port")
	scanInterval := flag.Duration("scan-interval", 3*time.Second, "directory rescan interval")
	flag.Parse()

	s := newScanner()
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

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("dashboard listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
