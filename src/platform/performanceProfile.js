/**
 * Runtime performance toggles. Defaults favor optimized settings; flip individual
 * flags in dev via `window.__app.perf` to A/B test FPS impact.
 *
 * SSR uses motion-adaptive quality, specular classification, and shared GBuffer AO.
 */
import {
  isAppleMobile,
  isMobileDevice,
  isSafari,
} from "./deviceLayout.js";

export const performanceProfile = {
  adaptiveDpr: false,
  maxPixelRatio: 1,

  carSurfaceRain: true,
  carSurfaceRainFadeStart: 20,
  carSurfaceRainFadeEnd: 32,

  groundReflection: true,
  groundResolutionScale: 0.5,
  groundReflectionFrameSkip: 1,

  bloom: true,
  bloomResolutionScale: 1,
  // Off by default on all devices — enable only via Development Mode inspector.
  dof: false,
  lensflare: true,
  lensflareResolutionScale: 0.5,
  smaa: true,

  // GTAO — half-res by default; toggle via inspector / __app.perf for FPS A/B.
  ao: true,
  aoResolutionScale: 0.5,
  aoSamples: 6,
  aoRadius: 0.4,
  aoScale: 1.7,
  aoThickness: 1,
  aoDistanceExponent: 1,
  aoDistanceFallOff: 1,

  // SSR — screen-space reflections with Threepipe-style cost architecture.
  ssr: true,
  ssrResolutionScale: 1,
  ssrQuality: 0.45,
  ssrRestQuality: 0.3,
  ssrMotionQuality: 0.2,
  ssrMotionAdaptive: true,
  ssrLowQualityFrames: 3,
  ssrClassificationEnabled: false,
  ssrMetalnessFloor: 0.05,
  ssrRoughnessCutoff: 0.65,
  ssrGlossinessFloor: 0.08,
  ssrSpecularWeightFloor: 0.12,
  ssrCheckerboardEnabled: true,
  ssrRoughnessAdaptive: true,
  ssrRoughAdaptiveMinFactor: 0.35,
  ssrUseHiZ: true,
  ssrIntensity: 1.74,
  ssrMaxDistance: 11.6,
  ssrThickness: 2.63,
  ssrEmissiveBoost: 0,
  ssrEnvironmentIntensity: 0.05,
  ssrMaxLuminance: 35,
  ssrMirrorBias: 1,
  ssrScreenEdgeFade: 0.13,
  ssrScreenEdgeFadeBlack: true,
  ssrStepExponent: 2,
  ssrDenoiseLumaPhi: 1.03,
  ssrDenoiseDepthPhi: 11.72,
  ssrDenoiseNormalPhi: 0.35,
  ssrDenoiseRadius: 0.71,
  ssrDenoiseStrength: 0.95,
  ssrDenoiseAdapt: 1,
  ssrDenoiseAlphaPhi: 15,
  ssrTemporalMaxFrames: 20,
  ssrTemporalClampIntensity: 0,
  ssrTemporalFlickerSuppression: 1,

  lensflareBlurRadius: 4,

  smokeEnabled: false,
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
  performanceProfile.ao = false;
  performanceProfile.ssr = false;

  if (isAppleMobile() || isSafari()) {
    performanceProfile.maxPixelRatio = 1;
    performanceProfile.adaptiveDpr = false;
    performanceProfile.smaa = true;
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

  const { perf, aoPass } = pipeline;
  perf.setBloomEnabled(performanceProfile.bloom);
  perf.setBloomResolutionScale(performanceProfile.bloomResolutionScale);
  perf.setDofEnabled(performanceProfile.dof);
  perf.setLensflareEnabled(performanceProfile.lensflare);
  perf.setLensflareResolutionScale(performanceProfile.lensflareResolutionScale);
  perf.setLensflareBlurRadius(performanceProfile.lensflareBlurRadius);
  perf.setSmaaEnabled(performanceProfile.smaa);
  perf.setAoEnabled?.(performanceProfile.ao);
  perf.setAoResolutionScale?.(performanceProfile.aoResolutionScale);
  perf.setAoSamples?.(performanceProfile.aoSamples);
  perf.setSsrEnabled?.(performanceProfile.ssr);
  perf.applySsrParams?.();

  if (aoPass) {
    aoPass.radius.value = performanceProfile.aoRadius;
    aoPass.scale.value = performanceProfile.aoScale;
    aoPass.thickness.value = performanceProfile.aoThickness;
    aoPass.distanceExponent.value = performanceProfile.aoDistanceExponent;
    aoPass.distanceFallOff.value = performanceProfile.aoDistanceFallOff;
  }
}
