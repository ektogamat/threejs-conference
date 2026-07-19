import gsap from "gsap";

const LOADER_STYLE_ID = "app-loader-style";
const CIRCLE_RADIUS = 33;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
const REVEAL_START_PX = 42;
const LAMP_ICON_URL = "/icons/lamp.png";

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
        transparent calc(var(--reveal) - 40px),
        rgba(0, 0, 0, 0.55) calc(var(--reveal) - 14px),
        rgba(0, 0, 0, 0.92) calc(var(--reveal) - 4px),
        #000 calc(var(--reveal) + 1px)
      );
      mask-image: radial-gradient(
        circle at center,
        transparent calc(var(--reveal) - 40px),
        rgba(0, 0, 0, 0.55) calc(var(--reveal) - 14px),
        rgba(0, 0, 0, 0.92) calc(var(--reveal) - 4px),
        #000 calc(var(--reveal) + 1px)
      );
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-size: 100% 100%;
      mask-size: 100% 100%;
    }

    .app-loader__stage {
      position: relative;
      width: 84px;
      height: 84px;
      display: grid;
      place-items: center;
    }

    .app-loader__ring {
      width: 84px;
      height: 84px;
      transform: rotate(-90deg);
    }

    .app-loader__ring-bg {
      fill: none;
      stroke: #2a2d30;
      stroke-width: 2;
    }

    .app-loader__ring-fill {
      fill: none;
      stroke: #e8eaed;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-dasharray: ${CIRCLE_CIRCUMFERENCE};
      stroke-dashoffset: ${CIRCLE_CIRCUMFERENCE};
      transition: stroke-dashoffset 180ms ease;
    }

    .app-loader__icon {
      position: absolute;
      width: 40px;
      height: 40px;
      object-fit: contain;
      filter: brightness(0) invert(1);
      opacity: 0;
      pointer-events: none;
      user-select: none;
      transition: opacity 0.2s ease;
    }

    .app-loader__icon.app-loader__icon--ready {
      opacity: 0.95;
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
      <svg class="app-loader__ring" viewBox="0 0 84 84" aria-hidden="true">
        <circle class="app-loader__ring-bg" cx="42" cy="42" r="${CIRCLE_RADIUS}"></circle>
        <circle class="app-loader__ring-fill" cx="42" cy="42" r="${CIRCLE_RADIUS}"></circle>
      </svg>
      <img class="app-loader__icon" src="${LAMP_ICON_URL}" alt="" width="40" height="40" decoding="sync" fetchpriority="high" />
    </div>
  `;

  const stage = root.querySelector(".app-loader__stage");
  const ringFill = root.querySelector(".app-loader__ring-fill");
  const icon = root.querySelector(".app-loader__icon");
  let hidden = false;
  let finishPromise = null;

  document.body.appendChild(root);

  if (icon.complete) {
    icon.classList.add("app-loader__icon--ready");
  } else {
    icon.addEventListener(
      "load",
      () => {
        icon.classList.add("app-loader__icon--ready");
      },
      { once: true },
    );
    icon.addEventListener(
      "error",
      () => {
        icon.classList.add("app-loader__icon--ready");
      },
      { once: true },
    );
  }

  function setProgress(progress) {
    if (!ringFill || hidden) {
      return;
    }

    const value = clampProgress(progress);
    const dashOffset = CIRCLE_CIRCUMFERENCE * (1 - value);
    ringFill.style.strokeDashoffset = `${dashOffset}`;
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
          icon,
          {
            opacity: 0,
            duration: 0.15,
            ease: "power1.out",
          },
          0,
        )
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
        }, 0.06)
        .to(
          revealState,
          {
            radius: revealEndPx,
            duration: 1.15,
            ease: "power3.inOut",
            onUpdate: () => {
              root.style.setProperty("--reveal", `${revealState.radius}px`);
              onRevealUpdate?.();
            },
          },
          0.08,
        );
    });

    return finishPromise;
  }

  return { setProgress, setStatus, fail, finish };
}
