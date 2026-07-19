import * as THREE from "three/webgpu";
import { vec3, vec4 } from "three/tsl";
import { applySSGIQualityMode } from "./ssgi/math.js";
import { RENDER_MODES } from "./renderModes.js";
import { getRenderMode } from "./userPreferences.js";

export function setupInspector(renderer, pipeline, pcss, probe, sun = null) {
  const {
    post,
    scenePassColor,
    scenePassEmissive,
    giPass,
    temporalGiPass,
    denoiseGiNode,
    ssgiDenoiseParams,
    resetGiHistory,
    ssrNode,
    denoiseNode,
    ssrParams,
    emissiveRejectThreshold,
    applySsrParams: applyPipelineSsrParams,
    applySsgiDenoiseParams: applyPipelineSsgiDenoiseParams,
    bloomPass,
    bloomPassWide,
    compositePass,
    compositeWithBloom,
    traaPass,
    traaPassBeauty,
    finalPass,
    finalPassBeauty,
    gi,
    ao,
    applyRenderMode,
    getRenderMode: getPipelineRenderMode,
    applyFsrTuning,
    fsrSharpness,
    getFsrEnabled,
    getScenePassResolutionScale,
    look,
    applyLookPreset,
  } = pipeline;

  function notifyParamInteraction() {
    sun?.onParamInteractionStart?.();
    sun?.onParamInteraction?.();
    sun?.onParamInteractionEnd?.();
  }

  function notifyLightingParamChanged() {
    sun?.onLightingParamChanged?.();
  }

  function bindParamControl(control, onChangeFn) {
    if (onChangeFn) {
      control.onChange((value) => {
        notifyParamInteraction();
        onChangeFn(value);
      });
    } else {
      control.onChange(notifyParamInteraction);
    }

    return control;
  }

  // PCSS Shadows — hidden from inspector. Uncomment when re-enabling controls below.
  //
  // function bindShadowParamControl(control, onChangeFn) {
  //   if (onChangeFn) {
  //     control.onChange((value) => {
  //       notifyParamInteraction();
  //       onChangeFn(value);
  //       notifyLightingParamChanged();
  //     });
  //   } else {
  //     control.onChange(() => {
  //       notifyParamInteraction();
  //       notifyLightingParamChanged();
  //     });
  //   }
  //
  //   return control;
  // }

  function addParam(folder, object, property, ...args) {
    return bindParamControl(folder.add(object, property, ...args));
  }

  function addClosedFolder(parent, name) {
    return parent.addFolder(name).close();
  }

  // function addShadowParam(folder, object, property, ...args) {
  //   return bindShadowParamControl(folder.add(object, property, ...args));
  // }

  const params = {
    output: 0,
    ssgiQuality: "Medium",
    resetSsgiHistory: () => {
      resetGiHistory?.();
      notifyParamInteraction();
    },
  };

  const outputModes = {
    Combined: 0,
    Direct: 1,
    "SSGI AO": 2,
    "SSGI GI": 3,
    "SSR Raw": 4,
    Emissive: 5,
    Bloom: 6,
    "Bloom Wide": 7,
    "SSR Denoised": 8,
    "SSR Ray Length": 9,
  };

  const gui = renderer.inspector.createParameters("Post-processing");

  if (look && applyLookPreset) {
    const lookUniforms = look.uniforms;
    const lookPresetLabels = look.getPresetLabels();
    const lookParams = { preset: look.getCurrentPresetId() };

    function applyLookPresetFromInspector(presetId) {
      applyLookPreset(presetId, {
        bloomPass,
        bloomPassWide,
        onSunApply: ({ hour, strength }) => {
          if (!sun?.sunState) {
            return;
          }

          sun.sunState.hour = hour;
          sun.sunState.strength = strength;
          sun.refreshSun?.();
          notifyLightingParamChanged();
        },
      });
      lookParams.preset = presetId;
      syncFogColorParams();
    }

    const fogColorParams = { r: 0, g: 0, b: 0 };

    function syncFogColorParams() {
      const color = look.linearFogColorToSrgb();
      fogColorParams.r = color.r;
      fogColorParams.g = color.g;
      fogColorParams.b = color.b;
    }

    syncFogColorParams();

    function updateFogColor() {
      look.setFogColorFromSrgb(
        fogColorParams.r,
        fogColorParams.g,
        fogColorParams.b,
      );
    }

    const lookFolder = addClosedFolder(gui, "Look");
    bindParamControl(
      lookFolder.add(lookParams, "preset", lookPresetLabels).name("preset"),
      applyLookPresetFromInspector,
    );

    const fogFolder = addClosedFolder(lookFolder, "Fog / Haze");
    addParam(fogFolder, lookUniforms.fogEnabled, "value", 0, 1).name(
      "enabled",
    );
    addParam(fogFolder, lookUniforms.fogNear, "value", 0, 1).name("near");
    addParam(fogFolder, lookUniforms.fogFar, "value", 0, 1).name("far");
    addParam(fogFolder, lookUniforms.fogAmount, "value", 0, 1).name("amount");
    bindParamControl(
      fogFolder.add(fogColorParams, "r", 0, 1, 0.01).name("color r"),
      updateFogColor,
    );
    bindParamControl(
      fogFolder.add(fogColorParams, "g", 0, 1, 0.01).name("color g"),
      updateFogColor,
    );
    bindParamControl(
      fogFolder.add(fogColorParams, "b", 0, 1, 0.01).name("color b"),
      updateFogColor,
    );

    const gradeFolder = addClosedFolder(lookFolder, "Color Grade");
    addParam(gradeFolder, lookUniforms.gradeMix, "value", 0, 1).name(
      "grade mix",
    );
    addParam(gradeFolder, lookUniforms.saturation, "value", 0, 2).name(
      "saturation",
    );
    addParam(gradeFolder, lookUniforms.contrast, "value", 0.5, 2).name(
      "contrast",
    );
    addParam(gradeFolder, lookUniforms.greenSuppress, "value", 0, 1).name(
      "green suppress",
    );

    const chromaFolder = addClosedFolder(lookFolder, "Chromatic");
    addParam(chromaFolder, lookUniforms.chromaticStrength, "value", 0, 2).name(
      "strength",
    );

    const vignetteFolder = addClosedFolder(lookFolder, "Vignette");
    addParam(
      vignetteFolder,
      lookUniforms.vignetteIntensity,
      "value",
      0,
      1,
    ).name("intensity");
    addParam(
      vignetteFolder,
      lookUniforms.vignetteSmoothness,
      "value",
      0,
      1,
    ).name("smoothness");

    const grainFolder = addClosedFolder(lookFolder, "Grain");
    addParam(grainFolder, lookUniforms.grainIntensity, "value", 0, 1).name(
      "intensity",
    );
  }

  bindParamControl(
    gui.add(params, "output", outputModes).name("output view"),
    updateOutput,
  );

  const renderModeLabels = {
    Default: RENDER_MODES.default,
    "High end": RENDER_MODES.highEnd,
    Ultra: RENDER_MODES.ultra,
    Insane: RENDER_MODES.insane,
  };
  const renderModeParams = {
    mode:
      sun?.renderModeController?.getMode?.() ??
      getPipelineRenderMode?.() ??
      getRenderMode(),
  };
  const renderModeFolder = addClosedFolder(gui, "Render mode");
  bindParamControl(
    renderModeFolder
      .add(renderModeParams, "mode", renderModeLabels)
      .name("quality preset"),
    (mode) => {
      sun?.onRenderModeChange?.(mode);
    },
  );

  sun?.renderModeController?.subscribe?.((mode) => {
    renderModeParams.mode = mode;
  });

  if (applyFsrTuning && fsrSharpness) {
    const fsrParams = {
      enabled: getFsrEnabled?.() ?? true,
      sharpness: fsrSharpness.value,
      scenePassResolutionScale: getScenePassResolutionScale?.() ?? 1,
    };

    const fsrFolder = addClosedFolder(gui, "FSR 1");

    const syncFsrTuning = () => {
      applyFsrTuning({
        enabled: fsrParams.enabled,
        sharpness: fsrParams.sharpness,
        scenePassResolutionScale: fsrParams.scenePassResolutionScale,
      });
    };

    bindParamControl(
      fsrFolder.add(fsrParams, "enabled").name("enabled"),
      syncFsrTuning,
    );
    bindParamControl(
      fsrFolder
        .add(fsrParams, "sharpness", 0, 2, 0.05)
        .name("sharpness (0=max)"),
      (value) => {
        fsrSharpness.value = value;
        syncFsrTuning();
      },
    );
    bindParamControl(
      fsrFolder
        .add(fsrParams, "scenePassResolutionScale", 0.25, 1, 0.05)
        .name("scene pass scale"),
      syncFsrTuning,
    );
  }

  if (sun?.scene?.environment) {
    const envRotation = {
      x: THREE.MathUtils.radToDeg(sun.scene.environmentRotation.x),
      y: THREE.MathUtils.radToDeg(sun.scene.environmentRotation.y),
      z: THREE.MathUtils.radToDeg(sun.scene.environmentRotation.z),
    };

    const syncEnvRotation = () => {
      sun.scene.environmentRotation.set(
        THREE.MathUtils.degToRad(envRotation.x),
        THREE.MathUtils.degToRad(envRotation.y),
        THREE.MathUtils.degToRad(envRotation.z),
      );
    };

    const envFolder = addClosedFolder(gui, "Environment Map");
    if (sun?.envMapBaseIntensity?.value !== undefined) {
      bindParamControl(
        envFolder
          .add(sun.envMapBaseIntensity, "value", 0, 0.5, 0.01)
          .name("intensity base"),
        sun.syncEnvironmentIntensity,
      );
    } else {
      addParam(envFolder, sun.scene, "environmentIntensity", 0, 0.5, 0.01).name(
        "intensity",
      );
    }
    bindParamControl(
      envFolder.add(envRotation, "x", -180, 180, 1).name("rotation X"),
      syncEnvRotation,
    );
    bindParamControl(
      envFolder.add(envRotation, "y", -180, 180, 1).name("rotation Y"),
      syncEnvRotation,
    );
    bindParamControl(
      envFolder.add(envRotation, "z", -180, 180, 1).name("rotation Z"),
      syncEnvRotation,
    );
  }

  const ssgiFolder = addClosedFolder(gui, "SSGI");
  bindParamControl(
    ssgiFolder.add(giPass.sliceCount, "value", 1, 4, 1).name("slice count"),
    () => resetGiHistory?.(),
  );
  bindParamControl(
    ssgiFolder.add(giPass.stepCount, "value", 1, 32, 1).name("step count"),
    () => resetGiHistory?.(),
  );
  addParam(ssgiFolder, giPass.radius, "value", 1, 25).name("radius");
  addParam(ssgiFolder, giPass.expFactor, "value", 1, 3).name("exp factor");
  addParam(ssgiFolder, giPass.thickness, "value", 0.01, 10).name("thickness");
  addParam(ssgiFolder, giPass.backfaceLighting, "value", 0, 1).name(
    "backface lighting",
  );
  addParam(ssgiFolder, giPass.aoIntensity, "value", 0, 4).name("AO intensity");
  addParam(ssgiFolder, giPass.giIntensity, "value", 0, 100).name(
    "GI intensity",
  );
  addParam(ssgiFolder, giPass.useLinearThickness, "value").name(
    "use linear thickness",
  );
  addParam(ssgiFolder, giPass.useScreenSpaceSampling, "value").name(
    "screen-space sampling",
  );
  bindParamControl(
    ssgiFolder.add(giPass, "useTemporalFiltering").name("temporal filtering"),
    () => {
      updateOutput();
    },
  );
  bindParamControl(
    ssgiFolder.add(giPass, "resolutionScale", 0.25, 1).name("resolution scale"),
    () => resetGiHistory?.(),
  );

  const ssgiQualityModes = {
    Performance: "Performance",
    Low: "Low",
    Medium: "Medium",
    High: "High",
    Ultra: "Ultra",
  };

  const ssgiDenoiseFolder = addClosedFolder(gui, "SSGI Denoise");
  bindParamControl(
    ssgiDenoiseFolder
      .add(params, "ssgiQuality", ssgiQualityModes)
      .name("quality preset"),
    (mode) => {
      applySSGIQualityMode(giPass, mode);
      resetGiHistory?.();
    },
  );
  bindParamControl(
    ssgiDenoiseFolder.add(ssgiDenoiseParams, "enabled").name("spatial denoise"),
    () => applyPipelineSsgiDenoiseParams?.(),
  );
  addParam(ssgiDenoiseFolder, denoiseGiNode.lumaPhi, "value", 0, 3).name(
    "luma phi",
  );
  addParam(ssgiDenoiseFolder, denoiseGiNode.depthPhi, "value", 0, 50).name(
    "depth phi",
  );
  addParam(
    ssgiDenoiseFolder,
    denoiseGiNode.normalPhi,
    "value",
    0.01,
    1,
    0.01,
  ).name("normal phi");
  addParam(ssgiDenoiseFolder, denoiseGiNode.radius, "value", 0, 3).name(
    "radius",
  );
  addParam(ssgiDenoiseFolder, denoiseGiNode.alphaPhi, "value", 0, 15).name(
    "ao phi",
  );
  addParam(ssgiDenoiseFolder, denoiseGiNode.strength, "value", 0.5, 0.95).name(
    "strength",
  );
  addParam(ssgiDenoiseFolder, denoiseGiNode.adapt, "value", 0, 1).name("adapt");
  addParam(ssgiDenoiseFolder, giPass.giOcclusionStrength, "value", 0, 1).name(
    "GI occlusion mask",
  );
  addParam(
    ssgiDenoiseFolder,
    temporalGiPass.maxFrames,
    "value",
    1,
    128,
    1,
  ).name("max frames");
  addParam(
    ssgiDenoiseFolder,
    temporalGiPass.clampIntensity,
    "value",
    0,
    1,
  ).name("clamp intensity");
  addParam(
    ssgiDenoiseFolder,
    temporalGiPass.flickerSuppression,
    "value",
    0,
    1,
  ).name("flicker suppression");
  bindParamControl(
    ssgiDenoiseFolder.add(params, "resetSsgiHistory").name("reset history"),
  );

  function applySsrSettings() {
    applyPipelineSsrParams(ssrParams);
  }

  const ssrFolder = addClosedFolder(gui, "SSR");
  bindParamControl(
    ssrFolder.add(ssrParams.ssr, "quality", 0, 1).name("quality"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder.add(ssrParams.ssr, "intensity", 0, 8).name("intensity"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder.add(ssrParams.ssr, "opacity", 0, 1).name("opacity"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder.add(ssrParams.ssr, "maxDistance", 0, 50).name("max distance"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder.add(ssrParams.ssr, "thickness", 0, 0.25).name("thickness"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder.add(ssrParams.ssr, "mirrorBias", 0, 1).name("mirror bias"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder
      .add(ssrParams.ssr, "stepExponent", 1, 4, 0.5)
      .name("step exponent"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder.add(ssrParams.ssr, "binaryRefine").name("binary refine"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder
      .add(ssrParams.ssr, "environmentIntensity", 0, 10)
      .name("SSR env intensity"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder.add(ssrParams.ssr, "maxLuminance", 0, 1).name("max luminance"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder
      .add(ssrParams.ssr, "screenEdgeFade", 0, 1)
      .name("screen edge fade"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder
      .add(ssrParams.ssr, "screenEdgeFadeBlack")
      .name("screen edge fade black"),
    applySsrSettings,
  );
  bindParamControl(
    ssrFolder
      .add(emissiveRejectThreshold, "value", 0, 0.25)
      .name("emissive reject"),
  );
  bindParamControl(
    ssrFolder
      .add(ssrParams.ssr, "resolutionScale", 0.25, 1)
      .name("resolution scale"),
    applySsrSettings,
  );

  const ssrDenoiseFolder = addClosedFolder(gui, "SSR Denoise");
  bindParamControl(
    ssrDenoiseFolder.add(ssrParams.denoise, "enabled").name("enabled"),
    applySsrSettings,
  );
  bindParamControl(
    ssrDenoiseFolder.add(ssrParams.denoise, "lumaPhi", 0, 3).name("luma phi"),
    applySsrSettings,
  );
  bindParamControl(
    ssrDenoiseFolder
      .add(ssrParams.denoise, "depthPhi", 0, 50)
      .name("depth phi"),
    applySsrSettings,
  );
  bindParamControl(
    ssrDenoiseFolder
      .add(ssrParams.denoise, "normalPhi", 0.01, 1, 0.01)
      .name("normal phi"),
    applySsrSettings,
  );
  bindParamControl(
    ssrDenoiseFolder
      .add(ssrParams.denoise, "alphaPhi", 0, 15)
      .name("ray length phi"),
    applySsrSettings,
  );
  bindParamControl(
    ssrDenoiseFolder.add(ssrParams.denoise, "radius", 0, 3).name("radius"),
    applySsrSettings,
  );
  bindParamControl(
    ssrDenoiseFolder
      .add(ssrParams.denoise, "strength", 0.5, 0.95)
      .name("strength"),
    applySsrSettings,
  );
  bindParamControl(
    ssrDenoiseFolder.add(ssrParams.denoise, "adapt", 0, 1).name("adapt"),
    applySsrSettings,
  );

  const ssrTemporalFolder = addClosedFolder(gui, "SSR Temporal");
  bindParamControl(
    ssrTemporalFolder
      .add(ssrParams.temporalReproject, "maxFrames", 1, 128, 1)
      .name("max frames"),
    applySsrSettings,
  );
  bindParamControl(
    ssrTemporalFolder
      .add(ssrParams.temporalReproject, "clampIntensity", 0, 1)
      .name("clamp intensity"),
    applySsrSettings,
  );
  bindParamControl(
    ssrTemporalFolder
      .add(ssrParams.temporalReproject, "flickerSuppression", 0, 1)
      .name("flicker suppression"),
    applySsrSettings,
  );
  bindParamControl(
    ssrTemporalFolder
      .add(ssrParams.temporalReproject, "hitPointReprojection")
      .name("hit point reprojection"),
    applySsrSettings,
  );

  const bloomFolder = addClosedFolder(gui, "Bloom");
  addParam(bloomFolder, bloomPass.strength, "value", 0, 5).name("strength");
  addParam(bloomFolder, bloomPass.radius, "value", 0, 1).name("radius");

  if (bloomPassWide) {
    const bloomWideFolder = addClosedFolder(gui, "Bloom Wide");
    addParam(bloomWideFolder, bloomPassWide.strength, "value", 0, 5).name(
      "strength",
    );
    addParam(bloomWideFolder, bloomPassWide.radius, "value", 0, 1).name(
      "radius",
    );
  }

  if (sun?.sunState && sun?.refreshSun) {
    const sunFolder = addClosedFolder(gui, "Sun");
    bindParamControl(
      sunFolder.add(sun.sunState, "strength", 0, 4, 0.05).name("strength"),
      sun.refreshSun,
    );
  }

  // PCSS Shadows — hidden from inspector. Soft shadows still active via scene.js / pcss.js.
  //
  // if (pcss) {
  //   const pcssFolder = gui.addFolder("PCSS Shadows");
  //   addShadowParam(pcssFolder, pcss.lightSize, "value", 0.01, 5).name(
  //     "light size",
  //   );
  //   addShadowParam(pcssFolder, pcss.nearPlane, "value", 0.1, 10).name(
  //     "near plane",
  //   );
  //   addShadowParam(pcssFolder, pcss.frustumScale, "value", 0.1, 20).name(
  //     "frustum scale",
  //   );
  // }

  function restoreCombinedOutput() {
    const mode =
      sun?.renderModeController?.getMode?.() ??
      getPipelineRenderMode?.() ??
      getRenderMode();
    applyRenderMode(mode);
  }

  function updateOutput(value = params.output) {
    if (value === 1) {
      post.outputNode = scenePassColor;
    } else if (value === 2) {
      post.outputNode = vec4(vec3(ao), 1);
    } else if (value === 3) {
      post.outputNode = vec4(gi, 1);
    } else if (value === 4) {
      post.outputNode = vec4(ssrNode.rgb, 1);
    } else if (value === 5) {
      post.outputNode = scenePassEmissive;
    } else if (value === 6) {
      post.outputNode = vec4(bloomPass.rgb, 1);
    } else if (value === 7) {
      post.outputNode = bloomPassWide
        ? vec4(bloomPassWide.rgb, 1)
        : vec4(bloomPass.rgb, 1);
    } else if (value === 8) {
      post.outputNode = vec4(denoiseNode.rgb, 1);
    } else if (value === 9) {
      post.outputNode = vec4(ssrNode.aaa, 1);
    } else {
      restoreCombinedOutput();
      return;
    }

    post.needsUpdate = true;
  }

  return { updateOutput };
}
