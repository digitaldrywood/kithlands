import { element } from "./viewport_dialog.js";
import "../styles/title-screen.css";

export function titleScreen(scene, mode = "main") {
  const root = element(
    "main",
    `kith-title-screen ${mode === "load" ? "is-load" : ""}`,
  );
  root.setAttribute("aria-label", "Kithlands main menu");
  const art = element("img", "title-cover");
  art.src = "/art/title/kithlands-dawn.png";
  art.alt =
    "Four adventurers overlook a riverside village beneath an ancient tower at dawn.";
  root.append(art, element("div", "title-shade"));
  const content = element("section", "title-content");
  const brand = element("header", "title-brand");
  brand.append(
    element("p", "title-eyebrow", "A WORLD THAT BEGINS WITH YOU"),
    element("h1", "", "Kithlands"),
    element("p", "title-tagline", "Your town. Your people. Your saga."),
  );
  const body = element("div", "title-menu");
  const status = element("p", "title-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  content.append(brand, body, status);
  root.append(
    content,
    element(
      "p",
      "title-footer",
      "A familiar place. An extraordinary adventure.",
    ),
  );
  (document.querySelector("#game-ui") || document.body).append(root);
  const dispose = () => {
    root.remove();
    scene.events.off("shutdown", dispose);
  };
  scene.events.once("shutdown", dispose);
  const statusText = {
    setText(text) {
      status.textContent = text;
      return this;
    },
    setColor(color) {
      status.style.color = color === "#ff4444" ? "#ffb9a9" : "#d9dfdc";
      return this;
    },
  };
  function action(label, subtitle, callback, primary = false) {
    const button = element(
      "button",
      `title-action${primary ? " primary" : ""}`,
    );
    button.type = "button";
    const words = element("span", "title-action-words");
    words.append(element("strong", "", label));
    if (subtitle) words.append(element("span", "", subtitle));
    button.append(words, element("span", "title-arrow", "↗"));
    button.addEventListener("click", callback);
    body.append(button);
    return button;
  }
  return { root, body, statusText, action, dispose };
}

export function titleAccount(body, email) {
  const label = element("label", "title-account");
  label.append(element("span", "", "Player email"));
  const input = element("input");
  input.type = "email";
  input.autocomplete = "email";
  input.value = email || "";
  input.placeholder = "you@example.com";
  label.append(input);
  body.append(label);
  return input;
}
