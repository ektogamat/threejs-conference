import { PROBE_INTENSITY } from "./scene.js";

export const RENDER_MODES = {
  default: "default",
  highEnd: "highEnd",
  ultra: "ultra",
  insane: "insane",
};

export const DEFAULT_RENDER_MODE = RENDER_MODES.ultra;

export const RENDER_MODE_LABELS = {
  [RENDER_MODES.default]: "Default",
  [RENDER_MODES.highEnd]: "High end",
  [RENDER_MODES.ultra]: "Ultra",
  [RENDER_MODES.insane]: "Insane",
};

export const RENDER_MODE_OPTIONS = [
  {
    id: RENDER_MODES.default,
    title: "Default",
    description: "TRAA, bloom",
  },
  {
    id: RENDER_MODES.highEnd,
    title: "High end",
    description: "Denoised reflections, TRAA, bloom",
  },
  {
    id: RENDER_MODES.ultra,
    title: "Ultra",
    description: "Full quality (GI, reflections, bloom)",
  },
  {
    id: RENDER_MODES.insane,
    title: "Insane",
    description: "Are you sure? This will crank everything to the maximum",
  },
];

export function isRenderMode(value) {
  return (
    value === RENDER_MODES.default ||
    value === RENDER_MODES.highEnd ||
    value === RENDER_MODES.ultra ||
    value === RENDER_MODES.insane
  );
}

export function isGiRenderMode(mode) {
  return mode === RENDER_MODES.ultra || mode === RENDER_MODES.insane;
}

const DEFAULT_SSR_DRAG = {
  resolutionScale: 0.85,
  quality: 0.7,
  denoiseStrength: 0.6,
};

const INSANE_SSR_DRAG = {
  resolutionScale: 1,
  quality: 0.8,
  denoiseStrength: 0.7,
};

export const DEFAULT_FSR_TUNING = {
  enabled: true,
  sharpness: 0.2,
  denoise: true,
  scenePassResolutionScale: 1,
};

export const INSANE_FSR_TUNING = {
  enabled: false,
  sharpness: 0,
  denoise: false,
  scenePassResolutionScale: 1,
};

function resolveInsaneOutputDpr() {
  if (typeof window === "undefined") {
    return 1.5;
  }

  return Math.min(1.5, window.devicePixelRatio || 1);
}

const DEFAULT_RUNTIME_TUNING = {
  idleMaxDPR: 1.2,
  idleMinMaxDPR: 0.95,
  ssrDrag: DEFAULT_SSR_DRAG,
  fsr: DEFAULT_FSR_TUNING,
};

const INSANE_RUNTIME_TUNING = {
  idleMaxDPR: resolveInsaneOutputDpr(),
  idleMinMaxDPR: 0.95,
  ssrDrag: INSANE_SSR_DRAG,
  fsr: INSANE_FSR_TUNING,
};

export function getRenderModeRuntimeTuning(mode) {
  if (mode === RENDER_MODES.insane) {
    return INSANE_RUNTIME_TUNING;
  }

  return DEFAULT_RUNTIME_TUNING;
}

export const RENDER_MODE_SETTINGS = {
  [RENDER_MODES.default]: {
    envMapBaseIntensity: 0.2,
    envIntensity: { night: 0.55, day: 1.05 },
  },
  [RENDER_MODES.highEnd]: {
    envMapBaseIntensity: 0.25,
    envIntensity: { night: 0.45, day: 0.9 },
  },
  [RENDER_MODES.ultra]: {
    envMapBaseIntensity: 0.04,
    envIntensity: { ...PROBE_INTENSITY },
  },
  [RENDER_MODES.insane]: {
    envMapBaseIntensity: 0.04,
    envIntensity: { ...PROBE_INTENSITY },
  },
};

export function getRenderModeSettings(mode) {
  if (isRenderMode(mode)) {
    return RENDER_MODE_SETTINGS[mode];
  }

  return RENDER_MODE_SETTINGS[DEFAULT_RENDER_MODE];
}

export function applyRenderModeSettings(
  mode,
  { envMapBaseIntensity, envIntensityCurve, syncLighting } = {},
) {
  const settings = getRenderModeSettings(mode);

  if (envMapBaseIntensity) {
    envMapBaseIntensity.value = settings.envMapBaseIntensity;
  }

  if (envIntensityCurve && settings.envIntensity) {
    envIntensityCurve.night = settings.envIntensity.night;
    envIntensityCurve.day = settings.envIntensity.day;
  }

  syncLighting?.();
}
