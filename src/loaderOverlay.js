import gsap from "gsap";

const LOADER_STYLE_ID = "app-loader-style";
const CIRCLE_RADIUS = 66;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
const REVEAL_START_PX = 84;
const STAGE_SIZE = 168;

function getRevealEndPx() {
  const { innerWidth, innerHeight } = window;
  return Math.ceil(Math.hypot(innerWidth, innerHeight) * 0.72) + 48;
}

function ensureStyles() {
  if (document.getElementById(LOADER_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = LOADER_STYLE_ID;
  style.textContent = `
    #app-loader {
      --reveal: ${REVEAL_START_PX}px;
      position: fixed;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      background: #0a0a0a;
      color: #e8eaed;
    }

    #app-loader.app-loader--revealing {
      will-change: mask-image, -webkit-mask-image;
      -webkit-mask-image: radial-gradient(
        circle at center,
        transparent calc(var(--reveal) - 80px),
        rgba(0, 0, 0, 0.55) calc(var(--reveal) - 28px),
        rgba(0, 0, 0, 0.92) calc(var(--reveal) - 8px),
        #000 calc(var(--reveal) + 1px)
      );
      mask-image: radial-gradient(
        circle at center,
        transparent calc(var(--reveal) - 80px),
        rgba(0, 0, 0, 0.55) calc(var(--reveal) - 28px),
        rgba(0, 0, 0, 0.92) calc(var(--reveal) - 8px),
        #000 calc(var(--reveal) + 1px)
      );
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-size: 100% 100%;
      mask-size: 100% 100%;
    }

    .app-loader__stage {
      position: relative;
      width: ${STAGE_SIZE}px;
      height: ${STAGE_SIZE}px;
      display: grid;
      place-items: center;
    }

    .app-loader__ring {
      width: ${STAGE_SIZE}px;
      height: ${STAGE_SIZE}px;
      transform: rotate(-90deg);
    }

    .app-loader__ring-bg {
      fill: none;
      stroke: #2a2d30;
      stroke-width: 2.5;
    }

    .app-loader__ring-fill {
      fill: none;
      stroke: #e8eaed;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-dasharray: ${CIRCLE_CIRCUMFERENCE};
      stroke-dashoffset: ${CIRCLE_CIRCUMFERENCE};
      transition: stroke-dashoffset 180ms ease;
    }

    .app-loader__percent {
      position: absolute;
      margin: 0;
      font-family: "SF Pro Display", "Segoe UI", system-ui, sans-serif;
      font-size: 48px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.04em;
      line-height: 1;
      color: #e8eaed;
      pointer-events: none;
      user-select: none;
    }
  `;

  document.head.appendChild(style);
}

function clampProgress(value) {
  return Math.max(0, Math.min(1, value));
}

export function createLoaderOverlay() {
  ensureStyles();

  const root = document.createElement("div");
  root.id = "app-loader";
  root.setAttribute("role", "status");
  root.setAttribute("aria-busy", "true");
  root.setAttribute("aria-label", "Loading");
  root.innerHTML = `
    <div class="app-loader__stage">
      <svg class="app-loader__ring" viewBox="0 0 ${STAGE_SIZE} ${STAGE_SIZE}" aria-hidden="true">
        <circle class="app-loader__ring-bg" cx="${STAGE_SIZE / 2}" cy="${STAGE_SIZE / 2}" r="${CIRCLE_RADIUS}"></circle>
        <circle class="app-loader__ring-fill" cx="${STAGE_SIZE / 2}" cy="${STAGE_SIZE / 2}" r="${CIRCLE_RADIUS}"></circle>
      </svg>
      <p class="app-loader__percent" aria-hidden="true">0</p>
    </div>
  `;

  const stage = root.querySelector(".app-loader__stage");
  const ringFill = root.querySelector(".app-loader__ring-fill");
  const percentEl = root.querySelector(".app-loader__percent");
  let hidden = false;
  let finishPromise = null;

  document.body.appendChild(root);

  function setProgress(progress) {
    if (!ringFill || hidden) {
      return;
    }

    const value = clampProgress(progress);
    const dashOffset = CIRCLE_CIRCUMFERENCE * (1 - value);
    ringFill.style.strokeDashoffset = `${dashOffset}`;
    percentEl.textContent = `${Math.round(value * 100)}`;
    root.setAttribute("aria-label", `Loading ${Math.round(value * 100)}%`);
  }

  function setStatus() {
    // Intentionally no-op — loader is visual-only.
  }

  function fail() {
    setProgress(1);
    root.setAttribute("aria-label", "Failed to load");
  }

  function finish({ onRevealUpdate } = {}) {
    if (finishPromise) {
      return finishPromise;
    }

    if (hidden) {
      return Promise.resolve();
    }

    hidden = true;
    root.setAttribute("aria-busy", "false");
    setProgress(1);

    finishPromise = new Promise((resolve) => {
      const revealEndPx = getRevealEndPx();
      const revealState = { radius: REVEAL_START_PX };

      const timeline = gsap.timeline({
        onComplete: () => {
          root.remove();
          resolve();
        },
      });

      timeline
        .to(
          stage,
          {
            opacity: 0,
            duration: 0.12,
            ease: "power1.out",
          },
          0,
        )
        .add(() => {
          root.classList.add("app-loader--revealing");
          root.style.setProperty("--reveal", `${REVEAL_START_PX}px`);
        }, 0.04)
        .to(
          revealState,
          {
            radius: revealEndPx,
            // Larger start radius → less distance to travel; keep reveal snappy.
            duration: 0.85,
            ease: "power3.inOut",
            onUpdate: () => {
              root.style.setProperty("--reveal", `${revealState.radius}px`);
              onRevealUpdate?.();
            },
          },
          0.05,
        );
    });

    return finishPromise;
  }

  return { setProgress, setStatus, fail, finish };
}
