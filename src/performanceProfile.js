/**
 * Runtime performance toggles. Defaults favor optimized settings; flip individual
 * flags in dev via `window.__app.perf` to A/B test FPS impact.
 */
export const performanceProfile = {
  groundReflection: true,
  groundResolutionScale: 0.25,
  groundReflectionFrameSkip: 2,

  bloom: true,
  dof: true,
  lensflare: true,
  smaa: true,

  lensflareBlurRadius: 4,
};

export function applyPerformanceProfileToPipeline(pipeline) {
  if (!pipeline?.perf) {
    return;
  }

  const { perf } = pipeline;
  perf.setBloomEnabled(performanceProfile.bloom);
  perf.setDofEnabled(performanceProfile.dof);
  perf.setLensflareEnabled(performanceProfile.lensflare);
  perf.setSmaaEnabled(performanceProfile.smaa);
}
