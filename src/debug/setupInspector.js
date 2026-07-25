import * as THREE from "three/webgpu";
import { vec3, vec4 } from "three/tsl";
import { performanceProfile } from "../platform/performanceProfile.js";
import {
  isDevEnvironment,
  setStoredLookPreset,
} from "../platform/userPreferences.js";

export function setupInspector(
  renderer,
  pipeline,
  sun = null,
  ground = null,
  cameraControls = null,
  rain = null,
  smoke = null,
  planes = null,
  sky = null,
  cityMaterials = null,
  adaptiveDpr = null,
) {
  const {
    post,
    scenePassColor,
    scenePassEmissive,
    bloomPass,
    aoPass,
    lensflare,
    look,
    applyLookPreset,
    restoreCombinedOutput,
    composedOutput,
    dof,
    perf: pipelinePerf,
  } = pipeline;

  // Production Development Mode: Look, output view, Environment Map, Bloom,
  // Lensflare, DOF, Ground, Rain. Everything else is local-DEV only.
  const showDevOnlyPanels = isDevEnvironment();

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

  function addParam(folder, object, property, ...args) {
    return bindParamControl(folder.add(object, property, ...args));
  }

  function addClosedFolder(parent, name) {
    return parent.addFolder(name).close();
  }

  const params = {
    output: 0,
  };

  const outputModes = {
    Combined: 0,
    Beauty: 1,
    Emissive: 2,
    Bloom: 3,
    Composed: 4,
    Lensflare: 5,
    AO: 6,
  };

  const gui = renderer.inspector.createParameters("Post-processing");

  if (look && applyLookPreset) {
    const lookUniforms = look.uniforms;
    const lookPresetLabels = look.getPresetLabels();
    const lookParams = { preset: look.getCurrentPresetId() };

    function applyLookPresetFromInspector(presetId) {
      applyLookPreset(presetId, {
        bloomPass,
        lensflare,
      });
      setStoredLookPreset(presetId);
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
    addParam(fogFolder, lookUniforms.fogNear, "value", -20, 120, 1).name(
      "start (m)",
    );
    addParam(fogFolder, lookUniforms.fogFar, "value", 20, 600, 1).name(
      "end (m)",
    );
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
    addParam(
      chromaFolder,
      lookUniforms.chromaticEdgeFalloff,
      "value",
      0.5,
      12,
    ).name("edge falloff");

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

  const bloomFolder = addClosedFolder(gui, "Bloom");
  addParam(bloomFolder, bloomPass.strength, "value", 0, 5).name("strength");
  addParam(bloomFolder, bloomPass.radius, "value", 0, 1).name("radius");

  if (showDevOnlyPanels && pipelinePerf) {
    const perfFolder = addClosedFolder(gui, "Performance");

    function bindPerfToggle(key, label, applyFn) {
      bindParamControl(
        perfFolder.add(performanceProfile, key).name(label ?? key),
        (value) => {
          performanceProfile[key] = value;
          applyFn?.(value);
        },
      );
    }

    function bindPerfSlider(key, label, min, max, step, applyFn) {
      bindParamControl(
        perfFolder.add(performanceProfile, key, min, max, step).name(label),
        (value) => {
          performanceProfile[key] = value;
          applyFn?.(value);
        },
      );
    }

    bindPerfSlider(
      "maxPixelRatio",
      "max pixel ratio",
      0.5,
      1.5,
      0.05,
      () => {
        adaptiveDpr?.onResize?.();
      },
    );

    bindPerfToggle("adaptiveDpr", "adaptive dpr", (enabled) => {
      adaptiveDpr?.setEnabled?.(enabled);
    });

    bindPerfToggle(
      "groundReflection",
      "ground reflection",
      (enabled) => ground?.setReflectionEnabled?.(enabled),
    );
    bindPerfSlider(
      "groundResolutionScale",
      "ground reflection res",
      0.15,
      0.5,
      0.05,
    );
    bindPerfSlider(
      "groundReflectionFrameSkip",
      "ground reflection skip",
      1,
      4,
      1,
    );

    bindPerfToggle("carSurfaceRain", "car surface rain");
    bindPerfSlider("carSurfaceRainFadeStart", "car rain fade start", 5, 40, 1);
    bindPerfSlider("carSurfaceRainFadeEnd", "car rain fade end", 10, 60, 1);

    bindPerfToggle("bloom", "bloom", pipelinePerf.setBloomEnabled);
    bindPerfSlider(
      "bloomResolutionScale",
      "bloom resolution",
      0.15,
      1,
      0.05,
      pipelinePerf.setBloomResolutionScale,
    );

    bindPerfToggle("dof", "dof", pipelinePerf.setDofEnabled);

    bindPerfToggle("lensflare", "lensflare", pipelinePerf.setLensflareEnabled);
    bindPerfSlider(
      "lensflareResolutionScale",
      "lensflare resolution",
      0.15,
      1,
      0.05,
      pipelinePerf.setLensflareResolutionScale,
    );
    bindPerfSlider(
      "lensflareBlurRadius",
      "lensflare blur radius",
      0,
      12,
      1,
      pipelinePerf.setLensflareBlurRadius,
    );

    bindPerfToggle("smaa", "smaa", pipelinePerf.setSmaaEnabled);

    bindPerfToggle("ao", "ao (gtao)", pipelinePerf.setAoEnabled);
    bindPerfSlider(
      "aoResolutionScale",
      "ao resolution",
      0.25,
      1,
      0.05,
      pipelinePerf.setAoResolutionScale,
    );
    bindPerfSlider(
      "aoSamples",
      "ao samples",
      4,
      32,
      1,
      pipelinePerf.setAoSamples,
    );
  }

  if (aoPass) {
    const aoFolder = addClosedFolder(gui, "AO (GTAO)");
    bindParamControl(
      aoFolder
        .add({ enabled: Boolean(performanceProfile.ao) }, "enabled")
        .name("enabled"),
      (value) => {
        performanceProfile.ao = Boolean(value);
        pipelinePerf?.setAoEnabled?.(value);
      },
    );
    addParam(aoFolder, aoPass.samples, "value", 4, 32, 1).name("samples");
    addParam(aoFolder, aoPass.radius, "value", 0.1, 4).name("radius");
    addParam(aoFolder, aoPass.scale, "value", 0.01, 2).name("scale");
    addParam(aoFolder, aoPass.thickness, "value", 0.01, 4).name("thickness");
    addParam(aoFolder, aoPass.distanceExponent, "value", 1, 2).name(
      "distance exponent",
    );
    addParam(aoFolder, aoPass.distanceFallOff, "value", 0.01, 1).name(
      "distance falloff",
    );
  }

  if (lensflare) {
    const lensflareFolder = addClosedFolder(gui, "Lensflare");
    addParam(lensflareFolder, lensflare.strength, "value", 0, 2).name(
      "strength",
    );
    addParam(lensflareFolder, lensflare.threshold, "value", 0, 1).name(
      "threshold",
    );
    addParam(lensflareFolder, lensflare.ghostSpacing, "value", 0, 0.4).name(
      "spacing",
    );
    addParam(
      lensflareFolder,
      lensflare.ghostAttenuation,
      "value",
      10,
      50,
    ).name("attenuation");
  }

  if (dof) {
    const dofFolder = addClosedFolder(gui, "DOF");
    bindParamControl(
      dofFolder.add({ enabled: Boolean(dof.enabled.value) }, "enabled").name("enabled"),
      (value) => {
        performanceProfile.dof = Boolean(value);
        pipelinePerf?.setDofEnabled?.(value);
      },
    );
    addParam(dofFolder, dof.minDistance, "value", 0, 50).name("min distance");
    addParam(dofFolder, dof.maxDistance, "value", 0, 100).name("max distance");
    addParam(dofFolder, dof.blurSize, "value", 1, 3, 1).name("blur size");
    addParam(dofFolder, dof.blurSpread, "value", 1, 7, 1).name("blur spread");
  }

  if (showDevOnlyPanels && sun?.sunState && sun?.refreshSun) {
    const sunFolder = addClosedFolder(gui, "Sun");
    const refreshSun = () => {
      sun.refreshSun?.();
      notifyLightingParamChanged();
    };

    bindParamControl(
      sunFolder.add(sun.sunState, "intensity", 0, 10, 0.05).name("intensity"),
      refreshSun,
    );
    bindParamControl(
      sunFolder
        .add(sun.sunState, "shadowIntensity", 0, 3, 0.05)
        .name("shadow intensity"),
      refreshSun,
    );
    bindParamControl(
      sunFolder.addColor(sun.sunState, "color").name("color"),
      refreshSun,
    );
    bindParamControl(
      sunFolder.add(sun.sunState, "x", -200, 200, 1).name("position x"),
      refreshSun,
    );
    bindParamControl(
      sunFolder.add(sun.sunState, "y", -200, 200, 1).name("position y"),
      refreshSun,
    );
    bindParamControl(
      sunFolder.add(sun.sunState, "z", -200, 200, 1).name("position z"),
      refreshSun,
    );
  }

  if (ground?.uniforms) {
    const groundFolder = addClosedFolder(gui, "Ground");
    addParam(groundFolder, ground.uniforms.uvRepeat, "value", 0.5, 64, 0.1).name(
      "texture repeat",
    );
    addParam(
      groundFolder,
      ground.uniforms.roughnessScale,
      "value",
      0,
      1,
      0.01,
    ).name("roughness scale");
    addParam(
      groundFolder,
      ground.uniforms.reflectionStrength,
      "value",
      0,
      1,
      0.01,
    ).name("reflection strength");
    addParam(groundFolder, ground.uniforms.normalWarp, "value", 0, 0.1, 0.001).name(
      "normal warp",
    );
    addParam(groundFolder, ground.uniforms.fogNear, "value", 0, 200, 1).name(
      "fade near",
    );
    addParam(groundFolder, ground.uniforms.fogFar, "value", 10, 400, 1).name(
      "fade far",
    );
    addParam(
      groundFolder,
      ground.uniforms.rippleAmount,
      "value",
      0,
      1,
      0.01,
    ).name("ripple amount");
    addParam(
      groundFolder,
      ground.uniforms.rippleScale,
      "value",
      0.5,
      120,
      0.1,
    ).name("ripple scale");
    addParam(
      groundFolder,
      ground.uniforms.rippleSpeed,
      "value",
      0.5,
      8,
      0.1,
    ).name("ripple speed");
    addParam(
      groundFolder,
      ground.uniforms.rippleStrength,
      "value",
      0,
      0.25,
      0.005,
    ).name("ripple reflection");
    addParam(
      groundFolder,
      ground.uniforms.rippleNormalStrength,
      "value",
      0,
      1,
      0.01,
    ).name("ripple normal");
  }

  if (showDevOnlyPanels && cityMaterials?.billboard?.uniforms) {
    const billboardFolder = addClosedFolder(gui, "Billboard");
    const { vignetteInner, vignetteOuter, vignetteMin, emissiveIntensity } =
      cityMaterials.billboard.uniforms;

    addParam(billboardFolder, vignetteInner, "value", 0, 1, 0.01).name(
      "vignette inner",
    );
    addParam(billboardFolder, vignetteOuter, "value", 0, 1, 0.01).name(
      "vignette outer",
    );
    addParam(billboardFolder, vignetteMin, "value", 0, 1, 0.01).name(
      "vignette min",
    );
    addParam(billboardFolder, emissiveIntensity, "value", 0, 2, 0.01).name(
      "emissive",
    );
  }

  if (rain?.params) {
    const rainFolder = addClosedFolder(gui, "Rain");
    bindParamControl(
      rainFolder.add(rain.params, "enabled").name("enabled"),
      (value) => rain.setEnabled(value),
    );
    bindParamControl(
      rainFolder
        .add(rain.params, "count", 200, 2000, 100)
        .name("drop count"),
      (value) => rain.setDropCount(value),
    );
    bindParamControl(
      rainFolder.add(rain.params, "opacity", 0.02, 1, 0.01).name("opacity"),
      (value) => rain.setOpacity(value),
    );
    bindParamControl(
      rainFolder
        .add(rain.params, "overallSpeed", 5, 80, 1)
        .name("overall speed"),
      (value) => rain.setOverallSpeed(value),
    );
    bindParamControl(
      rainFolder
        .add(rain.params, "radius", 8, 50, 1)
        .name("volume radius"),
      (value) => rain.setVolumeRadius(value),
    );
    bindParamControl(
      rainFolder.add(rain.params, "intensity", 0.1, 2, 0.05).name("intensity"),
      (value) => rain.setIntensity(value),
    );
    bindParamControl(
      rainFolder
        .add(rain.params, "thickness", 0.1, 1.5, 0.01)
        .name("thickness"),
      (value) => rain.setThickness(value),
    );
    bindParamControl(
      rainFolder
        .add(rain.params, "refractCount", 0, 2000, 25)
        .name("refract count"),
      (value) => rain.setRefractCount(value),
    );

    if (pipeline.refraction?.params) {
      bindParamControl(
        rainFolder
          .add(pipeline.refraction.params, "enabled")
          .name("refract enabled"),
        (value) => pipeline.refraction.setEnabled(value),
      );
      bindParamControl(
        rainFolder
          .add(pipeline.refraction.params, "strength", 0, 0.5, 0.001)
          .name("refraction strength"),
        (value) => pipeline.refraction.setStrength(value),
      );
    }
  }

  if (showDevOnlyPanels && smoke?.params) {
    const smokeFolder = addClosedFolder(gui, "Smoke");

    bindParamControl(
      smokeFolder
        .add(smoke.params, "exhaustOpacity", 0, 1, 0.01)
        .name("exhaust opacity"),
      (value) => smoke.setExhaustOpacity(value),
    );
    bindParamControl(
      smokeFolder
        .add(smoke.params, "exhaustScale", 0.5, 8, 0.1)
        .name("exhaust scale"),
      (value) => smoke.setExhaustScale(value),
    );
    bindParamControl(
      smokeFolder
        .add(smoke.params, "exhaustSpeed", 0.01, 0.5, 0.01)
        .name("exhaust speed"),
      (value) => smoke.setExhaustSpeed(value),
    );

    const exhaustFolder = addClosedFolder(smokeFolder, "Exhaust pipes");
    smoke.params.exhaust.forEach((pipeParams, index) => {
      const pipeFolder = addClosedFolder(exhaustFolder, `Pipe ${index + 1}`);
      bindParamControl(pipeFolder.add(pipeParams, "x", -5, 5, 0.01), () => {
        smoke.syncExhaustPosition(index);
      });
      bindParamControl(pipeFolder.add(pipeParams, "y", -2, 3, 0.01), () => {
        smoke.syncExhaustPosition(index);
      });
      bindParamControl(pipeFolder.add(pipeParams, "z", -5, 5, 0.01), () => {
        smoke.syncExhaustPosition(index);
      });
    });

    bindParamControl(
      smokeFolder
        .add(smoke.params, "ambientOpacity", 0, 1, 0.01)
        .name("ambient opacity"),
      (value) => smoke.setAmbientOpacity(value),
    );
    bindParamControl(
      smokeFolder
        .add(smoke.params, "ambientSpeed", 0.01, 0.3, 0.005)
        .name("ambient speed"),
      (value) => smoke.setAmbientSpeed(value),
    );

    const ambientFolder = addClosedFolder(smokeFolder, "Ground puffs");
    smoke.params.ambient.forEach((puffParams, index) => {
      const puffFolder = addClosedFolder(ambientFolder, `Puff ${index + 1}`);
      bindParamControl(puffFolder.add(puffParams, "x", -200, 0, 0.1), () => {
        smoke.syncAmbientPosition(index);
      });
      bindParamControl(puffFolder.add(puffParams, "y", -10, 0, 0.05), () => {
        smoke.syncAmbientPosition(index);
      });
      bindParamControl(puffFolder.add(puffParams, "z", 0, 80, 0.1), () => {
        smoke.syncAmbientPosition(index);
      });
      bindParamControl(
        puffFolder.add(puffParams, "scale", 1, 15, 0.1).name("scale"),
        (value) => smoke.setAmbientScale(index, value),
      );
    });

    smokeFolder
      .add({ logConfig: () => smoke.logConfig() }, "logConfig")
      .name("log config to console");
  }

  if (showDevOnlyPanels && planes?.params) {
    const planesFolder = addClosedFolder(gui, "Planes");

    bindParamControl(
      planesFolder.add(planes.params, "enabled").name("enabled"),
      (value) => planes.setEnabled(value),
    );
    bindParamControl(
      planesFolder
        .add(planes.params, "speedMultiplier", 0.1, 4, 0.05)
        .name("speed multiplier"),
      (value) => planes.setSpeedMultiplier(value),
    );
    bindParamControl(
      planesFolder.add(planes.params, "debugPath").name("debug path"),
      (value) => planes.setDebugPath(value),
    );
    bindParamControl(
      planesFolder
        .addColor(planes.params, "debugPathColor")
        .name("debug path color"),
      (value) => planes.setDebugPathColor(value),
    );

    planes.params.paths.forEach((pathParams, pathIndex) => {
      const pathFolder = addClosedFolder(planesFolder, `Path ${pathIndex + 1}`);

      bindParamControl(
        pathFolder.add(pathParams, "speed", 0.1, 4, 0.05).name("speed"),
      );
      bindParamControl(
        pathFolder.add(pathParams, "scale", 0.1, 5, 0.05).name("scale"),
        () => planes.syncPlaneScale(pathIndex),
      );
      bindParamControl(
        pathFolder
          .add(pathParams, "startOffset", 0, 1, 0.01)
          .name("start offset"),
      );
      bindParamControl(
        pathFolder.add(pathParams, "direction", -1, 1, 2).name("direction"),
      );
      bindParamControl(
        pathFolder
          .add(pathParams, "yawOffset", -Math.PI, Math.PI, 0.01)
          .name("yaw offset"),
      );
      bindParamControl(
        pathFolder.add(pathParams, "loopDelay", 0, 60, 0.5).name("loop delay"),
      );

      const pointsFolder = addClosedFolder(pathFolder, "Curve points");
      pathParams.curvePoints.forEach((point, pointIndex) => {
        const pointFolder = addClosedFolder(
          pointsFolder,
          `Point ${pointIndex + 1}`,
        );
        bindParamControl(pointFolder.add(point, "0", -500, 500, 0.5).name("x"), () => {
          planes.syncPathPoint(pathIndex, pointIndex);
        });
        bindParamControl(pointFolder.add(point, "1", -20, 200, 0.5).name("y"), () => {
          planes.syncPathPoint(pathIndex, pointIndex);
        });
        bindParamControl(pointFolder.add(point, "2", -500, 500, 0.5).name("z"), () => {
          planes.syncPathPoint(pathIndex, pointIndex);
        });
      });
    });

    planesFolder
      .add({ logConfig: () => planes.logConfig() }, "logConfig")
      .name("log config to console");
  }

  if (showDevOnlyPanels && sky?.params) {
    const skyFolder = addClosedFolder(gui, "Sky");

    bindParamControl(
      skyFolder.add(sky.params, "enabled").name("enabled"),
      (value) => sky.setEnabled(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "radius", 10, 200, 1).name("radius"),
      (value) => sky.setRadius(value),
    );
    bindParamControl(
      skyFolder
        .add(sky.params, "verticalOffset", -40, 40, 0.5)
        .name("vertical offset"),
      (value) => sky.setVerticalOffset(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "speed", 0, 4, 0.05).name("speed"),
      (value) => sky.setSpeed(value),
    );
    bindParamControl(
      skyFolder
        .add(sky.params, "cloudDensity", 0, 2, 0.01)
        .name("cloud density"),
      (value) => sky.setCloudDensity(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "noiseScale", 1, 40, 0.5).name("noise scale"),
      (value) => sky.setNoiseScale(value),
    );
    bindParamControl(
      skyFolder
        .add(sky.params, "distortionStrength", 0, 4, 0.05)
        .name("distortion"),
      (value) => sky.setDistortionStrength(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "detailAmount", 0, 2, 0.05).name("detail"),
      (value) => sky.setDetailAmount(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "smoothness", 0, 2, 0.05).name("smoothness"),
      (value) => sky.setSmoothness(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "contrast", 0.2, 2, 0.05).name("contrast"),
      (value) => sky.setContrast(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "opacity", 0, 1, 0.01).name("opacity"),
      (value) => sky.setOpacity(value),
    );
    bindParamControl(
      skyFolder
        .add(sky.params, "densityStrength", 0, 1, 0.01)
        .name("density darken"),
      (value) => sky.setDensityStrength(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "windX", -2, 2, 0.05).name("wind X"),
      (value) => sky.setWindX(value),
    );
    bindParamControl(
      skyFolder.add(sky.params, "windY", -2, 2, 0.05).name("wind Y"),
      (value) => sky.setWindY(value),
    );
    bindParamControl(
      skyFolder.addColor(sky.params, "skyTop").name("sky top"),
      (value) => sky.setSkyTop(value),
    );
    bindParamControl(
      skyFolder.addColor(sky.params, "skyBottom").name("sky bottom"),
      (value) => sky.setSkyBottom(value),
    );
    bindParamControl(
      skyFolder.addColor(sky.params, "cloudDarkColor").name("cloud dark"),
      (value) => sky.setCloudDarkColor(value),
    );
    bindParamControl(
      skyFolder.addColor(sky.params, "cloudLightColor").name("cloud light"),
      (value) => sky.setCloudLightColor(value),
    );

    skyFolder
      .add({ logConfig: () => sky.logConfig() }, "logConfig")
      .name("log config to console");
  }

  if (showDevOnlyPanels && cameraControls?.params) {
    const cameraFolder = addClosedFolder(gui, "Camera");

    if (cameraControls.cameraModeState && cameraControls.setCameraMode) {
      bindParamControl(
        cameraFolder
          .add(cameraControls.cameraModeState, "orbitEnabled")
          .name("orbit camera"),
        (enabled) => {
          cameraControls.setCameraMode(enabled ? "orbit" : "walk");
        },
      );
    }

    bindParamControl(
      cameraFolder
        .add(cameraControls.params, "fovDesktop", 30, 120, 1)
        .name("fov desktop"),
      cameraControls.syncFov,
    );
    bindParamControl(
      cameraFolder
        .add(cameraControls.params, "fovMobile", 30, 120, 1)
        .name("fov mobile"),
      cameraControls.syncFov,
    );
    bindParamControl(
      cameraFolder
        .add(cameraControls.params, "walkEyeHeight", 0.5, 5, 0.05)
        .name("walk eye height"),
      cameraControls.syncWalkEyeHeight,
    );

    if (cameraControls.walkSettings) {
      const walkFolder = addClosedFolder(cameraFolder, "Walk");
      addParam(
        walkFolder,
        cameraControls.walkSettings,
        "acceleration",
        1,
        30,
        0.5,
      ).name("acceleration");
      addParam(
        walkFolder,
        cameraControls.walkSettings,
        "deceleration",
        1,
        30,
        0.5,
      ).name("deceleration");
      addParam(
        walkFolder,
        cameraControls.walkSettings,
        "walkFovBoost",
        0,
        15,
        0.5,
      ).name("walk fov boost");
      addParam(
        walkFolder,
        cameraControls.walkSettings,
        "sprintFovBoost",
        0,
        25,
        0.5,
      ).name("sprint fov boost");
      addParam(
        walkFolder,
        cameraControls.walkSettings,
        "walkFovBlendSpeed",
        0.5,
        15,
        0.5,
      ).name("walk fov blend");
      addParam(
        walkFolder,
        cameraControls.walkSettings,
        "sprintFovBlendSpeed",
        0.5,
        15,
        0.5,
      ).name("sprint fov blend");
    }
  }

  function updateOutput(value = params.output) {
    if (value === 1) {
      post.outputNode = scenePassColor;
    } else if (value === 2) {
      post.outputNode = scenePassEmissive;
    } else if (value === 3) {
      post.outputNode = vec4(bloomPass.rgb, 1);
    } else if (value === 4 && pipeline.composedOutput) {
      post.outputNode = pipeline.composedOutput;
    } else if (value === 5 && lensflare?.pass) {
      post.outputNode = vec4(lensflare.pass.rgb, 1);
    } else if (value === 6 && aoPass) {
      post.outputNode = vec4(vec3(aoPass.getTextureNode().r), 1);
    } else {
      restoreCombinedOutput?.();
      return;
    }

    post.needsUpdate = true;
  }

  return { updateOutput };
}
