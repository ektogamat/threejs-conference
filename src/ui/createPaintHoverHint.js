import "./paintHoverHint.css";
import { buildPaintBrushCursorCSSValue } from "./phosphorIcons.js";

function resolveHintMessage() {
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(pointer: coarse)").matches) {
      return "Tap to change color";
    }
  }

  return "Click to change color";
}

function supportsCustomCursor() {
  return (
    typeof window.matchMedia !== "function" ||
    !window.matchMedia("(pointer: coarse)").matches
  );
}

export function createPaintHoverHint({ domElement } = {}) {
  const status = document.createElement("div");
  status.className = "paint-hover-hint-sr";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  document.body.appendChild(status);

  const canUseCursor = supportsCustomCursor();
  const paintBrushCursor = buildPaintBrushCursorCSSValue();
  let visible = false;

  return {
    show() {
      if (visible) {
        return;
      }

      visible = true;

      if (!domElement || !canUseCursor) {
        return;
      }

      domElement.style.cursor = paintBrushCursor;
      status.hidden = false;
      status.textContent = resolveHintMessage();
    },
    hide() {
      if (!visible) {
        return;
      }

      visible = false;

      if (domElement) {
        domElement.style.cursor = "";
      }

      status.hidden = true;
      status.textContent = "";
    },
    destroy() {
      visible = false;

      if (domElement) {
        domElement.style.cursor = "";
      }

      status.remove();
    },
  };
}
