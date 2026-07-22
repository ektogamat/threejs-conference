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
    <button type="button" class="close-button-panel" aria-label="Close">
      ${CLOSE_ICON}
    </button>

    <div class="about-content">
      <div class="about-body">
        <div class="about-brand">
          <p class="about-brand-title">THREEJS CONFERENCE</p>
          <small class="about-brand-subtitle">BY ANDERSON MANCINI &amp; SUNAG</small>
        </div>
        <div class="about-copy">
          <div class="about-copy-col">
            <p class="about-lead">
              Threejs-Punk drops you into a rain-soaked alley somewhere between a Blade
              Runner backlot and a boot sequence — neon signs, wet asphalt, and a city
              that never quite turns off its lights.
            </p>
            <p class="about-lead">
              Every reflection, droplet and glow you see is rendered live with Three.js
              WebGPU and TSL — no pre-baked tricks, just shaders doing the heavy lifting
              in real time.
            </p>
          </div>
          <div class="about-copy-col">
            <p class="about-lead">
              That flickering readout in the corner is set dressing: a fake vitals HUD
              borrowed from the same retro-future aesthetic, just to make the night feel
              a little more alive.
            </p>
            <p class="about-lead">
              Originally built for the Three.js Conference — a small invitation to
              wander, look up, and let the rain do the storytelling.
            </p>
          </div>
        </div>
      </div>

      <div class="about-footer">
        <div class="about-buttons">
          <button type="button" class="refresh-button-panel about-link-anderson">
            Anderson Mancini
          </button>
          <button type="button" class="refresh-button-panel about-link-sunag">
            Sunag
          </button>
        </div>
        <p class="about-model-credits">
          By Anderson Mancini &amp; Sunag
        </p>
      </div>
    </div>
  `;

  const closeButton = root.querySelector(".close-button-panel");
  const andersonButton = root.querySelector(".about-link-anderson");
  const sunagButton = root.querySelector(".about-link-sunag");

  function open() {
    root.classList.remove("about-overlay--force-hidden");
    root.hidden = false;
  }

  function close() {
    root.hidden = true;
    state?.closePanel();
  }

  closeButton.addEventListener("click", close);

  andersonButton.addEventListener("click", () => {
    window.open("https://andersonmancini.dev", "_blank", "noopener,noreferrer");
  });

  sunagButton.addEventListener("click", () => {
    window.open("https://x.com/sea3dformat", "_blank", "noopener,noreferrer");
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
