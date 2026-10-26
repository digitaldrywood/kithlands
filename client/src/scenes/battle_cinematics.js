const DEFAULT_ELEMENT_STYLE = Object.freeze({
  core: 0xc7b5ff,
  glow: 0x7657d8,
  accent: 0xffffff,
});

const ELEMENT_STYLES = Object.freeze({
  fire: Object.freeze({ core: 0xff7a45, glow: 0xc82f1d, accent: 0xffd37a }),
  ice: Object.freeze({ core: 0x8cddff, glow: 0x377dff, accent: 0xe8fbff }),
  lightning: Object.freeze({
    core: 0xfff47a,
    glow: 0xc89012,
    accent: 0xffffff,
  }),
  holy: Object.freeze({ core: 0xfff4bd, glow: 0xd6a937, accent: 0xffffff }),
  dark: Object.freeze({ core: 0xc27aff, glow: 0x62318f, accent: 0xf0d6ff }),
  none: DEFAULT_ELEMENT_STYLE,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function point(entry = {}) {
  const sprite = entry.sprite || entry;
  return {
    x: Number(entry.x ?? sprite?.x) || 0,
    y: Number(entry.feetY ?? entry.y ?? sprite?.y) || 0,
    width: Math.max(42, Number(entry.width ?? sprite?.displayWidth) || 56),
  };
}

export function battleElementStyle(element) {
  return (
    ELEMENT_STYLES[String(element || "none").toLowerCase()] ||
    DEFAULT_ELEMENT_STYLE
  );
}

// Use the authored attachment tip; body-center emission makes spells detach
// from the hand/staff as equipment and character proportions change.
export function battleCastOrigin(actor, { live = false } = {}) {
  const sprite = actor?.sprite;
  if (!live && sprite?.battleCastSource) return { ...sprite.battleCastSource };
  const layer = sprite?.battleAttachmentLayers?.find(
    (entry) => entry.emissionPoint,
  );
  const image =
    layer &&
    (layer.front.visible
      ? layer.front
      : layer.back.visible
        ? layer.back
        : null);
  if (!image) return { x: actor?.x || 0, y: actor?.y || 0 };
  const [tipX, tipY] = layer.emissionPoint;
  const x = (tipX - image.displayOriginX) * image.scaleX;
  const y = (tipY - image.displayOriginY) * image.scaleY;
  const cos = Math.cos(image.rotation),
    sin = Math.sin(image.rotation);
  return {
    x: sprite.x + (image.x + x * cos - y * sin) * sprite.scaleX,
    y: sprite.y + (image.y + x * sin + y * cos) * sprite.scaleY,
  };
}

export function prefersReducedBattleMotion() {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function cinematicActionKey(action = {}) {
  const kind = String(action.kind || "action").trim();
  const id = String(
    action.action_id || action.action_name || action.spell_name || kind,
  )
    .trim()
    .toLowerCase();
  return `${kind}:${id}`;
}

export function shouldPlayMajorCinematic({
  tier,
  mode = "full",
  alreadySeen = false,
  reducedMotion = false,
} = {}) {
  if (tier !== "major" || reducedMotion || mode === "short") return false;
  if (mode === "once") return !alreadySeen;
  return true;
}

export function buildAttackMotionPath(
  actorEntry,
  targetEntry,
  reducedMotion = false,
  { contactFamily = "slash" } = {},
) {
  const actor = point(actorEntry);
  const target = point(targetEntry);
  const dx = target.x - actor.x;
  const dy = target.y - actor.y;
  const distance = Math.hypot(dx, dy);
  const ux = distance > 0 ? dx / distance : 1;
  const uy = distance > 0 ? dy / distance : 0;
  const anticipationDistance = reducedMotion ? 0 : 12;
  const blunt = !reducedMotion && contactFamily === "blunt";
  const clearance = blunt
    ? clamp(actor.width * 0.25 + target.width * 0.33, 48, 72)
    : clamp((actor.width + target.width) * 0.5 + 18, 72, 124);
  const travel = reducedMotion
    ? Math.min(14, distance * 0.08)
    : clamp(distance - clearance, 0, distance * (blunt ? 0.9 : 0.76));
  const strikeX = actor.x + ux * travel;
  const strikeY = actor.y + uy * travel;
  const approachGap = reducedMotion ? 0 : Math.min(24, travel * 0.15);
  const approach = {
    x: strikeX - ux * approachGap,
    y: strikeY - uy * approachGap,
  };

  return {
    origin: { x: actor.x, y: actor.y },
    approach,
    windup: {
      x: approach.x - ux * (reducedMotion ? 0 : 8),
      y: approach.y - uy * (reducedMotion ? 0 : 8),
    },
    anticipation: {
      x: actor.x - ux * anticipationDistance,
      y: actor.y - uy * anticipationDistance + (reducedMotion ? 0 : 3),
    },
    apex: {
      x: actor.x + ux * travel * 0.68,
      y: actor.y + uy * travel * 0.68 - (reducedMotion ? 0 : 24),
    },
    strike: { x: strikeX, y: strikeY },
    distance,
    clearance,
  };
}

export function spellTravelDuration(
  actorEntry,
  targetEntry,
  reducedMotion = false,
) {
  if (reducedMotion) return 90;
  const actor = point(actorEntry);
  const target = point(targetEntry);
  return Math.round(
    clamp(Math.hypot(target.x - actor.x, target.y - actor.y) * 0.72, 220, 380),
  );
}
