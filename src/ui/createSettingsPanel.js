import "./settingsPanel.css";
import { RENDER_MODE_OPTIONS } from "../renderModes.js";
import {
  phosphorArrowCounterClockwise,
  phosphorX,
} from "./phosphorIcons.js";

function buildRenderModeOptionsMarkup() {
  return RENDER_MODE_OPTIONS.map(
    (option) => `
      <label class="settings-render-option">
        <input
          type="radio"
          class="settings-render-input"
          name="render-mode"
          value="${option.id}"
          data-render-mode="${option.id}"
          aria-label="${option.title}"
        />
        <span class="settings-render-card">
          <span class="settings-option-title">${option.title}</span>
          <span class="settings-option-desc">${option.description}</span>
        </span>
      </label>
    `,
  ).join("");
}

export function createSettingsPanel({
  state,
  getDevelopmentMode = () => false,
  getRenderMode = () => "highEnd",
  onDevelopmentModeChange,
  onRenderModeChange,
  onRestart,
} = {}) {
  const root = document.createElement("div");
  root.className = "settings-overlay";
  root.hidden = true;
  root.innerHTML = `
    <div class="settings-glass" role="dialog" aria-modal="true" aria-label="Settings">
      <button type="button" class="settings-close" aria-label="Close">
        ${phosphorX}
      </button>

      <div class="settings-options">
        <div class="settings-section">
          <h3 class="settings-section-title">Graphics</h3>
          <div class="settings-render-options">
            ${buildRenderModeOptionsMarkup()}
          </div>
        </div>

        <div class="settings-divider" role="separator"></div>

        <label class="settings-option">
          <span class="settings-option-text">
            <span class="settings-option-title">Development mode</span>
          </span>
          <input
            type="checkbox"
            class="settings-toggle-input"
            data-development-mode
            aria-label="Development mode"
          />
          <span class="settings-toggle" aria-hidden="true"></span>
        </label>

        <div class="settings-divider" role="separator"></div>

        <button type="button" class="settings-restart-btn" data-restart>
          <span class="settings-restart-icon">${phosphorArrowCounterClockwise}</span>
          <span>Restart project</span>
        </button>
        <p class="settings-restart-hint">
          Clears saved camera, sun, and quality preferences
        </p>
      </div>
    </div>
  `;

  const glass = root.querySelector(".settings-glass");
  const closeButton = root.querySelector(".settings-close");
  const devToggle = root.querySelector("[data-development-mode]");
  const restartButton = root.querySelector("[data-restart]");
  const renderModeInputs = [...root.querySelectorAll("[data-render-mode]")];

  function syncDevelopmentMode(enabled) {
    devToggle.checked = Boolean(enabled);
  }

  function syncRenderMode(mode) {
    for (const input of renderModeInputs) {
      input.checked = input.value === mode;
    }
  }

  function open() {
    root.classList.remove("settings-overlay--force-hidden");
    syncDevelopmentMode(getDevelopmentMode());
    syncRenderMode(getRenderMode());
    root.hidden = false;
  }

  function close() {
    root.hidden = true;
    state?.closePanel();
  }

  function setForceHidden(hidden) {
    if (hidden && !root.hidden) {
      return;
    }

    root.classList.toggle("settings-overlay--force-hidden", hidden);
  }

  root.addEventListener("pointerdown", () => {
    state?.showAllUi?.();
  });

  root.addEventListener("click", (event) => {
    if (event.target === root) {
      close();
    }
  });

  closeButton.addEventListener("click", close);

  glass.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  devToggle.addEventListener("change", () => {
    onDevelopmentModeChange?.(devToggle.checked);
  });

  for (const input of renderModeInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) {
        return;
      }

      onRenderModeChange?.(input.value);
    });
  }

  restartButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Restart the project? Saved camera, sun, and quality settings will be cleared.",
    );
    if (!confirmed) {
      return;
    }

    onRestart?.();
    close();
  });

  function onKeyDown(event) {
    if (event.key === "Escape" && !root.hidden) {
      close();
    }
  }

  document.addEventListener("keydown", onKeyDown);

  state?.subscribe(({ openedPanel }) => {
    if (openedPanel === "settings") {
      open();
    } else if (!root.hidden) {
      root.hidden = true;
    }
  });

  document.body.appendChild(root);

  return {
    root,
    open,
    close,
    setForceHidden,
    syncDevelopmentMode,
    syncRenderMode,
    destroy() {
      document.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
