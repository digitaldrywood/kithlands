import { element, viewportDialog } from "../ui/viewport_dialog.js";
import "../styles/defeat-receipt.css";

// A defeat receipt only reports Go's result. Loading remains an explicit choice
// in Title's existing newest-save/history flow; no recovery rules live here.
export function showDefeatReceipt(scene, state) {
  let leaving = false;
  const leave = (openSaves) => {
    if (leaving || dialog.disposed) return;
    leaving = true;
    scene.scene.start("Title", { openSaves });
  };
  const dialog = viewportDialog(scene, {
    key: "defeat-receipt",
    title: "PARTY DEFEATED",
    onEscape: () => leave(false),
  });
  dialog.root.classList.add("defeat-receipt");
  dialog.header.append(
    element("p", "", state.message || "Your party has fallen."),
  );
  dialog.body.append(element("h2", "", "Your party"));
  const party = element("div", "defeat-party");
  for (const member of state.party || []) {
    const row = element("section", "defeat-member");
    const portrait = element("img");
    portrait.src = `/sprites/${member.sprite_id || member.class_id}.png`;
    portrait.alt = "";
    const details = element("div");
    details.append(
      element("h3", "", member.name),
      element(
        "p",
        "",
        `${member.class_name || member.class_id} · Level ${member.level}`,
      ),
      element("p", "", `HP ${member.hp} / ${member.max_hp}`),
    );
    row.append(portrait, details);
    party.append(row);
  }
  dialog.body.append(
    party,
    element(
      "p",
      "defeat-recovery-note",
      "Choose a save to return to your adventure. Loading it restores the progress recorded in that save.",
    ),
  );
  const choose = element("button", "primary", "Choose a save");
  choose.type = "button";
  choose.dataset.resultLabel = "Choose a save";
  choose.addEventListener("click", () => leave(true));
  const title = element("button", "", "Title screen");
  title.type = "button";
  title.dataset.resultLabel = "Title screen";
  title.append(element("kbd", "", "Esc"));
  title.addEventListener("click", () => leave(false));
  dialog.footer.append(title, choose);
  choose.focus();
  return dialog;
}
