# Adventure discovery and physical arrivals

The world map lists the server's dungeon entries by adventure title, numbered map marker, entrance host, and completion status. Find adventures jumps from the map header to the list. Follow route closes the map and walks to the selected entrance; it does not enter the dungeon automatically. Selection remains tracked after cancellation or an encounter.

Walking and graph travel have different evidence. A normal world-step must be adjacent to the saved checkpoint, traversable for the active transport, and assigned to the nearest spawn within the arrival radius. It can cross a location boundary even when the locality graph has no corresponding edge. Legacy arrive-world-node requests still require a graph edge. Invalid movement must leave location, checkpoint, and encounter budget unchanged.

Client arrival selection uses the same nearest-distance and stable spawn-order tie break as the server. The route planner follows walkable tiles directly to an entrance's nearest-location area. Other buildings are valid intermediate arrivals, not obstacles. Actual impassable terrain can still make a route unavailable.

The current content catalogue contains the Old Mill and Forgotten Shrine. This change exposes that existing content; it does not generate additional caves or dungeons.

## Regression checks

- `cd server && go test ./api -run 'Physical|WorldArrival' -count=1`
- `cd client && npm test -- --run src/scenes/dungeonRoute.test.js src/scenes/world_interact.test.js src/scenes/worldMapCapability.test.js src/scenes/dungeonEntry.test.js`
- `./scripts/run_playwright_local.sh e2e/adventure-map-navigation.spec.js --workers=1`

The browser test enters and retreats from both adventures through visible map and entrance controls at 1440x900, 645x847, and 390x844. It covers keyboard, pointer, and touch activation. The protected visual workflow runs it on pull requests. Save screenshots in a unique local proof directory and inspect map overview, adventure list, entrance, and first dungeon room at each size.
