function clampXP(value, max) {
  const n = Number.isFinite(value) ? value : 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

export function buildVictoryXPSegments({
  prevXP = 0,
  currentXP = 0,
  xpNext = 0,
  xpThresholds = [],
} = {}) {
  const thresholds = Array.isArray(xpThresholds)
    ? xpThresholds.filter((value) => Number.isFinite(value) && value > 0)
    : [];

  if (thresholds.length === 0) {
    const max = Number.isFinite(xpNext) && xpNext > 0 ? Math.floor(xpNext) : 0;
    return max > 0
      ? [
          {
            start: clampXP(prevXP, max),
            end: clampXP(currentXP, max),
            max,
          },
        ]
      : [];
  }

  if (thresholds.length === 1) {
    const max = Math.floor(thresholds[0]);
    return [
      {
        start: clampXP(prevXP, max),
        end: clampXP(currentXP, max),
        max,
      },
    ];
  }

  const segments = [
    {
      start: clampXP(prevXP, thresholds[0]),
      end: Math.floor(thresholds[0]),
      max: Math.floor(thresholds[0]),
    },
  ];

  for (let i = 1; i < thresholds.length - 1; i++) {
    const max = Math.floor(thresholds[i]);
    segments.push({ start: 0, end: max, max });
  }

  const finalMax =
    Number.isFinite(xpNext) && xpNext > 0
      ? Math.floor(xpNext)
      : Math.floor(thresholds[thresholds.length - 1]);
  segments.push({
    start: 0,
    end: clampXP(currentXP, finalMax),
    max: finalMax,
  });

  return segments;
}
