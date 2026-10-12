// Shared content supplies the art key. Legacy keys remain extensionless PNGs.
export function itemArtURL(key) {
  if (
    !key ||
    !/^[a-zA-Z0-9_/-]+(?:\.(?:png|svg|webp))?$/.test(key) ||
    key.includes("..")
  )
    return null;
  return `/sprites/items/${key}${/\.(png|svg|webp)$/.test(key) ? "" : ".png"}`;
}
