package locality

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// GeoResult is the result of geocoding a place name to coordinates.
type GeoResult struct {
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	Name    string  `json:"name"`
	Display string  `json:"display_name"`
}

// Geocode uses OSM Nominatim to convert a place name to lat/lng.
func Geocode(ctx context.Context, query string) (*GeoResult, error) {
	u := fmt.Sprintf("https://nominatim.openstreetmap.org/search?q=%s&format=json&limit=1",
		url.QueryEscape(query))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("User-Agent", "Kithlands/1.0 (game; contact@kithlands.com)")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("geocoding request: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("geocoding returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	var results []struct {
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
		DisplayName string `json:"display_name"`
		Name        string `json:"name"`
	}
	if err := json.Unmarshal(body, &results); err != nil {
		return nil, fmt.Errorf("parsing geocode response: %w", err)
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no results for %q", query)
	}

	r := results[0]
	var lat, lng float64
	_, _ = fmt.Sscanf(r.Lat, "%f", &lat)
	_, _ = fmt.Sscanf(r.Lon, "%f", &lng)

	return &GeoResult{
		Lat:     lat,
		Lng:     lng,
		Name:    r.Name,
		Display: r.DisplayName,
	}, nil
}
