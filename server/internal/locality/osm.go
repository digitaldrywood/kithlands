package locality

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"
)

// BuildFromOSM fetches real-world data from OpenStreetMap Overpass API
// and builds a Locality graph from it.
func BuildFromOSM(ctx context.Context, lat, lng float64, townName string) (*Locality, error) {
	elements, err := queryOverpass(ctx, lat, lng, 1500) // 1.5km radius
	if err != nil {
		return nil, fmt.Errorf("overpass query: %w", err)
	}

	loc := &Locality{
		ID:        fmt.Sprintf("osm_%f_%f", lat, lng),
		Name:      townName,
		Center:    LatLng{Lat: lat, Lng: lng},
		Generated: time.Now(),
		Source:     "osm",
	}

	// Parse OSM elements into nodes
	nodeMap := make(map[int64]osmNode)    // OSM node ID -> coords
	var buildings []osmElement
	var roads []osmElement
	var amenities []osmElement
	var nature []osmElement

	for _, el := range elements {
		switch el.Type {
		case "node":
			nodeMap[el.ID] = osmNode{lat: el.Lat, lon: el.Lon}
			if el.Tags != nil {
				if el.Tags["amenity"] != "" || el.Tags["shop"] != "" {
					amenities = append(amenities, el)
				}
			}
		case "way":
			if el.Tags == nil {
				continue
			}
			if el.Tags["building"] != "" && el.Tags["name"] != "" {
				buildings = append(buildings, el)
			} else if el.Tags["highway"] != "" {
				roads = append(roads, el)
			} else if el.Tags["natural"] == "water" || el.Tags["leisure"] == "park" {
				nature = append(nature, el)
			}
		}
	}

	// Bounding box for coordinate mapping
	minLat, maxLat := lat-0.015, lat+0.015 // ~1.5km
	minLng, maxLng := lng-0.02, lng+0.02

	// Convert buildings to locality nodes
	seen := make(map[string]bool)
	nodeIdx := 0

	for _, b := range buildings {
		name := b.Tags["name"]
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true

		bLat, bLng := wayCenter(b, nodeMap)
		kind := classifyBuilding(b.Tags)
		tags := buildingTags(b.Tags)
		importance := buildingImportance(b.Tags)

		loc.Nodes = append(loc.Nodes, Node{
			ID:         fmt.Sprintf("osm_b_%d", nodeIdx),
			Kind:       kind,
			Name:       name,
			Coord:      &LatLng{Lat: bLat, Lng: bLng},
			Tags:       tags,
			Importance: importance,
		})
		nodeIdx++

		if nodeIdx >= 30 { // cap to prevent huge graphs
			break
		}
	}

	// Convert amenities (nodes with names)
	for _, a := range amenities {
		name := a.Tags["name"]
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true

		kind := classifyAmenity(a.Tags)
		tags := amenityTags(a.Tags)

		loc.Nodes = append(loc.Nodes, Node{
			ID:         fmt.Sprintf("osm_a_%d", nodeIdx),
			Kind:       kind,
			Name:       name,
			Coord:      &LatLng{Lat: a.Lat, Lng: a.Lon},
			Tags:       tags,
			Importance: 50,
		})
		nodeIdx++

		if nodeIdx >= 40 {
			break
		}
	}

	// If too few nodes, add filler nodes like the wizard does
	if len(loc.Nodes) < 5 {
		fillers := []struct {
			id, name string
			kind     NodeKind
			tags     []string
		}{
			{"inn", "The Wayward Inn", NodeBusiness, []string{"commerce", "rest"}},
			{"shop", "General Store", NodeBusiness, []string{"commerce", "shop"}},
			{"temple", "Temple of Light", NodeLandmark, []string{"temple", "revive"}},
			{"wilderness", "Dark Forest", NodeNatural, []string{"wilderness", "danger"}},
			{"ruins", "Old Ruins", NodeLandmark, []string{"wilderness", "dungeon"}},
		}
		for _, f := range fillers {
			if len(loc.Nodes) >= 10 {
				break
			}
			loc.Nodes = append(loc.Nodes, Node{
				ID:         f.id,
				Kind:       f.kind,
				Name:       f.name,
				Tags:       f.tags,
				Importance: 50,
			})
		}
	}

	// Always ensure we have an inn, shop, and temple
	ensureNode(loc, "inn", "The Wayward Inn", NodeBusiness, []string{"commerce", "rest"})
	ensureNode(loc, "shop", "General Store", NodeBusiness, []string{"commerce", "shop"})
	ensureNode(loc, "temple", "Temple of Light", NodeLandmark, []string{"temple", "revive"})

	// Build edges: connect nodes based on geographic proximity
	for i := 0; i < len(loc.Nodes); i++ {
		for j := i + 1; j < len(loc.Nodes); j++ {
			ni, nj := loc.Nodes[i], loc.Nodes[j]
			dist := coordDistance(ni, nj, lat, lng, minLat, maxLat, minLng, maxLng)
			if dist < 0.3 { // close proximity
				loc.Edges = append(loc.Edges, Edge{
					From: ni.ID, To: nj.ID,
					Kind: EdgeProximity, Weight: 1.0 - dist,
				})
			}
		}
	}

	// Ensure graph is connected: connect each isolated node to nearest
	connected := make(map[string]bool)
	if len(loc.Nodes) > 0 {
		connected[loc.Nodes[0].ID] = true
		for _, e := range loc.Edges {
			connected[e.From] = true
			connected[e.To] = true
		}
		for _, n := range loc.Nodes {
			if !connected[n.ID] && len(loc.Nodes) > 1 {
				// Connect to first node
				loc.Edges = append(loc.Edges, Edge{
					From: n.ID, To: loc.Nodes[0].ID,
					Kind: EdgeProximity, Weight: 0.3,
				})
			}
		}
	}

	// Store road data for tilemap rendering
	loc.roads = parseRoads(roads, nodeMap, minLat, maxLat, minLng, maxLng)

	return loc, nil
}

// Road represents a simplified road segment for tilemap rendering.
type Road struct {
	Points []struct{ X, Y float64 } // normalized 0-1 coordinates
}

// roads stores parsed road data (not exported in JSON, used by tilemap)
// We add this as an unexported field accessor
func (l *Locality) Roads() []Road {
	return l.roads
}

// queryOverpass fetches OSM data around a point.
func queryOverpass(ctx context.Context, lat, lng float64, radiusM int) ([]osmElement, error) {
	query := fmt.Sprintf(`[out:json][timeout:25];
(
  node["amenity"](around:%d,%f,%f);
  node["shop"](around:%d,%f,%f);
  way["building"]["name"](around:%d,%f,%f);
  way["highway"](around:%d,%f,%f);
  way["natural"="water"](around:%d,%f,%f);
  way["leisure"="park"](around:%d,%f,%f);
);
out body; >; out skel qt;`,
		radiusM, lat, lng,
		radiusM, lat, lng,
		radiusM, lat, lng,
		radiusM, lat, lng,
		radiusM, lat, lng,
		radiusM, lat, lng,
	)

	reqURL := "https://overpass-api.de/api/interpreter"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL,
		strings.NewReader("data="+query))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Kithlands/1.0 (game)")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("overpass returned %d: %s", resp.StatusCode, string(body[:min(200, len(body))]))
	}

	var result struct {
		Elements []osmElement `json:"elements"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("parsing overpass response: %w", err)
	}

	return result.Elements, nil
}

type osmElement struct {
	Type  string            `json:"type"`
	ID    int64             `json:"id"`
	Lat   float64           `json:"lat,omitempty"`
	Lon   float64           `json:"lon,omitempty"`
	Tags  map[string]string `json:"tags,omitempty"`
	Nodes []int64           `json:"nodes,omitempty"`
}

type osmNode struct {
	lat, lon float64
}

func wayCenter(el osmElement, nodeMap map[int64]osmNode) (float64, float64) {
	if len(el.Nodes) == 0 {
		return 0, 0
	}
	var sumLat, sumLon float64
	count := 0
	for _, nid := range el.Nodes {
		if n, ok := nodeMap[nid]; ok {
			sumLat += n.lat
			sumLon += n.lon
			count++
		}
	}
	if count == 0 {
		return 0, 0
	}
	return sumLat / float64(count), sumLon / float64(count)
}

func classifyBuilding(tags map[string]string) NodeKind {
	b := tags["building"]
	amenity := tags["amenity"]

	switch {
	case amenity == "school" || b == "school":
		return NodePlace
	case amenity == "place_of_worship" || b == "church":
		return NodeLandmark
	case amenity == "fire_station":
		return NodePlace
	case amenity == "police":
		return NodePlace
	case amenity == "library":
		return NodePlace
	case amenity == "hospital" || amenity == "clinic":
		return NodePlace
	case b == "commercial" || b == "retail" || amenity == "restaurant" || amenity == "cafe":
		return NodeBusiness
	case b == "civic" || b == "government":
		return NodeLandmark
	default:
		return NodePlace
	}
}

func buildingTags(tags map[string]string) []string {
	result := []string{"place"}
	amenity := tags["amenity"]
	b := tags["building"]

	if amenity == "school" || b == "school" {
		result = append(result, "school")
	}
	if amenity == "place_of_worship" || b == "church" {
		result = append(result, "temple", "revive")
	}
	if amenity == "restaurant" || amenity == "cafe" || amenity == "bar" {
		result = append(result, "commerce", "rest")
	}
	if b == "commercial" || b == "retail" || tags["shop"] != "" {
		result = append(result, "commerce", "shop")
	}
	if b == "civic" || b == "government" || amenity == "townhall" {
		result = append(result, "central", "landmark")
	}

	return result
}

func buildingImportance(tags map[string]string) int {
	amenity := tags["amenity"]
	b := tags["building"]

	switch {
	case b == "civic" || b == "government" || amenity == "townhall":
		return 90
	case amenity == "school":
		return 75
	case amenity == "place_of_worship":
		return 70
	case amenity == "fire_station" || amenity == "police":
		return 65
	default:
		return 50
	}
}

func classifyAmenity(tags map[string]string) NodeKind {
	amenity := tags["amenity"]
	switch amenity {
	case "restaurant", "cafe", "bar", "fast_food":
		return NodeBusiness
	case "school", "library", "fire_station", "police":
		return NodePlace
	case "place_of_worship":
		return NodeLandmark
	default:
		if tags["shop"] != "" {
			return NodeBusiness
		}
		return NodePlace
	}
}

func amenityTags(tags map[string]string) []string {
	result := []string{"place"}
	amenity := tags["amenity"]

	if amenity == "restaurant" || amenity == "cafe" || amenity == "bar" {
		result = append(result, "commerce", "rest")
	}
	if tags["shop"] != "" {
		result = append(result, "commerce", "shop")
	}
	if amenity == "place_of_worship" {
		result = append(result, "temple", "revive")
	}

	return result
}

func coordDistance(a, b Node, centerLat, centerLng, minLat, maxLat, minLng, maxLng float64) float64 {
	ax, ay := nodeToNorm(a, centerLat, centerLng, minLat, maxLat, minLng, maxLng)
	bx, by := nodeToNorm(b, centerLat, centerLng, minLat, maxLat, minLng, maxLng)
	dx := ax - bx
	dy := ay - by
	return math.Sqrt(dx*dx + dy*dy)
}

func nodeToNorm(n Node, centerLat, centerLng, minLat, maxLat, minLng, maxLng float64) (float64, float64) {
	if n.Coord != nil {
		x := (n.Coord.Lng - minLng) / (maxLng - minLng)
		y := (n.Coord.Lat - minLat) / (maxLat - minLat)
		return x, 1 - y // invert Y for screen coords
	}
	return 0.5, 0.5
}

func parseRoads(roads []osmElement, nodeMap map[int64]osmNode, minLat, maxLat, minLng, maxLng float64) []Road {
	var result []Road
	for _, r := range roads {
		var road Road
		for _, nid := range r.Nodes {
			if n, ok := nodeMap[nid]; ok {
				x := (n.lon - minLng) / (maxLng - minLng)
				y := 1 - (n.lat-minLat)/(maxLat-minLat)
				road.Points = append(road.Points, struct{ X, Y float64 }{x, y})
			}
		}
		if len(road.Points) >= 2 {
			result = append(result, road)
		}
	}
	return result
}

func ensureNode(loc *Locality, id, name string, kind NodeKind, tags []string) {
	for _, n := range loc.Nodes {
		for _, t := range n.Tags {
			for _, target := range tags {
				if t == target {
					return // already have one
				}
			}
		}
	}
	loc.Nodes = append(loc.Nodes, Node{
		ID: id, Kind: kind, Name: name, Tags: tags, Importance: 50,
	})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
