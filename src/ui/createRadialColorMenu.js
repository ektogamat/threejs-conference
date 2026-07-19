import "./radialColorMenu.css";
import {
  closeRadialMenu,
  openRadialMenu,
  subscribeRadialMenu,
} from "./radialMenuState.js";

const CLOSE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
`;

export function createRadialColorMenu({ onColorSelect } = {}) {
  const root = document.createElement("div");
  root.className = "radial-color-menu-root";
  root.hidden = true;

  document.body.appendChild(root);

  let isAnimating = false;
  let unsubscribe = null;
  let escapeHandler = null;
  let outsideClickHandler = null;

  function removeGlobalListeners() {
    if (escapeHandler) {
      window.removeEventListener("keydown", escapeHandler);
      escapeHandler = null;
    }
    if (outsideClickHandler) {
      window.removeEventListener("mousedown", outsideClickHandler);
      outsideClickHandler = null;
    }
  }

  function render(state) {
    if (!state.radialMenuOpen) {
      root.hidden = true;
      root.innerHTML = "";
      isAnimating = false;
      removeGlobalListeners();
      return;
    }

    root.hidden = false;
    isAnimating = false;

    root.innerHTML = `
      <div class="radial-color-menu-backdrop">
        <div
          class="radial-color-menu"
          style="left: ${state.radialMenuPosition.x}px; top: ${state.radialMenuPosition.y}px;"
        >
          <button type="button" class="radial-trigger-button" aria-label="Close color menu">
            ${CLOSE_ICON}
          </button>
          <ul class="radial-menu-list" style="--countItem: ${state.radialMenuColors.length}">
            ${state.radialMenuColors
              .map(
                (color, index) => `
              <li class="radial-menu-item">
                <button
                  type="button"
                  class="radial-color-button ${
                    index === state.radialMenuActiveIndex ? "active" : ""
                  }"
                  style="background-color: ${color}"
                  title="${color}"
                  data-index="${index}"
                  data-color="${color}"
                ></button>
              </li>
            `,
              )
              .join("")}
          </ul>
        </div>
      </div>
    `;

    const backdrop = root.querySelector(".radial-color-menu-backdrop");
    const menu = root.querySelector(".radial-color-menu");
    const closeButton = root.querySelector(".radial-trigger-button");
    const colorButtons = root.querySelectorAll(".radial-color-button");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        menu?.classList.add("active");
        isAnimating = true;
      });
    });

    closeButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeRadialMenu();
    });

    backdrop?.addEventListener("touchstart", (event) => {
      if (event.target === backdrop) {
        closeRadialMenu();
      }
    });

    menu?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    for (const button of colorButtons) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const index = Number(button.dataset.index);
        const color = button.dataset.color;
        const target = state.radialMenuTarget;
        closeRadialMenu();
        onColorSelect?.(color, index, target);
      });
    }

    escapeHandler = (event) => {
      if (event.key === "Escape") {
        closeRadialMenu();
      }
    };

    outsideClickHandler = (event) => {
      if (!event.target.closest(".radial-color-menu")) {
        closeRadialMenu();
      }
    };

    window.addEventListener("keydown", escapeHandler);
    window.addEventListener("mousedown", outsideClickHandler);
  }

  unsubscribe = subscribeRadialMenu(render);

  return {
    open(options) {
      openRadialMenu(options);
    },
    close() {
      closeRadialMenu();
    },
    destroy() {
      unsubscribe?.();
      removeGlobalListeners();
      root.remove();
    },
  };
}
