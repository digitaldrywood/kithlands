package httpasset

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestApprovedFilePreservesImageRangeAndHead(t *testing.T) {
	dir := t.TempDir()
	data := []byte("\x89PNG\r\n\x1a\nimage-data")
	if err := os.WriteFile(filepath.Join(dir, "art.png"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		r := httptest.NewRequest(method, "/art.png", nil)
		w := httptest.NewRecorder()
		ServeApprovedFile(w, r, dir, "art.png")
		if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "image/png" {
			t.Fatalf("%s: status %d headers %v", method, w.Code, w.Header())
		}
		if method == http.MethodGet && w.Body.String() != string(data) || method == http.MethodHead && w.Body.Len() != 0 {
			t.Fatalf("%s: incorrect response body", method)
		}
	}
	r := httptest.NewRequest(http.MethodGet, "/art.png", nil)
	r.Header.Set("Range", "bytes=0-3")
	w := httptest.NewRecorder()
	ServeApprovedFile(w, r, dir, "art.png")
	if w.Code != http.StatusPartialContent || w.Body.String() != string(data[:4]) {
		t.Fatalf("range: status %d body %q", w.Code, w.Body.String())
	}
}

func TestApprovedFileRejectsTraversalDirectoriesAndEscapingSymlink(t *testing.T) {
	dir, outside := t.TempDir(), t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.png"), []byte("private"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "secret.png"), filepath.Join(dir, "link.png")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "folder.png"), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"", ".", "..", "../secret.png", filepath.Join(outside, "secret.png"), "link.png", "folder.png", "missing.png"} {
		w := httptest.NewRecorder()
		ServeApprovedFile(w, httptest.NewRequest(http.MethodGet, "/art", nil), dir, name)
		if w.Code != http.StatusNotFound {
			t.Errorf("%q status %d", name, w.Code)
		}
	}
}
