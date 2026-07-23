import "./moveHint.css";
import { isCoarsePointerDevice } from "../../platform/deviceLayout.js";

const MOVE_HINT_DELAY_MS = 5000;

const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function renderMiniWasd() {
  const size = 22;
  const gap = 4;
  const width = size * 3 + gap * 2;
  const height = size * 2 + gap;

  return `
    <svg class="move-hint__keys" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <rect class="move-hint__key move-hint__key--active" x="${size + gap}" y="0" width="${size}" height="${size}" rx="2" />
      <text class="move-hint__key-label move-hint__key-label--active" x="${size + gap + size / 2}" y="${size / 2}">W</text>

      <rect class="move-hint__key move-hint__key--active" x="0" y="${size + gap}" width="${size}" height="${size}" rx="2" />
      <text class="move-hint__key-label move-hint__key-label--active" x="${size / 2}" y="${size + gap + size / 2}">A</text>

      <rect class="move-hint__key move-hint__key--active" x="${size + gap}" y="${size + gap}" width="${size}" height="${size}" rx="2" />
      <text class="move-hint__key-label move-hint__key-label--active" x="${size + gap + size / 2}" y="${size + gap + size / 2}">S</text>

      <rect class="move-hint__key move-hint__key--active" x="${(size + gap) * 2}" y="${size + gap}" width="${size}" height="${size}" rx="2" />
      <text class="move-hint__key-label move-hint__key-label--active" x="${(size + gap) * 2 + size / 2}" y="${size + gap + size / 2}">D</text>
    </svg>
  `;
}

/**
 * Small WASD tip after pointer lock, if the player doesn't move within 5s.
 * Session-only: once they walk, it won't return until the page reloads.
 */
export function createMoveHint({ walkControls, state } = {}) {
  const root = document.createElement("div");
  root.className = "move-hint";
  root.setAttribute("data-ui-block-look", "true");
  root.hidden = true;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <div class="move-hint__frame">
      <span class="move-hint__corner move-hint__corner--tl"></span>
      <span class="move-hint__corner move-hint__corner--tr"></span>
      <span class="move-hint__corner move-hint__corner--bl"></span>
      <span class="move-hint__corner move-hint__corner--br"></span>
      <div class="move-hint__inner">
        ${renderMiniWasd()}
        <div class="move-hint__copy">
          <span class="move-hint__kicker">Movement</span>
          <span class="move-hint__title">Use WASD to walk</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  let enabled = false;
  let movedThisSession = false;
  let visible = false;
  let panelOpen = Boolean(state?.openedPanel);
  let delayTimerId = null;

  function clearDelayTimer() {
    if (delayTimerId) {
      window.clearTimeout(delayTimerId);
      delayTimerId = null;
    }
  }

  function setVisible(next) {
    visible = next;
    root.hidden = !next;
    root.classList.toggle("move-hint--visible", next);
  }

  function hide() {
    clearDelayTimer();
    setVisible(false);
  }

  function markMoved() {
    if (movedThisSession) {
      return;
    }

    movedThisSession = true;
    hide();
  }

  function shouldUseDesktopHint() {
    return !isCoarsePointerDevice();
  }

  function scheduleHint() {
    clearDelayTimer();

    if (
      !shouldUseDesktopHint() ||
      !enabled ||
      movedThisSession ||
      panelOpen ||
      !document.pointerLockElement
    ) {
      return;
    }

    delayTimerId = window.setTimeout(() => {
      delayTimerId = null;

      if (
        !shouldUseDesktopHint() ||
        !enabled ||
        movedThisSession ||
        panelOpen ||
        !document.pointerLockElement
      ) {
        return;
      }

      setVisible(true);
    }, MOVE_HINT_DELAY_MS);
  }

  function onPointerLockChange() {
    if (!enabled || movedThisSession || panelOpen) {
      hide();
      return;
    }

    if (document.pointerLockElement) {
      // Looking around — wait before nudging about WASD.
      setVisible(false);
      scheduleHint();
      return;
    }

    hide();
  }

  function onKeyDown(event) {
    if (!MOVE_KEYS.has(event.code)) {
      return;
    }

    markMoved();
  }

  function onWalkChange({ moving } = {}) {
    if (moving) {
      markMoved();
    }
  }

  function setEnabled(next) {
    enabled = Boolean(next);

    if (!enabled || !shouldUseDesktopHint()) {
      hide();
      return;
    }

    onPointerLockChange();
  }

  document.addEventListener("pointerlockchange", onPointerLockChange);
  window.addEventListener("keydown", onKeyDown);
  const unsubscribe = walkControls?.subscribe?.(onWalkChange);
  const unsubscribeState = state?.subscribe?.(({ openedPanel }) => {
    panelOpen = Boolean(openedPanel);
    if (panelOpen) {
      hide();
      return;
    }
    onPointerLockChange();
  });

  return {
    root,
    setEnabled,
    destroy() {
      clearDelayTimer();
      unsubscribe?.();
      unsubscribeState?.();
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
