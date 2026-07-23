import "./walkPrompt.css";
import { isCoarsePointerDevice } from "../../platform/deviceLayout.js";

/**
 * HUD tip shown whenever pointer lock is unlocked (desktop) or before the
 * first touch look (mobile).
 */
export function createWalkPrompt({ domElement, walkControls, state } = {}) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "walk-prompt";
  root.setAttribute("data-ui-block-look", "true");
  root.hidden = true;
  root.setAttribute("aria-label", "Click to activate walk mode");
  root.innerHTML = `
    <div class="walk-prompt-frame">
      <div class="walk-prompt-pulse" aria-hidden="true"></div>
      <span class="walk-prompt-corner walk-prompt-corner--tl"></span>
      <span class="walk-prompt-corner walk-prompt-corner--tr"></span>
      <span class="walk-prompt-corner walk-prompt-corner--bl"></span>
      <span class="walk-prompt-corner walk-prompt-corner--br"></span>
      <div class="walk-prompt-inner">
        <span class="walk-prompt-kicker">Walk mode</span>
        <span class="walk-prompt-title">Click to look around</span>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const titleEl = root.querySelector(".walk-prompt-title");

  let enabled = false;
  let panelOpen = Boolean(state?.openedPanel);
  let hasTouchLooked = walkControls?.hasTouchLooked?.() ?? false;

  function isPointerLocked() {
    return document.pointerLockElement != null;
  }

  function syncCopy() {
    if (isCoarsePointerDevice()) {
      titleEl.textContent = "Drag to look around";
      root.setAttribute("aria-label", "Drag to look around");
      root.classList.add("walk-prompt--passive");
    } else {
      titleEl.textContent = "Click to look around";
      root.setAttribute("aria-label", "Click to activate walk mode");
      root.classList.remove("walk-prompt--passive");
    }
  }

  function sync() {
    syncCopy();

    const coarse = isCoarsePointerDevice();
    const shouldShow = coarse
      ? enabled && !hasTouchLooked && !panelOpen
      : enabled && !isPointerLocked() && !panelOpen;

    root.hidden = !shouldShow;
    root.classList.toggle("walk-prompt--visible", shouldShow);
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    sync();
  }

  function onPointerLockChange() {
    if (isCoarsePointerDevice()) {
      return;
    }

    sync();
  }

  function onClick(event) {
    if (isCoarsePointerDevice()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!domElement || isPointerLocked() || panelOpen) {
      return;
    }

    domElement.requestPointerLock();
  }

  function onWalkChange({ hasTouchLooked: nextHasTouchLooked } = {}) {
    if (!isCoarsePointerDevice()) {
      return;
    }

    hasTouchLooked = Boolean(nextHasTouchLooked);
    sync();
  }

  document.addEventListener("pointerlockchange", onPointerLockChange);
  root.addEventListener("click", onClick);
  const unsubscribeWalk = walkControls?.subscribe?.(onWalkChange);
  const unsubscribeState = state?.subscribe?.(({ openedPanel }) => {
    panelOpen = Boolean(openedPanel);
    sync();
  });

  return {
    root,
    setEnabled,
    show() {
      setEnabled(true);
    },
    hide() {
      setEnabled(false);
    },
    destroy() {
      unsubscribeWalk?.();
      unsubscribeState?.();
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      root.removeEventListener("click", onClick);
      root.remove();
    },
  };
}
