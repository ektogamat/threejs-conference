import "./cameraViewsPanel.css";

const VIDEO_ICON = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="2"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path>
    <rect width="14" height="12" x="2" y="6" rx="2"></rect>
  </svg>
`;

const CLOSE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
`;

export function createCameraViewsPanel({
  state,
  presets = [],
  onSelectPreset,
  getActivePreset,
} = {}) {
  const root = document.createElement("div");
  root.className = "camera-views-root";

  root.innerHTML = `
    <button
      type="button"
      class="camera-views-toggle"
      aria-label="Camera views"
      aria-expanded="false"
    >
      ${VIDEO_ICON}
    </button>
    <div class="camera-views-wrapper" hidden>
      <div class="camera-views-panel">
        <div class="camera-views-header">
          <button type="button" class="close-button-camera-views" aria-label="Close">
            ${CLOSE_ICON}
          </button>
        </div>
        <div class="camera-views-grid"></div>
      </div>
    </div>
  `;

  const toggleButton = root.querySelector(".camera-views-toggle");
  const wrapper = root.querySelector(".camera-views-wrapper");
  const grid = root.querySelector(".camera-views-grid");
  const closeButton = root.querySelector(".close-button-camera-views");

  const presetButtons = presets.map((preset, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "camera-view-item";
    button.dataset.presetId = preset.id;
    button.innerHTML = `
      <img
        class="camera-view-thumb"
        src="/camera${preset.id}.jpg"
        alt=""
        loading="lazy"
        draggable="false"
      />
      <span class="camera-view-index">${index + 1}</span>
    `;
    button.setAttribute("aria-label", `Camera view ${index + 1}`);
    button.addEventListener("click", () => {
      onSelectPreset?.(preset.id);
      updateActiveState();
      close();
    });
    grid.appendChild(button);
    return button;
  });

  function updateActiveState() {
    const activeId = getActivePreset?.();
    for (const button of presetButtons) {
      button.classList.toggle("active", button.dataset.presetId === activeId);
    }
  }

  function open() {
    wrapper.hidden = false;
    toggleButton.setAttribute("aria-expanded", "true");
    updateActiveState();
  }

  function close() {
    wrapper.hidden = true;
    toggleButton.setAttribute("aria-expanded", "false");
    state?.closePanel();
  }

  toggleButton.addEventListener("click", () => {
    if (wrapper.hidden) {
      state?.openPanel("camera-views");
    } else {
      close();
    }
  });

  closeButton.addEventListener("click", close);

  function onKeyDown(event) {
    if (event.key === "Escape" && !wrapper.hidden) {
      close();
    }
  }

  document.addEventListener("keydown", onKeyDown);

  state?.subscribe(({ openedPanel }) => {
    if (openedPanel === "camera-views") {
      open();
    } else if (!wrapper.hidden) {
      wrapper.hidden = true;
      toggleButton.setAttribute("aria-expanded", "false");
    }
  });

  function setVisible(visible) {
    root.classList.toggle("camera-views-root--hidden", !visible);
    root.setAttribute("aria-hidden", visible ? "false" : "true");
    if (!visible) {
      close();
    }
  }

  function setForceHidden(hidden) {
    root.classList.toggle("camera-views-root--force-hidden", hidden);
  }

  document.body.appendChild(root);
  updateActiveState();
  setVisible(false);

  return {
    root,
    open,
    close,
    updateActiveState,
    setVisible,
    setForceHidden,
    destroy() {
      document.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
