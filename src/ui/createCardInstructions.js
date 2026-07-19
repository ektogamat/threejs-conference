import "./cardInstructions.css";
import gsap from "gsap";
import { paintBrushIcon } from "./phosphorIcons.js";

const DESKTOP_TEXT = `
  <h2 class="card-title">Paint your space with light</h2>
  <p class="card-copy">
    Hover surfaces to highlight them, click to open the color palette,
    and shift the time of day to see how sunlight reshapes every tone.
  </p>
`;

const MOBILE_TEXT = `
  <h2 class="card-title">Welcome</h2>
  <p class="card-copy">
    Tap a surface to open the color picker. Shift the time of day to see
    how sunlight reshapes every tone.
  </p>
`;

function isMobileViewport() {
  return window.innerWidth < 768;
}

export function createCardInstructions({ onDismiss } = {}) {
  let visible = false;
  let exiting = false;
  let root = null;
  let cardEl = null;
  let okButton = null;
  let documentPointerHandler = null;

  function buildMarkup() {
    const isMobile = isMobileViewport();

    root = document.createElement("section");
    root.className = "wrapper-card";
    root.setAttribute("aria-live", "polite");

    root.innerHTML = `
      <div class="card-instructions">
        <div class="card-icon" aria-hidden="true">${paintBrushIcon}</div>
        <div class="card-body">
          ${isMobile ? MOBILE_TEXT : DESKTOP_TEXT}
        </div>
        <button type="button" class="button">OK</button>
      </div>
    `;

    cardEl = root.querySelector(".card-instructions");
    okButton = root.querySelector(".button");
  }

  function removeDocumentPointerListener() {
    if (documentPointerHandler) {
      document.removeEventListener("pointerdown", documentPointerHandler);
      documentPointerHandler = null;
    }
  }

  function dismiss() {
    if (!visible || exiting || !cardEl) {
      return;
    }

    exiting = true;
    removeDocumentPointerListener();

    gsap.to(cardEl, {
      opacity: 0,
      y: 50,
      duration: 0.8,
      ease: "power2.inOut",
      onComplete: () => {
        visible = false;
        root?.remove();
        root = null;
        cardEl = null;
        okButton = null;
        onDismiss?.();
      },
    });
  }

  function show() {
    if (visible) {
      return;
    }

    buildMarkup();
    visible = true;
    exiting = false;

    document.body.appendChild(root);

    gsap.set(cardEl, { opacity: 0, y: 50 });
    gsap.to(cardEl, {
      opacity: 1,
      y: 0,
      duration: 2,
      delay: 2,
      ease: "power2.inOut",
    });

    okButton.addEventListener("click", dismiss);

    documentPointerHandler = () => {
      dismiss();
    };
    document.addEventListener("pointerdown", documentPointerHandler);
  }

  function destroy() {
    removeDocumentPointerListener();
    okButton?.removeEventListener("click", dismiss);
    root?.remove();
    root = null;
    cardEl = null;
    okButton = null;
    visible = false;
    exiting = false;
  }

  return {
    show,
    destroy,
  };
}
