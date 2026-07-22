import "./aboutPanel.css";

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

export function createAboutPanel({ state } = {}) {
  const root = document.createElement("div");
  root.className = "about-overlay";
  root.hidden = true;
  root.innerHTML = `
    <div class="panel about">
      <button type="button" class="close-button-panel" aria-label="Close">
        ${CLOSE_ICON}
      </button>

      <div class="about-body">
        <p class="about-lead">
          Threejs-Punk is a raining scene inspired in CyberPunk — built by
          Anderson Mancini and Sunag.
        </p>
        <p class="about-lead">
          Wander a neon-lit alley under the rain: wet streets, glowing signs,
          and cinematic atmosphere rendered in real time with Three.js WebGPU
          and TSL.
        </p>
        <p class="about-lead">
          Made for the Three.js Conference — a small invitation to step into
          a cyberpunk night and feel how light and weather shape the mood.
        </p>
      </div>

      <div class="about-footer">
        <div class="about-buttons">
          <button type="button" class="refresh-button-panel">
            Visit portfolio
          </button>
        </div>
        <p class="about-model-credits">
          By Anderson Mancini &amp; Sunag
        </p>
      </div>
    </div>
  `;

  const panel = root.querySelector(".panel.about");
  const closeButton = root.querySelector(".close-button-panel");
  const portfolioButton = root.querySelector(".refresh-button-panel");

  function open() {
    root.classList.remove("about-overlay--force-hidden");
    root.hidden = false;
  }

  function close() {
    root.hidden = true;
    state?.closePanel();
  }

  closeButton.addEventListener("click", close);

  root.addEventListener("click", (event) => {
    if (event.target === root) {
      close();
    }
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  portfolioButton.addEventListener("click", () => {
    window.open("https://andersonmancini.dev", "_blank", "noopener,noreferrer");
  });

  function onKeyDown(event) {
    if (event.key === "Escape" && !root.hidden) {
      close();
    }
  }

  document.addEventListener("keydown", onKeyDown);

  state?.subscribe(({ openedPanel }) => {
    if (openedPanel === "about") {
      open();
    } else if (!root.hidden) {
      root.hidden = true;
    }
  });

  function setForceHidden(hidden) {
    if (hidden && !root.hidden) {
      return;
    }

    root.classList.toggle("about-overlay--force-hidden", hidden);
  }

  document.body.appendChild(root);

  return {
    root,
    open,
    close,
    setForceHidden,
    destroy() {
      document.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
