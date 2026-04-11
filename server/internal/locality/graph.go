package locality

import "time"

// Locality is the fundamental data structure per Section 9.1.
// Nodes are people, places, businesses, landmarks.
// Edges are relationships between them.
type Locality struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Center    LatLng     `json:"center"`
	Nodes     []Node     `json:"nodes"`
	Edges     []Edge     `json:"edges"`
	Generated time.Time  `json:"generated"`
	Source    string     `json:"source"` // wizard, csv, osm, hybrid
	roads      []Road      // parsed OSM road data (not serialized)
	waterways  []Waterway  // parsed OSM waterway data (not serialized)
}

type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type NodeKind string

const (
	NodePerson   NodeKind = "person"
	NodePlace    NodeKind = "place"
	NodeBusiness NodeKind = "business"
	NodeLandmark NodeKind = "landmark"
	NodeNatural  NodeKind = "natural"
)

type Node struct {
	ID          string   `json:"id"`
	Kind        NodeKind `json:"kind"`
	Name        string   `json:"name"`
	Coord       *LatLng  `json:"coord,omitempty"`
	Tags        []string `json:"tags"`
	Importance  int      `json:"importance"` // 0-100
	Personality string   `json:"personality,omitempty"`
	Faction     string   `json:"faction,omitempty"`
}

type EdgeKind string

const (
	EdgeProximity  EdgeKind = "proximity"
	EdgeSocial     EdgeKind = "social"
	EdgeFactional  EdgeKind = "factional"
	EdgeHistorical EdgeKind = "historical"
)

type Edge struct {
	From   string   `json:"from"`
	To     string   `json:"to"`
	Kind   EdgeKind `json:"kind"`
	Weight float64  `json:"weight"` // 0.0 to 1.0
}

// NodeByID returns a node by ID, or nil.
func (l *Locality) NodeByID(id string) *Node {
	for i := range l.Nodes {
		if l.Nodes[i].ID == id {
			return &l.Nodes[i]
		}
	}
	return nil
}

// Neighbors returns node IDs adjacent to the given node.
func (l *Locality) Neighbors(nodeID string) []string {
	var result []string
	for _, e := range l.Edges {
		if e.From == nodeID {
			result = append(result, e.To)
		} else if e.To == nodeID {
			result = append(result, e.From)
		}
	}
	return result
}
