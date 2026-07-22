import {
  performanceProfile,
  applyPerformanceProfileToPipeline,
} from "./performanceProfile.js";

export function createPerformanceDevTools({ pipeline, ground }) {
  let fps = 0;
  let frameCount = 0;
  let lastSampleTime = performance.now();
  const perfStats = { fps: 0 };

  function sampleFps() {
    frameCount += 1;
    const now = performance.now();
    if (now - lastSampleTime >= 1000) {
      fps = frameCount;
      perfStats.fps = frameCount;
      frameCount = 0;
      lastSampleTime = now;
    }
  }

  function syncPipelineFromProfile() {
    applyPerformanceProfileToPipeline(pipeline);
    ground?.setReflectionEnabled?.(performanceProfile.groundReflection);
  }

  function setProfileFlag(key, value) {
    if (!(key in performanceProfile)) {
      console.warn(`[perf] Unknown flag: ${key}`);
      return performanceProfile;
    }

    performanceProfile[key] = value;
    syncPipelineFromProfile();
    return performanceProfile;
  }

  const perfApi = {
    profile: performanceProfile,
    stats: perfStats,
    getFps: () => fps,
    sampleFps,
    set: setProfileFlag,
    setGroundReflection(enabled) {
      return setProfileFlag("groundReflection", Boolean(enabled));
    },
    setBloom(enabled) {
      return setProfileFlag("bloom", Boolean(enabled));
    },
    setDof(enabled) {
      return setProfileFlag("dof", Boolean(enabled));
    },
    setLensflare(enabled) {
      return setProfileFlag("lensflare", Boolean(enabled));
    },
    setSmaa(enabled) {
      return setProfileFlag("smaa", Boolean(enabled));
    },
    printHelp() {
      console.info(
        [
          "[perf] Toggle flags: __app.perf.set('groundReflection', false)",
          "  groundReflection, bloom, dof, lensflare, smaa",
          "  maxPixelRatio (1.5), groundResolutionScale (0.25), groundReflectionFrameSkip (2)",
          "  bloomResolutionScale (0.5), lensflareResolutionScale (0.5)",
          "  lensflareBlurRadius (4)",
          "  smokeEnabled (true), exhaustCount (50), ambientCount (40)",
          "  planeEnabled (true)",
          "  __app.perf.getFps() — sampled each second in render loop",
          "  Inspector: Settings → Development Mode → Post-processing → Performance",
        ].join("\n"),
      );
    },
  };

  syncPipelineFromProfile();
  if (import.meta.env.DEV) {
    console.info("[perf] Run __app.perf.printHelp() for FPS A/B toggles");
  }

  return {
    perfApi,
    perfStats,
    sampleFps,
    shouldUpdateGroundReflection() {
      return performanceProfile.groundReflection;
    },
    ground,
  };
}
