import { WALK_SHEET_CLASS_IDS } from "./walkFrame.js";

const BASE_CLASS_BY_SPRITE = {
  warrior: "warrior",
  knight: "warrior",
  brawler: "brawler",
  champion: "brawler",
  rogue: "rogue",
  shadow: "rogue",
  mender: "mender",
  sage: "mender",
  cinder: "cinder",
  pyromancer: "cinder",
  wayfarer: "wayfarer",
  wanderer: "wayfarer",
};

function displayName(classId) {
  return classId.charAt(0).toUpperCase() + classId.slice(1);
}

export function walkAuditRequested(search = globalThis.location?.search || "") {
  try {
    return new URLSearchParams(search).get("walkAudit") === "1";
  } catch {
    return false;
  }
}

export function buildWalkAuditParty(sourceParty = []) {
  const templates = Array.isArray(sourceParty) ? sourceParty : [];
  return WALK_SHEET_CLASS_IDS.map((classId, index) => {
    const template = templates[index % Math.max(templates.length, 1)] || {};
    const maxHp = Math.max(template.max_hp || template.hp || 35, 1);
    const maxMp = Math.max(template.max_mp || template.mp || 0, 0);
    return {
      ...template,
      name: displayName(classId),
      class_id: BASE_CLASS_BY_SPRITE[classId] || classId,
      sprite_id: classId,
      level: Math.max(template.level || 1, 1),
      hp: maxHp,
      max_hp: maxHp,
      mp: maxMp,
      max_mp: maxMp,
      status: "",
    };
  });
}

export function walkAuditHUDText(party, leaderIndex) {
  const members = Array.isArray(party) ? party : [];
  const member = members[leaderIndex];
  if (!member) return "WALK AUDIT | No active class";
  return `WALK AUDIT ${leaderIndex + 1}/${members.length} | ${member.name} | Space: next class`;
}
