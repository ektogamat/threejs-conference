import "./screenshotButton.css";
import { phosphorCamera } from "./phosphorIcons.js";

export function createScreenshotButton({ onCapture } = {}) {
  const root = document.createElement("div");
  root.className = "screenshot-btn-root";
  root.innerHTML = `
    <button type="button" class="screenshot-btn" aria-label="Save image">
      <span class="screenshot-btn-icon">${phosphorCamera}</span>
      <span class="screenshot-btn-label">Save image</span>
    </button>
  `;

  const button = root.querySelector(".screenshot-btn");
  let capturing = false;

  function setCapturing(nextCapturing) {
    capturing = nextCapturing;
    button.disabled = nextCapturing;
    root.classList.toggle("screenshot-btn-root--capturing", nextCapturing);
  }

  button.addEventListener("click", async () => {
    if (capturing) {
      return;
    }

    setCapturing(true);
    try {
      await onCapture?.();
    } finally {
      setCapturing(false);
    }
  });

  document.body.appendChild(root);

  function setVisible(visible) {
    root.classList.toggle("screenshot-btn-root--hidden", !visible);
    root.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setForceHidden(hidden) {
    root.classList.toggle("screenshot-btn-root--force-hidden", hidden);
  }

  return {
    root,
    setVisible,
    setForceHidden,
    destroy() {
      root.remove();
    },
  };
}
