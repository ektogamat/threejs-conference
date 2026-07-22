/**
 * Runtime performance toggles. Defaults favor optimized settings; flip individual
 * flags in dev via `window.__app.perf` to A/B test FPS impact.
 */
export const performanceProfile = {
  maxPixelRatio: 1.5,

  groundReflection: true,
  groundResolutionScale: 0.5,
  groundReflectionFrameSkip: 1,

  bloom: true,
  bloomResolutionScale: 0.5,
  dof: true,
  lensflare: true,
  lensflareResolutionScale: 0.5,

  lensflareBlurRadius: 4,

  smokeEnabled: true,
  exhaustCount: 50,
  ambientCount: 40,

  planeEnabled: true,
};

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
}
