import { describe, expect, it } from "vitest";

import {
  clearWorldLandmarks,
  renderWorldLandmarks,
} from "./worldLandmarkRenderer.js";

function makeScene() {
  const images = [];
  const containers = [];
  const scene = {
    gameState: {},
    add: {
      container(x, y) {
        const container = {
          x,
          y,
          depth: null,
          children: [],
          destroyed: false,
          destroyChildren: false,
          setDepth(depth) {
            this.depth = depth;
            return this;
          },
          add(child) {
            this.children.push(child);
            return this;
          },
          destroy(destroyChildren) {
            this.destroyed = true;
            this.destroyChildren = destroyChildren;
          },
        };
        containers.push(container);
        return container;
      },
      image(x, y, key) {
        const image = {
          x,
          y,
          key,
          origin: null,
          setOrigin(originX, originY = originX) {
            this.origin = [originX, originY];
            return this;
          },
        };
        images.push(image);
        return image;
      },
    },
  };
  return { scene, images, containers };
}

describe("world landmark rendering", () => {
  it("renders native markers and stacked badges at manifest depths", () => {
    const { scene, images } = makeScene();
    const gameState = {
      dungeon_entries: [
        { id: "old-mill", node_id: "central" },
        { id: "forgotten-shrine", node_id: "central" },
      ],
    };

    const result = renderWorldLandmarks(
      scene,
      [{ node_id: "central", name: "Cadott", kind: "landmark", x: 4, y: 6 }],
      gameState,
    );

    expect(result.markers.depth).toBe(2);
    expect(result.badges.depth).toBe(3);
    expect(result.markers.children).toHaveLength(1);
    expect(result.badges.children).toHaveLength(2);
    expect(result.markers.children[0].origin).toEqual([0.5, 0.75]);
    expect(result.badges.children[0].x - result.badges.children[1].x).toBe(18);
    expect(images).toHaveLength(3);
    expect(images.every((image) => image.displayWidth === undefined)).toBe(
      true,
    );
    expect(result.models[0]).toMatchObject({
      nodeId: "central",
      name: "Cadott",
      family: "settlement_home",
      width: 64,
      height: 64,
      depth: 2,
      badges: [
        { id: "badge-old-mill", depth: 3 },
        { id: "badge-forgotten-shrine", depth: 3 },
      ],
    });
  });

  it("destroys both old containers and rebuilds without duplicates", () => {
    const { scene } = makeScene();
    renderWorldLandmarks(scene, [
      { node_id: "central", name: "Cadott", kind: "landmark", x: 4, y: 6 },
      { node_id: "grove", name: "Quiet Grove", kind: "natural", x: 8, y: 9 },
    ]);
    const oldMarkers = scene.landmarkMarkerContainer;
    const oldBadges = scene.landmarkBadgeContainer;

    renderWorldLandmarks(scene, [
      { node_id: "grove", name: "Quiet Grove", kind: "natural", x: 8, y: 9 },
      { node_id: "broken", name: "Broken", kind: "place", x: null, y: 3 },
    ]);

    expect(oldMarkers).toMatchObject({
      destroyed: true,
      destroyChildren: true,
    });
    expect(oldBadges).toMatchObject({ destroyed: true, destroyChildren: true });
    expect(scene.landmarkMarkerContainer.children).toHaveLength(1);
    expect(scene.landmarkMarkerModels).toHaveLength(1);
    expect(scene.landmarkMarkerModels[0].family).toBe("natural_grove");
  });

  it("clears renderer state", () => {
    const { scene } = makeScene();
    renderWorldLandmarks(scene, [
      { node_id: "home", name: "Home", kind: "person", x: 1, y: 2 },
    ]);
    clearWorldLandmarks(scene);
    expect(scene.landmarkMarkerContainer).toBeNull();
    expect(scene.landmarkBadgeContainer).toBeNull();
    expect(scene.landmarkMarkerModels).toEqual([]);
  });
});
