import "./resizeWarningBanner.css";

export function createResizeWarningBanner({
  onRestart = () => window.location.reload(),
} = {}) {
  const root = document.createElement("div");
  root.className = "resize-warning-banner";
  root.hidden = true;
  root.innerHTML = `
    <div class="resize-warning-banner-backdrop" aria-hidden="true"></div>
    <div class="resize-warning-banner-glass" role="alert" aria-live="assertive">
      <p class="resize-warning-banner-text">
        The viewport size changed. Please restart the application to restore
        rendering quality. Continuing without a restart may break anti-aliasing
        and lighting.
      </p>
      <div class="resize-warning-banner-actions">
        <button type="button" class="resize-warning-banner-btn resize-warning-banner-btn--primary" data-restart>
          Restart application
        </button>
      </div>
    </div>
  `;

  const restartButton = root.querySelector("[data-restart]");

  let armed = false;
  let baselineWidth = 0;
  let baselineHeight = 0;
  let visible = false;

  function show() {
    if (visible) {
      return;
    }

    visible = true;
    root.hidden = false;
    requestAnimationFrame(() => {
      root.classList.add("resize-warning-banner--visible");
    });
  }

  function handleViewportChange() {
    if (!armed || visible) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    if (width === baselineWidth && height === baselineHeight) {
      return;
    }

    show();
  }

  function arm() {
    baselineWidth = window.innerWidth;
    baselineHeight = window.innerHeight;
    armed = true;
  }

  restartButton.addEventListener("click", () => {
    onRestart();
  });

  window.addEventListener("resize", handleViewportChange);
  document.addEventListener("fullscreenchange", handleViewportChange);

  document.body.appendChild(root);

  return {
    root,
    arm,
    destroy() {
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("fullscreenchange", handleViewportChange);
      root.remove();
    },
  };
}
