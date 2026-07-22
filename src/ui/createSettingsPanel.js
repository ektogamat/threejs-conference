import "./settingsPanel.css";
import {
  phosphorArrowCounterClockwise,
  phosphorCircleHalf,
  phosphorCloudRain,
  phosphorMoonStars,
  phosphorSunHorizon,
  phosphorX,
} from "./phosphorIcons.js";
import { LOOK_PRESETS, DEFAULT_LOOK_PRESET } from "../look/cyberpunkLook.js";

const LOOK_OPTIONS = [
  {
    id: "neutral",
    label: LOOK_PRESETS.neutral.label,
    icon: phosphorCircleHalf,
  },
  {
    id: "neonNoir",
    label: LOOK_PRESETS.neonNoir.label,
    icon: phosphorMoonStars,
  },
  {
    id: "magentaRain",
    label: LOOK_PRESETS.magentaRain.label,
    icon: phosphorCloudRain,
  },
  {
    id: "tealDusk",
    label: LOOK_PRESETS.tealDusk.label,
    icon: phosphorSunHorizon,
  },
];

function renderLookButtons() {
  return LOOK_OPTIONS.map(
    (option) => `
      <button
        type="button"
        class="settings-look-btn"
        data-look-preset="${option.id}"
        aria-pressed="false"
      >
        <span class="settings-look-icon">${option.icon}</span>
        <span class="settings-look-label">${option.label}</span>
      </button>
    `,
  ).join("");
}

export function createSettingsPanel({
  state,
  getDevelopmentMode = () => false,
  onDevelopmentModeChange,
  getCurrentLookPreset = () => DEFAULT_LOOK_PRESET,
  onLookPresetChange,
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
          <p class="settings-section-title">Look</p>
          <div class="settings-look-grid" role="group" aria-label="Color look">
            ${renderLookButtons()}
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
          Clears saved development preferences
        </p>
      </div>
    </div>
  `;

  const glass = root.querySelector(".settings-glass");
  const closeButton = root.querySelector(".settings-close");
  const devToggle = root.querySelector("[data-development-mode]");
  const restartButton = root.querySelector("[data-restart]");
  const lookButtons = [...root.querySelectorAll("[data-look-preset]")];

  function syncDevelopmentMode(enabled) {
    devToggle.checked = Boolean(enabled);
  }

  function syncLookPreset(presetId = getCurrentLookPreset()) {
    const activeId = LOOK_PRESETS[presetId] ? presetId : DEFAULT_LOOK_PRESET;

    for (const button of lookButtons) {
      const selected = button.dataset.lookPreset === activeId;
      button.classList.toggle("settings-look-btn--active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function open() {
    root.classList.remove("settings-overlay--force-hidden");
    syncDevelopmentMode(getDevelopmentMode());
    syncLookPreset();
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

  for (const button of lookButtons) {
    button.addEventListener("click", () => {
      const presetId = button.dataset.lookPreset;
      onLookPresetChange?.(presetId);
      syncLookPreset(presetId);
    });
  }

  devToggle.addEventListener("change", () => {
    onDevelopmentModeChange?.(devToggle.checked);
  });

  restartButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Restart the project? Saved development settings will be cleared.",
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
    syncLookPreset,
    destroy() {
      document.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
