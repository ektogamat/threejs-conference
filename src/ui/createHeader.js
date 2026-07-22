import "./header.css";
import { phosphorGearSix } from "./phosphorIcons.js";
import { createHudPanel } from "./createHudPanel.js";

export function createHeader({ state, onOpenSettings, onOpenAbout } = {}) {
  const root = document.createElement("div");
  // Hidden until revealAppUi — coordinator mounts later in init.
  root.className = "app-header app-header--force-hidden";
  root.innerHTML = `
    <div class="app-header-brand"></div>
    <div class="app-header-actions">
      <button type="button" class="app-header-about-btn">ABOUT</button>
      <button type="button" class="app-header-action-btn app-header-icon-btn app-header-settings-btn" aria-label="Settings">
        <span class="app-header-action-icon">${phosphorGearSix}</span>
      </button>
    </div>
  `;

  const brandSlot = root.querySelector(".app-header-brand");
  const hud = createHudPanel();
  brandSlot.appendChild(hud.root);

  const settingsButton = root.querySelector(".app-header-settings-btn");
  const aboutButton = root.querySelector(".app-header-about-btn");

  settingsButton.addEventListener("click", (event) => {
    event.stopPropagation();
    state?.showAllUi?.();
    state?.openPanel("settings");
    onOpenSettings?.();
  });

  aboutButton.addEventListener("click", (event) => {
    event.stopPropagation();
    state?.showAllUi?.();
    state?.openPanel("about");
    onOpenAbout?.();
  });

  document.body.appendChild(root);

  function show() {
    root.classList.add("show");
  }

  function hide() {
    root.classList.remove("show");
  }

  function setForceHidden(hidden) {
    root.classList.toggle("app-header--force-hidden", hidden);
  }

  return { root, show, hide, setForceHidden, bindWalkControls: hud.bindWalkControls, updateHud: hud.update };
}
