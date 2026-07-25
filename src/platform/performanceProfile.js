/**
 * Runtime performance toggles. Defaults favor optimized settings; flip individual
 * flags in dev via `window.__app.perf` to A/B test FPS impact.
 */
import {
  isAppleMobile,
  isMobileDevice,
  isSafari,
} from "./deviceLayout.js";

export const performanceProfile = {
  adaptiveDpr: true,
  maxPixelRatio: 1.5,

  carSurfaceRain: true,
  carSurfaceRainFadeStart: 20,
  carSurfaceRainFadeEnd: 32,

  groundReflection: true,
  groundResolutionScale: 0.5,
  groundReflectionFrameSkip: 1,

  bloom: true,
  bloomResolutionScale: 0.5,
  // Off by default on all devices — enable only via Development Mode inspector.
  dof: false,
  lensflare: true,
  lensflareResolutionScale: 0.5,
  smaa: true,

  lensflareBlurRadius: 4,

  smokeEnabled: true,
  exhaustCount: 50,
  ambientCount: 40,

  planeEnabled: true,

  billboardsEnabled: true,
};

/**
 * Device-specific budgets. Call once at boot, before createRenderer().
 * - DoF stays off everywhere (see performanceProfile.dof); enable via inspector.
 * - All phones/tablets: lensflare + billboards off (too expensive / unstable on mobile GPUs).
 * - Apple mobile / Safari: cap DPR, disable adaptive resize and SMAA
 *   (resize + concurrent compile + extra passes freeze Safari WebGPU).
 */
export function applyDevicePerformanceDefaults() {
  if (!isMobileDevice()) {
    if (isSafari()) {
      performanceProfile.adaptiveDpr = false;
    }
    return;
  }

  performanceProfile.lensflare = false;
  performanceProfile.billboardsEnabled = false;

  if (isAppleMobile() || isSafari()) {
    performanceProfile.maxPixelRatio = 1;
    performanceProfile.adaptiveDpr = false;
    performanceProfile.smaa = false;
  }
}

export function shouldCompileBeforeRenderLoop() {
  return isSafari();
}

export function getStaticPixelRatio() {
  return Math.min(window.devicePixelRatio, performanceProfile.maxPixelRatio);
}

export function applyPerformanceProfileToPipeline(pipeline) {
  if (!pipeline?.perf) {
    return;
  }

  const { perf } = pipeline;
  perf.setBloomEnabled(performanceProfile.bloom);
  perf.setBloomResolutionScale(performanceProfile.bloomResolutionScale);
  perf.setDofEnabled(performanceProfile.dof);
  perf.setLensflareEnabled(performanceProfile.lensflare);
  perf.setLensflareResolutionScale(performanceProfile.lensflareResolutionScale);
  perf.setLensflareBlurRadius(performanceProfile.lensflareBlurRadius);
  perf.setSmaaEnabled(performanceProfile.smaa);
}
