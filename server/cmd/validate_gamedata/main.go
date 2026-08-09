// validate_gamedata loads and validates all shared/*.json game data files,
// exiting non-zero on any error. Used in CI to fail fast on malformed or
// semantically invalid content before it can reach main.
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/interiors"
	"github.com/digitaldrywood/kithlands/internal/settlements"
)

func main() {
	sharedDir := flag.String("shared", "../shared", "path to shared/ directory")
	flag.Parse()

	if err := run(*sharedDir); err != nil {
		fmt.Fprintf(os.Stderr, "validate_gamedata: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("validate_gamedata: OK")
}

func run(sharedDir string) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%v", r)
		}
	}()

	gd := gamedata.Load(sharedDir)
	registry, err := interiors.LoadDir(sharedDir)
	if err != nil {
		return err
	}
	if err := validateChestAnchors(gd, registry); err != nil {
		return err
	}
	settlementRegistry, err := settlements.LoadDir(sharedDir)
	if err != nil {
		return fmt.Errorf("loading settlements: %w", err)
	}
	fmt.Printf("loaded %d classes, %d spells, %d monsters, %d formations\n",
		len(gd.Classes), len(gd.Spells.Spells), len(gd.Monsters), len(gd.Formations))
	fmt.Printf("loaded %d interior templates, %d settlement maps, and %d chest definitions\n",
		len(registry.Templates), len(settlementRegistry.Maps), len(gd.Chests))
	return nil
}

func validateChestAnchors(gd *gamedata.GameData, registry *interiors.Registry) error {
	for _, template := range registry.Templates {
		for _, floor := range template.Floors {
			for _, anchor := range floor.ChestAnchors {
				if gd.ChestByID(anchor.ID) == nil {
					return fmt.Errorf("template %q floor %d references unknown chest %q", template.ID, floor.FloorID, anchor.ID)
				}
			}
		}
	}
	return nil
}
