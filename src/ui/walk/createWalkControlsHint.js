import "./walkControlsHint.css";
import { isDesktopPointerLayout } from "../../platform/deviceLayout.js";

const CLOSE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M18 6L6 18M6 6L18 18"
      stroke="currentColor"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;

const CHIP_ICON = `
  <svg class="walk-controls__chip-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect class="walk-controls__chip-key" x="8.5" y="3" width="7" height="5.5" rx="1" />
    <rect class="walk-controls__chip-key" x="3" y="10.5" width="5.5" height="5.5" rx="1" />
    <rect class="walk-controls__chip-key" x="9.25" y="10.5" width="5.5" height="5.5" rx="1" />
    <rect class="walk-controls__chip-key" x="15.5" y="10.5" width="5.5" height="5.5" rx="1" />
    <rect class="walk-controls__chip-key walk-controls__chip-key--shift" x="3" y="18" width="18" height="3" rx="0.75" />
  </svg>
`;

function renderKey(x, y, width, height, label, active = false, className = "") {
  const activeClass = active ? " walk-key--active" : "";
  const labelClass = active ? " walk-key-label walk-key-label--active" : " walk-key-label";
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  return `
    <rect class="walk-key${activeClass}${className ? ` ${className}` : ""}" x="${x}" y="${y}" width="${width}" height="${height}" />
    <text class="${labelClass.trim()}" x="${centerX}" y="${centerY}">${label}</text>
  `;
}

function renderMouse(x, y, scale = 1, active = false) {
  const activeClass = active ? " walk-mouse--active" : "";

  return `
    <g transform="translate(${x}, ${y}) scale(${scale})">
      <path class="walk-mouse${activeClass}" d="M12 22C16.13 22 19.5 18.63 19.5 14.5V9.5C19.5 5.37 16.13 2 12 2C7.87 2 4.5 5.37 4.5 9.5V14.5C4.5 18.63 7.87 22 12 22Z" />
      <path class="walk-mouse${activeClass}" d="M12 11C11.17 11 10.5 10.33 10.5 9.5V7.5C10.5 6.67 11.17 6 12 6C12.82 6 13.5 6.67 13.5 7.5V9.5C13.5 10.33 12.82 11 12 11Z" />
      <path class="walk-mouse${activeClass}" d="M12 6V2" />
    </g>
  `;
}

function renderCallout(x, y, width, title, copy) {
  const centerX = x + width / 2;

  return `
    <g class="walk-callout">
      <line class="walk-callout-accent" x1="${centerX - 16}" y1="${y}" x2="${centerX + 16}" y2="${y}" />
      <text class="walk-callout-title" x="${centerX}" y="${y + 22}">${title}</text>
      <text class="walk-callout-copy" x="${centerX}" y="${y + 40}">${copy}</text>
    </g>
  `;
}

function renderExpandedDiagram() {
  const keySize = 56;
  const gap = 8;
  const clusterX = 250;
  const clusterY = 132;

  return `
    <svg class="walk-controls__diagram" viewBox="0 0 860 440" role="img" aria-label="Walk mode controls">
      <line class="walk-leader" x1="430" y1="88" x2="${clusterX + keySize + gap}" y2="${clusterY - 6}" />
      <line class="walk-leader" x1="132" y1="268" x2="${clusterX + 12}" y2="${clusterY + keySize * 2 + gap + 20}" />
      <line class="walk-leader" x1="706" y1="268" x2="620" y2="236" />

      ${renderCallout(318, 28, 224, "Movement", "WASD to move")}
      ${renderCallout(38, 240, 188, "Sprint", "Hold Shift")}
      ${renderCallout(634, 240, 188, "Look", "Click to lock mouse")}

      ${renderKey(clusterX + keySize + gap, clusterY, keySize, keySize, "W", true)}
      ${renderKey(clusterX, clusterY + keySize + gap, keySize, keySize, "A", true)}
      ${renderKey(clusterX + keySize + gap, clusterY + keySize + gap, keySize, keySize, "S", true)}
      ${renderKey(clusterX + (keySize + gap) * 2, clusterY + keySize + gap, keySize, keySize, "D", true)}
      ${renderKey(clusterX - 18, clusterY + (keySize + gap) * 2 + 16, keySize * 3 + gap * 2 + 36, 40, "Shift", true, "walk-key--shift")}

      ${renderMouse(560, 156, 3.2, true)}
    </svg>
  `;
}

export function createWalkControlsHint({ state, domElement } = {}) {
  const root = document.createElement("div");
  root.className = "walk-controls walk-controls--hidden";
  root.setAttribute("data-ui-block-look", "true");
  root.innerHTML = `
    <button type="button" class="walk-controls__chip" aria-label="Show walk controls" aria-expanded="false">
      ${CHIP_ICON}
      <span class="walk-controls__chip-label">Controls</span>
    </button>

    <div class="walk-controls__overlay" hidden>
      <div class="walk-controls__backdrop" data-close="true"></div>
      <button type="button" class="walk-controls__close" aria-label="Close controls">
        ${CLOSE_ICON}
      </button>
      <div class="walk-controls__content" role="dialog" aria-modal="true" aria-label="Walk controls">
        <header class="walk-controls__header">
          <p class="walk-controls__eyebrow">Interface</p>
          <h2 class="walk-controls__title">Navigation</h2>
        </header>
        ${renderExpandedDiagram()}
        <p class="walk-controls__footer">Esc to close</p>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const chip = root.querySelector(".walk-controls__chip");
  const overlay = root.querySelector(".walk-controls__overlay");
  const backdrop = root.querySelector(".walk-controls__backdrop");
  const closeButton = root.querySelector(".walk-controls__close");

  let walkModeVisible = false;
  let forceHidden = false;
  let overlayOpen = false;

  function releasePointerLock() {
    if (domElement && document.pointerLockElement === domElement) {
      document.exitPointerLock?.();
    }
  }

  function applyVisibility() {
    const showChip =
      walkModeVisible &&
      !forceHidden &&
      isDesktopPointerLayout() &&
      !overlayOpen;

    root.classList.toggle("walk-controls--hidden", !showChip);
    root.classList.toggle("walk-controls--force-hidden", forceHidden && !overlayOpen);
    // Lift above header (z-index 1000) while the overlay is open.
    root.classList.toggle("walk-controls--overlay-open", overlayOpen);
  }

  function openOverlay() {
    if (overlayOpen) {
      return;
    }

    releasePointerLock();
    overlayOpen = true;
    overlay.hidden = false;
    chip.setAttribute("aria-expanded", "true");
    state?.openPanel?.("walk-controls");
    applyVisibility();
  }

  function closeOverlay({ skipStateClose = false } = {}) {
    if (!overlayOpen) {
      return;
    }

    overlayOpen = false;
    overlay.hidden = true;
    chip.setAttribute("aria-expanded", "false");

    if (!skipStateClose && state?.openedPanel === "walk-controls") {
      state.closePanel();
    }

    applyVisibility();
  }

  function onStateChange({ openedPanel }) {
    if (overlayOpen && openedPanel !== "walk-controls") {
      closeOverlay({ skipStateClose: true });
    }
  }

  const unsubscribeState = state?.subscribe?.(onStateChange);

  function onOverlayKeyDown(event) {
    if (event.code === "Escape" && overlayOpen) {
      event.preventDefault();
      closeOverlay();
    }
  }

  chip.addEventListener("click", openOverlay);
  backdrop.addEventListener("click", closeOverlay);
  closeButton.addEventListener("click", closeOverlay);
  window.addEventListener("keydown", onOverlayKeyDown);

  function setVisible(visible) {
    walkModeVisible = visible;
    if (!visible) {
      closeOverlay();
    }
    applyVisibility();
  }

  function setForceHidden(hidden) {
    forceHidden = hidden;
    applyVisibility();
  }

  function destroy() {
    closeOverlay();
    unsubscribeState?.();
    window.removeEventListener("keydown", onOverlayKeyDown);
    root.remove();
  }

  return {
    setVisible,
    setForceHidden,
    isOverlayOpen: () => overlayOpen,
    destroy,
  };
}
