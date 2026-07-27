import {
  performanceProfile,
  applyPerformanceProfileToPipeline,
  getStaticPixelRatio,
} from "../platform/performanceProfile.js";

export function createPerformanceDevTools({
  pipeline,
  ground,
  adaptiveDpr = null,
  getAllowAdaptiveSample = null,
}) {
  let fps = 0;
  let frameCount = 0;
  let lastSampleTime = performance.now();
  const perfStats = { fps: 0, dpr: 0 };

  function sampleFps() {
    frameCount += 1;
    const now = performance.now();
    if (now - lastSampleTime >= 1000) {
      fps = frameCount;
      perfStats.fps = frameCount;
      perfStats.dpr = adaptiveDpr?.getDPR?.() ?? rendererDprFallback();
      if (getAllowAdaptiveSample?.() ?? true) {
        adaptiveDpr?.onFpsSample?.(fps);
      }
      frameCount = 0;
      lastSampleTime = now;
    }
  }

  function rendererDprFallback() {
    return getStaticPixelRatio();
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

    if (key === "adaptiveDpr" && adaptiveDpr) {
      adaptiveDpr.setEnabled(Boolean(value));
    } else if (key === "maxPixelRatio" && adaptiveDpr) {
      adaptiveDpr.onResize();
    } else if (key === "groundReflection") {
      ground?.setReflectionEnabled?.(Boolean(value));
      syncPipelineFromProfile();
    } else {
      syncPipelineFromProfile();
    }

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
    setAo(enabled) {
      return setProfileFlag("ao", Boolean(enabled));
    },
    setSsr(enabled) {
      return setProfileFlag("ssr", Boolean(enabled));
    },
    setCarSurfaceRain(enabled) {
      return setProfileFlag("carSurfaceRain", Boolean(enabled));
    },
    setAdaptiveDpr(enabled) {
      return setProfileFlag("adaptiveDpr", Boolean(enabled));
    },
    getAdaptiveDpr: () => adaptiveDpr?.getDPR?.() ?? getStaticPixelRatio(),
    printHelp() {
      console.info(
        [
          "[perf] Toggle flags: __app.perf.set('groundReflection', false)",
          "  groundReflection, bloom, dof, lensflare, smaa, ao, ssr, carSurfaceRain, adaptiveDpr",
          "  maxPixelRatio (1), groundResolutionScale (0.5), groundReflectionFrameSkip (1)",
          "  bloomResolutionScale (0.5), lensflareResolutionScale (0.5)",
          "  aoResolutionScale (0.5), aoSamples (6), aoRadius (0.4), aoScale (1.7)",
          "  ssrResolutionScale (0.5), ssrRestQuality (0.3), ssrMotionQuality (0.2)",
          "  ssrMotionAdaptive, ssrClassificationEnabled, ssrCheckerboardEnabled",
          "  ssrRoughnessAdaptive, ssrUseHiZ, ssrLowQualityFrames (3)",
          "  ssrMaxDistance (80), ssrThickness (2), ssrEmissiveBoost (0)",
          "  ssrEnvironmentIntensity (0.05), ssrMaxLuminance (35), ssrScreenEdgeFadeBlack (true)",
          "  lensflareBlurRadius (4)",
          "  smokeEnabled (false), exhaustCount (50), ambientCount (40)",
          "  planeEnabled (true), billboardsEnabled (true)",
          "  __app.perf.getFps() / getAdaptiveDpr()",
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
    shouldUpdateCarSurfaceRain() {
      return performanceProfile.carSurfaceRain;
    },
    ground,
  };
}
