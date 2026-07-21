import {
  performanceProfile,
  applyPerformanceProfileToPipeline,
} from "./performanceProfile.js";

export function createPerformanceDevTools({ pipeline, ground }) {
  let fps = 0;
  let frameCount = 0;
  let lastSampleTime = performance.now();

  function sampleFps() {
    frameCount += 1;
    const now = performance.now();
    if (now - lastSampleTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      lastSampleTime = now;
    }
  }

  function syncPipelineFromProfile() {
    applyPerformanceProfileToPipeline(pipeline);
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

  syncPipelineFromProfile();

  const perfApi = {
    profile: performanceProfile,
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
          "  groundResolutionScale (0.25), groundReflectionFrameSkip (2)",
          "  lensflareBlurRadius (4)",
          "  __app.perf.getFps() — sampled each second in render loop",
        ].join("\n"),
      );
    },
  };

  if (import.meta.env.DEV) {
    console.info("[perf] Run __app.perf.printHelp() for FPS A/B toggles");
  }

  return {
    perfApi,
    sampleFps,
    shouldUpdateGroundReflection() {
      return performanceProfile.groundReflection;
    },
    ground,
  };
}
