// Package httpasset serves already-allowlisted assets through a bounded root.
package httpasset

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
)

// ServeApprovedFile opens a single regular file within directory. Callers must
// select directory and name from their asset registry, never request paths.
// OpenRoot also prevents a substituted symlink from escaping that directory.
func ServeApprovedFile(w http.ResponseWriter, r *http.Request, directory, name string) {
	if name == "." || name == ".." || filepath.Base(name) != name {
		http.NotFound(w, r)
		return
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer func() {
		if err := root.Close(); err != nil {
			log.Printf("closing asset root: %v", err)
		}
	}()
	file, err := root.Open(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer func() {
		if err := file.Close(); err != nil {
			log.Printf("closing asset file: %v", err)
		}
	}()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}
	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}
