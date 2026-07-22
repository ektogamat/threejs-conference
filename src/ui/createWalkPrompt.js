import "./walkPrompt.css";

/**
 * HUD tip shown whenever pointer lock is unlocked.
 * Uses Document.pointerLockElement + pointerlockchange
 * (https://developer.mozilla.org/en-US/docs/Web/API/Document/pointerLockElement).
 */
export function createWalkPrompt({ domElement } = {}) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "walk-prompt";
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

  let enabled = false;

  function isPointerLocked() {
    return document.pointerLockElement != null;
  }

  function sync() {
    const shouldShow = enabled && !isPointerLocked();
    root.hidden = !shouldShow;
    root.classList.toggle("walk-prompt--visible", shouldShow);
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    sync();
  }

  function onPointerLockChange() {
    sync();
  }

  function onClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!domElement || isPointerLocked()) {
      return;
    }

    domElement.requestPointerLock();
  }

  document.addEventListener("pointerlockchange", onPointerLockChange);
  root.addEventListener("click", onClick);

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
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      root.removeEventListener("click", onClick);
      root.remove();
    },
  };
}
