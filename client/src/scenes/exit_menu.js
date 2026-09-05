import { element, viewportDialog } from "../ui/viewport_dialog.js";

export function showExitMenu(scene, save) {
  if (scene.exitDialog && !scene.exitDialog.disposed) return scene.exitDialog;
  let saving = false;
  const dialog = viewportDialog(scene, {
    key: "exit_game",
    title: "Exit to main menu?",
    onEscape: () => {
      if (!saving) dialog.dispose();
    },
  });
  scene.exitDialog = dialog;
  dialog.body.append(
    element(
      "p",
      "",
      "Return to the main menu to start a new adventure or load a saved game.",
    ),
  );
  dialog.body.append(
    element(
      "p",
      "",
      "Exiting without saving loses progress since your last save.",
    ),
  );
  const status = element("p", "");
  status.setAttribute("role", "status");
  dialog.body.append(status);
  const actions = element("div", "dialog-actions exit-menu-actions");
  const saveButton = element("button", "primary", "Save and exit");
  const exitButton = element("button", "", "Exit without saving");
  const cancelButton = element("button", "", "Keep playing");
  const controls = [saveButton, exitButton, cancelButton];
  actions.append(...controls);
  dialog.footer.append(actions);
  function exit() {
    if (dialog.disposed) return;
    dialog.dispose();
    scene.scene.start("Title");
  }
  saveButton.addEventListener("click", async () => {
    if (saving || dialog.disposed) return;
    saving = true;
    controls.forEach((button) => {
      button.disabled = true;
    });
    status.textContent = "Saving…";
    try {
      const result = await save();
      if (result?.error) throw new Error(result.error);
      exit();
    } catch (error) {
      if (!dialog.disposed)
        status.textContent = `Could not save: ${error instanceof Error ? error.message : String(error)}. You are still in the game.`;
    } finally {
      saving = false;
      if (!dialog.disposed)
        controls.forEach((button) => {
          button.disabled = false;
        });
    }
  });
  exitButton.addEventListener("click", exit);
  cancelButton.addEventListener("click", () => dialog.dispose());
  saveButton.focus();
  return dialog;
}
