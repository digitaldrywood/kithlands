import { beforeEach, expect, it, vi } from "vitest";
const ui = vi.hoisted(() => ({ nodes: [], options: null, dialog: null }));
vi.mock("../ui/viewport_dialog.js", () => ({
  element: (tag, className, textContent = "") => {
    const node = {
      tag,
      textContent,
      disabled: false,
      handlers: {},
      append: vi.fn(),
      setAttribute: vi.fn(),
      focus: vi.fn(),
      addEventListener(event, handler) {
        this.handlers[event] = handler;
      },
    };
    ui.nodes.push(node);
    return node;
  },
  viewportDialog: (_scene, options) => {
    ui.options = options;
    ui.dialog = {
      disposed: false,
      body: { append: vi.fn() },
      footer: { append: vi.fn() },
      dispose: vi.fn(() => {
        ui.dialog.disposed = true;
      }),
    };
    return ui.dialog;
  },
}));
import { showExitMenu } from "./exit_menu.js";
const button = (text) =>
  ui.nodes.find((node) => node.tag === "button" && node.textContent === text);
let scene;
beforeEach(() => {
  ui.nodes = [];
  scene = { scene: { start: vi.fn() } };
});
it("keeps the game running on cancel and Escape", () => {
  const save = vi.fn();
  showExitMenu(scene, save);
  ui.options.onEscape();
  expect(ui.dialog.disposed).toBe(true);
  expect(save).not.toHaveBeenCalled();
  expect(scene.scene.start).not.toHaveBeenCalled();
});
it("exits without issuing a save when explicitly chosen", () => {
  const save = vi.fn();
  showExitMenu(scene, save);
  button("Exit without saving").handlers.click();
  expect(save).not.toHaveBeenCalled();
  expect(scene.scene.start).toHaveBeenCalledWith("Title");
});
it("waits for saving and blocks duplicate requests and Escape", async () => {
  let finish;
  const save = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  showExitMenu(scene, save);
  const pending = button("Save and exit").handlers.click();
  await button("Save and exit").handlers.click();
  ui.options.onEscape();
  expect(ui.dialog.disposed).toBe(false);
  expect(button("Exit without saving").disabled).toBe(true);
  expect(scene.scene.start).not.toHaveBeenCalled();
  finish({ status: "saved" });
  await pending;
  expect(save).toHaveBeenCalledOnce();
  expect(scene.scene.start).toHaveBeenCalledWith("Title");
});
it.each(["response", "network"])(
  "keeps the game available after a %s save error",
  async (kind) => {
    const save =
      kind === "response"
        ? vi.fn().mockResolvedValue({ error: "offline" })
        : vi.fn().mockRejectedValue(new Error("offline"));
    showExitMenu(scene, save);
    await button("Save and exit").handlers.click();
    expect(scene.scene.start).not.toHaveBeenCalled();
    expect(ui.dialog.disposed).toBe(false);
    expect(button("Save and exit").disabled).toBe(false);
    expect(
      ui.nodes.some((node) =>
        node.textContent.includes("Could not save: offline"),
      ),
    ).toBe(true);
  },
);
