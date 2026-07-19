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
          Hi, I'm Anderson Mancini — a creative developer from Brazil with
          over 25 years bringing interactive worlds to life.
        </p>
        <p class="about-lead">
          This living room isn't a static render. Light moves through the
          space the way it does in a real afternoon: bouncing off walls,
          warming wood, cooling shadows, changing how every color feels.
        </p>
        <p class="about-lead">
          Built with Three.js WebGPU, it's a small invitation to play with
          light — and notice how design decisions shift when sunlight is
          alive.
        </p>
      </div>

      <div class="about-footer">
        <div class="about-buttons">
          <button type="button" class="refresh-button-panel">
            Visit portfolio
          </button>
        </div>
        <p class="about-model-credits">
          3D model:
          <a
            href="https://www.cgtrader.com/free-3d-models/interior/living-room/project-b-54e79cb8-6763-471e-9d42-1e7e6cf01e14"
            target="_blank"
            rel="noopener noreferrer"
          >Project B</a>
          on CGTrader — Created by JpArtSky
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
