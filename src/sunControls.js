import { computeSunPhase } from "./scene.js";
import { SUN_PRESETS } from "./sunPresets.js";
import { createSunOrbWidget } from "./ui/createSunOrbWidget.js";
import { gsap } from "gsap";

const STYLE_ID = "sun-controls-style";
const MIN_HOUR = 5;
const MAX_HOUR = 21;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getShortestAzimuthDelta(from, to) {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function getPhaseLabel(hour) {
  const { daylight, golden, night } = computeSunPhase(hour);

  if (night > 0.55) {
    return { title: "Night", subtitle: "Deep blue hour" };
  }
  if (golden > 0.3) {
    return hour < 12
      ? { title: "Morning", subtitle: "Soft sunrise" }
      : { title: "Evening", subtitle: "Golden hour" };
  }
  if (hour < 9) return { title: "Morning", subtitle: "Soft sunrise" };
  if (hour < 16.5) return { title: "Day", subtitle: "Mostly clear" };
  return { title: "Afternoon", subtitle: "Warm twilight" };
}

function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getVisual(hour) {
  const { daylight, golden } = computeSunPhase(hour);

  const nightTop = "#141d30";
  const nightBottom = "#28384f";
  const dayTop = "#6fc3ff";
  const dayBottom = "#b5e6ff";
  const goldenTop = "#7b729f";
  const goldenBottom = "#ffaf62";

  let top = lerpColor(nightTop, dayTop, daylight);
  let bottom = lerpColor(nightBottom, dayBottom, daylight);
  top = lerpColor(top, goldenTop, golden * 0.85);
  bottom = lerpColor(bottom, goldenBottom, golden);

  const glow = lerpColor("#fff5e6", "#ffc07a", golden * 0.95);

  return { top, bottom, glow };
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .sun-widget {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 40;
      width: min(280px, calc(100vw - 12px));
      padding: 15px 16px;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.18);
      box-shadow: 0 22px 60px rgba(0, 0, 0, 0.28);
      color: #f8fbff;
      font-family: "Inter", "SF Pro Display", system-ui, sans-serif;
      user-select: none;
      transition: background 0.28s ease, box-shadow 0.28s ease;
    }

    @media (max-width: 768px) {
      .sun-widget--dragging {
        background: rgba(255, 255, 255, 0.05);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
      }

      .sun-widget--dragging .sun-widget-card::before {
        opacity: 0.28;
      }
    }

    .sun-widget-meta {
      display: flex;
      align-items: flex-start;
      gap: 2px;
      margin-top: -2px;
      margin-right: -4px;
    }

    .sun-widget-close-btn {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      margin-top: 1px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: rgba(255, 255, 255, 0.72);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 0.2s ease, color 0.2s ease;
    }

    .sun-widget-close-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 1);
    }

    .sun-widget-close-btn svg {
      width: 16px;
      height: 16px;
      pointer-events: none;
    }

    .sun-widget--compact .sun-widget-close-btn {
      display: none;
    }

    .sun-widget-close-indicator {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0;
      overflow: visible;
    }

    .sun-widget-close-indicator-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .sun-widget-close-indicator-path {
      fill: none;
      stroke: rgba(255, 255, 255, 0.6);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .sun-widget-card {
      position: relative;
      border-radius: 18px;
      padding: 16px 14px 17px;
      background: transparent;
      isolation: isolate;
    }

    .sun-widget-card::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(180deg, var(--sky-top), var(--sky-bottom));
      opacity: 1;
      transition: opacity 0.28s ease;
      pointer-events: none;
      z-index: 0;
    }

    .sun-widget-card > * {
      position: relative;
      z-index: 1;
    }

    .sun-widget-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
    }

    .sun-widget-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.2px;
      line-height: 1;
      margin-bottom: 4px;
      text-shadow: 0 2px 14px rgba(0, 0, 0, 0.16);
    }

    .sun-widget-subtitle {
      font-size: 9px;
      opacity: 0.92;
      letter-spacing: 0.2px;
      line-height: 1.2;
    }

    .sun-widget-time {
      font-size: 30px;
      font-weight: 100;
      letter-spacing: -2px;
      line-height: 1;
      text-shadow: 0 2px 14px rgba(0, 0, 0, 0.2);
      font-variant-numeric: tabular-nums;
    }

    .sun-orb-widget {
      position: relative;
      height: 240px;
      margin-bottom: 8px;
      border-radius: 14px;
      overflow: hidden;
      touch-action: none;
    }

    .sun-orb-widget-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .sun-orb-drag-hint {
      position: absolute;
      left: 50%;
      bottom: 10px;
      z-index: 2;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 6px;
      color: #ffffff;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
    }

    .sun-orb-drag-hint svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .sun-widget:not(.sun-widget--compact) .sun-arc {
      display: none;
    }

    .sun-widget--compact .sun-orb-widget {
      display: none;
    }

    .sun-arc {
      position: relative;
      height: 88px;
      margin-bottom: 18px;
      overflow: visible;
      touch-action: none;
      cursor: pointer;
    }

    .sun-arc-svg {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }

    .sun-arc-path {
      fill: none;
      stroke: rgba(255, 255, 255, 0.72);
      stroke-width: 12;
      stroke-linecap: round;
    }

    .sun-arc-dot {
      position: absolute;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background: radial-gradient(circle at 35% 35%, #fffdf2 0%, var(--sun-glow) 68%, rgba(255, 255, 255, 0) 100%);
      box-shadow: 0 0 38px 12px color-mix(in srgb, var(--sun-glow) 72%, transparent);
      cursor: grab;
      touch-action: none;
    }

    .sun-preset {
      position: relative;
      width: 68%;
      max-width: 168px;
      margin: 0 auto 16px;
    }

    .sun-preset-trigger {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 7px 10px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.92);
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.4px;
      cursor: pointer;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .sun-preset-trigger:hover {
      background: rgba(255, 255, 255, 0.16);
      border-color: rgba(255, 255, 255, 0.38);
    }

    .sun-preset-trigger[aria-expanded="true"] {
      background: rgba(255, 255, 255, 0.18);
      border-color: rgba(255, 255, 255, 0.42);
    }

    .sun-preset-chevron {
      width: 10px;
      height: 10px;
      flex-shrink: 0;
      transition: transform 0.2s ease;
      transform: rotate(180deg);
    }

    .sun-preset-trigger[aria-expanded="true"] .sun-preset-chevron {
      transform: rotate(0deg);
    }

    .sun-preset-menu {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(100% + 6px);
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 12px;
      background: rgba(18, 22, 32, 0.92);
      backdrop-filter: blur(12px);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
      overflow: hidden;
      z-index: 5;
      animation: sunPresetMenuIn 0.2s ease-out;
    }

    @keyframes sunPresetMenuIn {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .sun-preset-option {
      width: 100%;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.9);
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.3px;
      text-align: left;
      padding: 8px 10px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .sun-preset-option:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .sun-preset-option.active {
      background: rgba(255, 255, 255, 0.14);
      font-weight: 600;
    }

    .sun-preset-option + .sun-preset-option {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .sun-widget--animating .sun-widget-card {
      pointer-events: none;
    }

    .sun-widget--compact {
      width: auto;
      min-width: 0;
      padding: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      color: #ffffff;
      left: 16px;
      bottom: 30px;
      cursor: pointer;
    }

    .sun-widget--compact .sun-widget-card {
      border-radius: 0;
      padding: 0;
      background: transparent;
      display: grid;
      grid-template-columns: 104px auto;
      grid-template-areas: "arc header";
      align-items: center;
      column-gap: 8px;
      transition: transform 0.16s ease, filter 0.16s ease, opacity 0.16s ease;
    }

    .sun-widget--compact .sun-widget-card::before {
      display: none;
    }

    .sun-widget--compact:hover .sun-widget-card {
      transform: translateY(-1px);
      filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.25));
    }

    .sun-widget--compact .sun-widget-header {
      grid-area: header;
      display: grid;
      justify-items: start;
      align-content: center;
      margin-bottom: 0;
      gap: 2px;
    }

    .sun-widget--compact .sun-widget-header > :first-child {
      order: 1;
    }

    .sun-widget--compact .sun-widget-header > .sun-widget-meta {
      order: 2;
    }

    .sun-widget--compact .sun-widget-meta {
      margin: 0;
      display: block;
    }

    .sun-widget--compact .sun-widget-title {
      margin-bottom: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.4px;
      line-height: 1;
      text-shadow: none;
    }

    .sun-widget--compact .sun-widget-subtitle {
      display: none;
    }

    .sun-widget--compact .sun-widget-time {
      font-size: 22px;
      font-weight: 500;
      letter-spacing: -0.6px;
      line-height: 1;
      text-shadow: none;
    }

    .sun-widget--compact .sun-arc {
      grid-area: arc;
      width: 104px;
      height: 44px;
      margin-bottom: 0;
      cursor: pointer;
    }

    .sun-widget--compact .sun-arc-path {
      stroke: rgba(255, 255, 255, 0.95);
      stroke-width: 3;
    }

    .sun-widget--compact .sun-arc-dot {
      width: 8px;
      height: 8px;
      background: #ffffff;
      box-shadow: none;
      cursor: pointer;
    }

    .sun-widget--compact .sun-preset {
      display: none;
    }

    .sun-widget--compact .sun-widget-close-indicator {
      opacity: 0 !important;
    }
  `;

  document.head.appendChild(style);
}

export function createSunControls({
  initialHour = 17.5,
  initialAzimuth = 35,
  compactWhenIdle = true,
  closeBufferMs = 1800,
  idleMs = 4000,
  defaultMode = "compact",
  presets = SUN_PRESETS,
  getOrbitYaw,
  onChange,
  onInteractionStart,
  onInteractionEnd,
  onViewModeChange,
} = {}) {
  ensureStyle();

  const state = {
    hour: clamp(initialHour, MIN_HOUR, MAX_HOUR),
    azimuth: clamp(initialAzimuth, -180, 180),
  };
  let viewMode = defaultMode === "compact" ? "compact" : "expanded";

  const root = document.createElement("div");
  root.className = "sun-widget";

  root.innerHTML = `
    <div class="sun-widget-close-indicator" aria-hidden="true">
      <svg class="sun-widget-close-indicator-svg">
        <path class="sun-widget-close-indicator-path" />
      </svg>
    </div>
    <div class="sun-widget-card">
      <div class="sun-widget-header">
        <div>
          <div class="sun-widget-title" data-title>Day</div>
          <div class="sun-widget-subtitle" data-subtitle>Mostly clear</div>
        </div>
        <div class="sun-widget-meta">
          <div class="sun-widget-time" data-time>12:00</div>
          <button type="button" class="sun-widget-close-btn" aria-label="Close time of day panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
      <div class="sun-orb-widget" data-orb-widget>
        <div class="sun-orb-drag-hint" aria-hidden="true">
          <span>DRAG TO ROTATE</span>
        </div>
      </div>
      <div class="sun-arc">
        <svg class="sun-arc-svg" aria-hidden="true">
          <path class="sun-arc-path" />
        </svg>
        <div class="sun-arc-dot"></div>
      </div>
      <div class="sun-preset">
        <button
          type="button"
          class="sun-preset-trigger"
          aria-expanded="false"
          aria-haspopup="listbox"
        >
          <span data-preset-label>Presets</span>
          <svg class="sun-preset-chevron" viewBox="0 0 12 8" aria-hidden="true">
            <path d="M1 1L6 6L11 1" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div class="sun-preset-menu" role="listbox" hidden></div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const arcEl = root.querySelector(".sun-arc");
  const arcPathEl = root.querySelector(".sun-arc-path");
  const dotEl = root.querySelector(".sun-arc-dot");
  const orbWidgetEl = root.querySelector("[data-orb-widget]");
  const presetWrapEl = root.querySelector(".sun-preset");
  const presetTriggerEl = root.querySelector(".sun-preset-trigger");
  const presetLabelEl = root.querySelector("[data-preset-label]");
  const presetMenuEl = root.querySelector(".sun-preset-menu");
  const closeIndicatorEl = root.querySelector(".sun-widget-close-indicator");
  const closeIndicatorSvgEl = root.querySelector(
    ".sun-widget-close-indicator-svg",
  );
  const closeIndicatorPathEl = root.querySelector(
    ".sun-widget-close-indicator-path",
  );
  const titleEl = root.querySelector("[data-title]");
  const subtitleEl = root.querySelector("[data-subtitle]");
  const timeEl = root.querySelector("[data-time]");
  const closeBtnEl = root.querySelector(".sun-widget-close-btn");
  let orbWidget = null;
  let draggingSun = false;
  let draggingOrb = false;
  let isPointerOverWidget = false;
  let bufferTimerId = null;
  let idleTimerId = null;
  let modeTween = null;
  let idleIndicatorTween = null;
  let presetTween = null;
  let activePresetId = null;
  let isAnimatingPreset = false;
  let isPresetMenuOpen = false;

  const presetButtons = presets.map((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sun-preset-option";
    button.role = "option";
    button.dataset.presetId = preset.id;
    button.textContent = preset.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (preset.id === activePresetId) {
        closePresetMenu();
        return;
      }
      closePresetMenu();
      animateToPreset(preset);
    });
    presetMenuEl.appendChild(button);
    return button;
  });

  function updatePresetLabel() {
    const activePreset = presets.find((preset) => preset.id === activePresetId);
    presetLabelEl.textContent = activePreset?.label ?? "Presets";
  }

  function updatePresetActiveState() {
    for (const button of presetButtons) {
      button.classList.toggle(
        "active",
        button.dataset.presetId === activePresetId,
      );
      button.setAttribute(
        "aria-selected",
        button.dataset.presetId === activePresetId ? "true" : "false",
      );
    }
  }

  function refreshPresets() {
    for (const button of presetButtons) {
      const preset = presets.find(
        (entry) => entry.id === button.dataset.presetId,
      );
      if (preset) {
        button.textContent = preset.label;
      }
    }
    updatePresetLabel();
    updatePresetActiveState();
  }

  function setDraggingBackground(isDragging) {
    root.classList.toggle("sun-widget--dragging", Boolean(isDragging));
  }

  function ensureOrbWidget() {
    if (orbWidget) return orbWidget;

    orbWidget = createSunOrbWidget({
      container: orbWidgetEl,
      minHour: MIN_HOUR,
      maxHour: MAX_HOUR,
      initialHour: state.hour,
      initialAzimuth: state.azimuth,
      getOrbitYaw,
      getSunGlowColor: (hour) => getVisual(hour).glow,
      onHourChange: (hour) => {
        state.hour = hour;
        render({ syncOrb: false });
        emit();
      },
      onAzimuthChange: (azimuth) => {
        state.azimuth = azimuth;
        render({ syncOrb: false });
        emit();
      },
      onDragStart: () => {
        cancelPresetOnManualInteraction();
        clearActivePreset();
        draggingOrb = true;
        setDraggingBackground(true);
        onInteractionStart?.();
      },
      onDragEnd: () => {
        draggingOrb = false;
        setDraggingBackground(false);
        onInteractionEnd?.();
        scheduleCompactMode();
      },
    });

    return orbWidget;
  }

  function syncOrbWidget() {
    if (!orbWidget || viewMode !== "expanded") return;
    orbWidget.setState({ hour: state.hour, azimuth: state.azimuth });
  }

  function setOrbWidgetActive(isActive) {
    if (isActive) {
      gsap.set(orbWidgetEl, { clearProps: "opacity,transform" });
      ensureOrbWidget().setActive(true);
      syncOrbWidget();
      return;
    }
    orbWidget?.setActive(false);
  }

  function openPresetMenu() {
    isPresetMenuOpen = true;
    presetMenuEl.hidden = false;
    presetTriggerEl.setAttribute("aria-expanded", "true");
    updatePresetActiveState();
  }

  function closePresetMenu() {
    isPresetMenuOpen = false;
    presetMenuEl.hidden = true;
    presetTriggerEl.setAttribute("aria-expanded", "false");
  }

  function togglePresetMenu() {
    if (isPresetMenuOpen) {
      closePresetMenu();
      return;
    }
    wakeUpWidget();
    openPresetMenu();
  }

  function clearActivePreset() {
    activePresetId = null;
    updatePresetLabel();
    updatePresetActiveState();
  }

  function stopPresetAnimation({ callInteractionEnd = false } = {}) {
    const wasAnimating = isAnimatingPreset;
    if (presetTween) {
      presetTween.kill();
      presetTween = null;
    }
    isAnimatingPreset = false;
    root.classList.remove("sun-widget--animating");
    if (wasAnimating && callInteractionEnd) {
      onInteractionEnd?.();
    }
  }

  function cancelPresetOnManualInteraction() {
    if (!isAnimatingPreset) return;
    stopPresetAnimation({ callInteractionEnd: true });
    clearActivePreset();
  }

  function animateToPreset(preset) {
    if (!preset) return;

    stopPresetAnimation();
    wakeUpWidget();

    const startHour = state.hour;
    const startAzimuth = state.azimuth;
    const targetHour = clamp(preset.hour, MIN_HOUR, MAX_HOUR);
    const targetAzimuth = clamp(preset.azimuth, -180, 180);
    const azimuthDelta = getShortestAzimuthDelta(startAzimuth, targetAzimuth);
    const temp = { t: 0 };

    presetTween = gsap.to(temp, {
      t: 1,
      duration: 1.5,
      ease: "power2.inOut",
      onStart: () => {
        isAnimatingPreset = true;
        root.classList.add("sun-widget--animating");
        onInteractionStart?.();
      },
      onUpdate: () => {
        state.hour = startHour + (targetHour - startHour) * temp.t;
        state.azimuth = startAzimuth + azimuthDelta * temp.t;
        render();
        emit();
      },
      onComplete: () => {
        state.hour = targetHour;
        state.azimuth = targetAzimuth;
        presetTween = null;
        isAnimatingPreset = false;
        root.classList.remove("sun-widget--animating");
        activePresetId = preset.id;
        updatePresetLabel();
        updatePresetActiveState();
        render();
        emit();
        onInteractionEnd?.();
        scheduleCompactMode();
      },
    });
  }

  function applyViewModeClass() {
    root.classList.toggle("sun-widget--compact", viewMode === "compact");
  }

  function stopModeTween() {
    if (!modeTween) return;
    modeTween.kill();
    modeTween = null;
  }

  function animateToExpanded() {
    stopModeTween();
    modeTween = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: () => {
        modeTween = null;
      },
    });

    gsap.set(root, { clearProps: "transform,opacity" });
    gsap.set([arcEl, timeEl, titleEl, presetWrapEl, orbWidgetEl], {
      clearProps: "transform,opacity",
    });
    modeTween.fromTo(
      root,
      { opacity: 0.84, y: 8, scale: 0.965 },
      { opacity: 1, y: 0, scale: 1, duration: 0.3 },
    );
    modeTween.fromTo(
      arcEl,
      { opacity: 0.6, y: 8 },
      { opacity: 1, y: 0, duration: 0.26 },
      "<0.04",
    );
    modeTween.fromTo(
      presetWrapEl,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.2 },
      "<0.06",
    );
    // Don't tween orb opacity — compact mode uses display:none; GSAP opacity:0 was hiding the WebGL canvas
    modeTween.fromTo(orbWidgetEl, { y: 10 }, { y: 0, duration: 0.25 }, "<");
    modeTween.fromTo(
      [titleEl, timeEl],
      { opacity: 0.7, y: 4 },
      { opacity: 1, y: 0, duration: 0.2, stagger: 0.03 },
      "<",
    );
  }

  function animateToCompact() {
    stopModeTween();
    modeTween = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: () => {
        modeTween = null;
      },
    });

    modeTween.to(presetWrapEl, {
      opacity: 0,
      y: 10,
      duration: 0.16,
      ease: "power2.in",
    });
    modeTween.to(orbWidgetEl, { y: 10, duration: 0.16, ease: "power2.in" }, 0);
    modeTween.to(root, { opacity: 0.9, y: 5, scale: 0.975, duration: 0.2 }, 0);
    modeTween.add(() => {
      applyViewModeClass();
      render();
      gsap.set([arcEl, titleEl, timeEl], { opacity: 0, y: 4 });
      gsap.set([presetWrapEl, orbWidgetEl], {
        clearProps: "opacity,transform",
      });
    });
    modeTween.to(root, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.2,
      ease: "power2.out",
    });
    modeTween.to(
      [arcEl, titleEl, timeEl],
      { opacity: 1, y: 0, duration: 0.2, stagger: 0.03, ease: "power2.out" },
      "<",
    );
  }

  function setViewMode(nextMode, { animate = true } = {}) {
    if (viewMode === nextMode) return;
    if (nextMode === "compact") {
      closePresetMenu();
      setOrbWidgetActive(false);
    }
    viewMode = nextMode;
    onViewModeChange?.(viewMode);

    if (!animate) {
      stopModeTween();
      applyViewModeClass();
      render();
      if (viewMode === "expanded") {
        setOrbWidgetActive(true);
      }
      return;
    }

    if (nextMode === "compact") {
      animateToCompact();
      return;
    }

    applyViewModeClass();
    render();
    setOrbWidgetActive(true);
    animateToExpanded();
  }

  function clearBufferTimer() {
    if (!bufferTimerId) return;
    window.clearTimeout(bufferTimerId);
    bufferTimerId = null;
  }

  function clearIdleTimer() {
    if (!idleTimerId) return;
    window.clearTimeout(idleTimerId);
    idleTimerId = null;
  }

  function clearIdleIndicatorTween() {
    if (!idleIndicatorTween) return;
    idleIndicatorTween.kill();
    idleIndicatorTween = null;
  }

  function updateCloseIndicatorGeometry() {
    const width = root.clientWidth;
    const height = root.clientHeight;
    const strokeWidth = 2;
    const inset = strokeWidth * 0.5;
    const radius = Math.max(
      0,
      parseFloat(getComputedStyle(root).borderRadius) - inset,
    );

    closeIndicatorSvgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
    closeIndicatorPathEl.setAttribute(
      "d",
      `M ${inset + radius} ${inset}
       H ${width - inset - radius}
       A ${radius} ${radius} 0 0 1 ${width - inset} ${inset + radius}
       V ${height - inset - radius}
       A ${radius} ${radius} 0 0 1 ${width - inset - radius} ${height - inset}
       H ${inset + radius}
       A ${radius} ${radius} 0 0 1 ${inset} ${height - inset - radius}
       V ${inset + radius}
       A ${radius} ${radius} 0 0 1 ${inset + radius} ${inset}`,
    );
  }

  function hideCloseIndicator() {
    clearIdleIndicatorTween();
    gsap.set(closeIndicatorEl, { opacity: 0 });
    gsap.set(closeIndicatorPathEl, { strokeDashoffset: 0 });
  }

  function startCloseIndicatorCountdown() {
    clearIdleIndicatorTween();
    updateCloseIndicatorGeometry();
    const pathLength = closeIndicatorPathEl.getTotalLength();
    gsap.set(closeIndicatorPathEl, {
      strokeDasharray: pathLength,
      strokeDashoffset: 0,
    });
    gsap.set(closeIndicatorEl, { opacity: 1 });
    idleIndicatorTween = gsap.to(closeIndicatorPathEl, {
      strokeDashoffset: pathLength,
      duration: idleMs / 1000,
      ease: "none",
      onComplete: () => {
        idleIndicatorTween = null;
      },
    });
  }

  function forceCompact() {
    closePresetMenu();
    stopPresetAnimation({ callInteractionEnd: true });
    clearBufferTimer();
    clearIdleTimer();
    hideCloseIndicator();
    setViewMode("compact");
  }

  function scheduleCompactMode() {
    if (!compactWhenIdle) return;
    clearBufferTimer();
    clearIdleTimer();
    clearIdleIndicatorTween();
    if (draggingSun || draggingOrb || isAnimatingPreset) return;
    if (viewMode !== "expanded") return;
    if (isPointerOverWidget) return;
    bufferTimerId = window.setTimeout(() => {
      bufferTimerId = null;
      if (draggingSun || draggingOrb || isAnimatingPreset) return;
      if (viewMode !== "expanded") return;
      if (isPointerOverWidget) return;
      startCloseIndicatorCountdown();
      idleTimerId = window.setTimeout(() => {
        hideCloseIndicator();
        setViewMode("compact");
      }, idleMs);
    }, closeBufferMs);
  }

  function wakeUpWidget() {
    if (!compactWhenIdle) return;
    clearBufferTimer();
    clearIdleTimer();
    hideCloseIndicator();
    setViewMode("expanded");
    scheduleCompactMode();
  }

  function emit() {
    if (onChange) onChange({ ...state });
  }

  function getArcGeometry() {
    const width = arcEl.clientWidth;
    const height = arcEl.clientHeight;
    const padX = 14;
    const padTop = 10;
    const centerX = width * 0.5;
    const centerY = height;
    const radius = Math.min((width - padX * 2) * 0.5, height - padTop);

    return { width, height, centerX, centerY, radius, padX, padTop };
  }

  function updateArcPath() {
    const { width, height, centerX, centerY, radius } = getArcGeometry();
    const leftX = centerX - radius;
    const rightX = centerX + radius;

    arcPathEl.setAttribute(
      "d",
      `M ${leftX} ${centerY} A ${radius} ${radius} 0 0 1 ${rightX} ${centerY}`,
    );
    arcPathEl.closest("svg").setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  function positionSunDot() {
    const { centerX, centerY, radius } = getArcGeometry();
    const normalized = (state.hour - MIN_HOUR) / (MAX_HOUR - MIN_HOUR);
    const theta = (1 - normalized) * Math.PI;
    const x = centerX + Math.cos(theta) * radius;
    const y = centerY - Math.sin(theta) * radius;

    dotEl.style.left = `${x}px`;
    dotEl.style.top = `${y}px`;
  }

  function setHourFromPointer(event) {
    const rect = arcEl.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const { centerX, centerY } = getArcGeometry();

    let theta;
    if (pointerY >= centerY) {
      theta = pointerX < centerX ? Math.PI : 0;
    } else {
      theta = clamp(
        Math.atan2(centerY - pointerY, pointerX - centerX),
        0,
        Math.PI,
      );
    }
    const normalized = 1 - theta / Math.PI;

    state.hour = MIN_HOUR + normalized * (MAX_HOUR - MIN_HOUR);
  }

  function render({ syncOrb = true } = {}) {
    const { title, subtitle } = getPhaseLabel(state.hour);
    const visual = getVisual(state.hour);

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    timeEl.textContent = formatHour(state.hour);

    root.style.setProperty("--sky-top", visual.top);
    root.style.setProperty("--sky-bottom", visual.bottom);
    root.style.setProperty("--sun-glow", visual.glow);

    if (viewMode === "compact") {
      updateArcPath();
      positionSunDot();
    } else if (syncOrb) {
      syncOrbWidget();
    }

    updateCloseIndicatorGeometry();
  }

  root.addEventListener("pointerdown", () => {
    if (viewMode === "compact") wakeUpWidget();
  });

  closeBtnEl.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  closeBtnEl.addEventListener("click", (event) => {
    event.stopPropagation();
    forceCompact();
  });

  presetTriggerEl.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  presetTriggerEl.addEventListener("click", (event) => {
    event.stopPropagation();
    if (isAnimatingPreset) return;
    togglePresetMenu();
  });

  function onDocumentPointerDown(event) {
    if (!isPresetMenuOpen) return;
    if (presetWrapEl.contains(event.target)) return;
    closePresetMenu();
  }

  function onDocumentKeyDown(event) {
    if (event.key === "Escape" && isPresetMenuOpen) {
      closePresetMenu();
    }
  }

  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeyDown);

  root.addEventListener("pointerenter", () => {
    isPointerOverWidget = true;
    if (viewMode !== "expanded") return;
    clearBufferTimer();
    clearIdleTimer();
    hideCloseIndicator();
  });

  root.addEventListener("pointerleave", () => {
    isPointerOverWidget = false;
    if (viewMode !== "expanded") return;
    scheduleCompactMode();
  });

  arcEl.addEventListener("pointerdown", (event) => {
    if (viewMode === "compact") {
      wakeUpWidget();
      return;
    }

    cancelPresetOnManualInteraction();
    clearActivePreset();
    draggingSun = true;
    setDraggingBackground(true);
    dotEl.style.cursor = "grabbing";
    onInteractionStart?.();
    setHourFromPointer(event);
    render();
    emit();
  });

  window.addEventListener("pointermove", (event) => {
    if (!draggingSun) return;
    setHourFromPointer(event);
    render();
    emit();
  });

  window.addEventListener("pointerup", () => {
    if (!draggingSun) return;
    draggingSun = false;
    setDraggingBackground(false);
    dotEl.style.cursor = "grab";
    onInteractionEnd?.();
    scheduleCompactMode();
  });

  window.addEventListener("resize", () => {
    render();
    orbWidget?.resize();
  });

  applyViewModeClass();
  render();
  if (viewMode === "expanded") {
    setOrbWidgetActive(true);
  }
  updatePresetLabel();
  onViewModeChange?.(viewMode);
  scheduleCompactMode();

  return {
    getState() {
      return { ...state };
    },
    getViewMode() {
      return viewMode;
    },
    getActivePresetId() {
      return activePresetId;
    },
    animateToPreset,
    refreshPresets,
    setVisible(visible) {
      root.style.visibility = visible ? "" : "hidden";
      root.style.pointerEvents = visible ? "" : "none";
      root.style.opacity = visible ? "" : "0";
    },
    destroy() {
      stopPresetAnimation({ callInteractionEnd: true });
      orbWidget?.dispose();
      orbWidget = null;
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
      root.remove();
    },
  };
}
