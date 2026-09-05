package main

import "testing"

func TestBuildReportOmitsIndividualRunsByDefault(t *testing.T) {
	runs := []RunResult{{Seed: 1, Route: RouteMain, Strategy: "aggressive"}}
	report := buildReport(
		map[string]any{"base_seed": int64(1)},
		map[string]Aggregated{"main/aggressive": {Runs: 1}},
		runs,
		[]AssertionFailure{},
		DefaultAssertionConfig(),
		false,
	)
	if _, ok := report["runs"]; ok {
		t.Fatal("aggregate report unexpectedly contains individual runs")
	}

	report = buildReport(nil, nil, runs, nil, DefaultAssertionConfig(), true)
	if got, ok := report["runs"].([]RunResult); !ok || len(got) != 1 {
		t.Fatalf("raw report runs = %#v", report["runs"])
	}
}
