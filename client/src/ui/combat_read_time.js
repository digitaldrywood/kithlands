// Reading time is a UI concern and must not shrink with battle animation speed.
export function combatReadTime(line, characterMs = 0) {
  const length = String(line || "").length;
  if (!length) return 0;
  return Math.min(6000, Math.max(1500, length * characterMs + 1000));
}
