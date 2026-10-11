export function nearbyResource(resources, x, y) {
  return (
    (resources || [])
      .filter(
        (node) =>
          !node.gathered && Math.abs(node.x - x) + Math.abs(node.y - y) <= 1,
      )
      .sort(
        (a, b) =>
          Math.abs(a.x - x) +
          Math.abs(a.y - y) -
          (Math.abs(b.x - x) + Math.abs(b.y - y)),
      )[0] || null
  );
}
