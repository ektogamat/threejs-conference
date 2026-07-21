import * as THREE from "three/webgpu";
import {
    uniform,
    vec2,
    vec3,
    vec4,
    float,
    mix,
    Fn,
    screenUV,
    saturation,
    luminance,
    smoothstep,
    length,
    step,
    max
} from "three/tsl";
import { chromaticAberration } from "three/addons/tsl/display/ChromaticAberrationNode.js";
import { film } from "three/addons/tsl/display/FilmNode.js";

export const DEFAULT_LOOK_PRESET = "neonNoir";

export const LOOK_PRESET_LABELS = {
  Neutral: "neutral",
  "Neon Noir": "neonNoir",
  "Magenta Rain": "magentaRain",
  "Teal Dusk": "tealDusk",
};

const applyContrast = Fn(([color, amount]) => {
  const luma = luminance(color);
  return mix(vec3(luma), color, amount).max(0.0);
});

const suppressGreen = Fn(([color, amount]) => {
  const luma = luminance(color);
  return vec3(color.r, mix(color.g, luma, amount), color.b).max(0.0);
});

function srgbToLinearVec3([r, g, b]) {
  const color = new THREE.Color(r, g, b);
  color.convertSRGBToLinear();
  return new THREE.Vector3(color.r, color.g, color.b);
}

export const DEFAULT_FOG = {
  enabled: 0.42,
  near: -20,
  far: 44,
  amount: 1,
  colorSrgb: [0.34, 0.37, 0.47],
};

function fogUniforms(colorSrgb = DEFAULT_FOG.colorSrgb, overrides = {}) {
  return {
    fogEnabled: overrides.fogEnabled ?? DEFAULT_FOG.enabled,
    fogNear: overrides.fogNear ?? DEFAULT_FOG.near,
    fogFar: overrides.fogFar ?? DEFAULT_FOG.far,
    fogColorSrgb: colorSrgb,
    fogAmount: overrides.fogAmount ?? DEFAULT_FOG.amount,
  };
}

function presetUniforms({
  fogEnabled,
  fogNear,
  fogFar,
  fogColorSrgb,
  fogAmount,
  gradeTint,
  gradeOffset,
  saturationAmount,
  contrast,
  greenSuppress,
  gradeMix,
  chromaticStrength,
  vignetteIntensity,
  vignetteSmoothness,
  grainIntensity,
}) {
  return {
    fogEnabled,
    fogNear,
    fogFar,
    fogColorSrgb,
    fogAmount,
    gradeTint,
    gradeOffset,
    saturation: saturationAmount,
    contrast,
    greenSuppress,
    gradeMix,
    chromaticStrength,
    vignetteIntensity,
    vignetteSmoothness,
    grainIntensity,
  };
}

export const LOOK_PRESETS = {
  neutral: {
    label: "Neutral",
    bloom: { strength: 3, radius: 0.5 },
    bloomWide: { strength: 1.25, radius: 1 },
    lensflare: {
      strength: 0,
      threshold: 0.6,
      ghostSpacing: 0.25,
      ghostAttenuation: 25,
    },
    uniforms: presetUniforms({
      ...fogUniforms([0.36, 0.38, 0.42]),
      gradeTint: [1, 1, 1],
      gradeOffset: [0, 0, 0],
      saturationAmount: 1,
      contrast: 1,
      greenSuppress: 1,
      gradeMix: 0,
      chromaticStrength: 0,
      vignetteIntensity: 0,
      vignetteSmoothness: 0.65,
      grainIntensity: 0,
    }),
  },
  neonNoir: {
    label: "Neon Noir",
    bloom: { strength: 1.5, radius: 0.16 },
    bloomWide: { strength: 2.2, radius: 0.85 },
    lensflare: {
      strength: 0.71,
      threshold: 0.09,
      ghostSpacing: 0.27,
      ghostAttenuation: 50,
    },
    uniforms: presetUniforms({
      ...fogUniforms(DEFAULT_FOG.colorSrgb),
      gradeTint: [1.02, 0.9, 1.06],
      gradeOffset: [0.004, -0.006, 0.008],
      saturationAmount: 1.06,
      contrast: 1.1,
      greenSuppress: 0.72,
      gradeMix: 0.7,
      chromaticStrength: 0.3,
      vignetteIntensity: 0.72,
      vignetteSmoothness: 0.64,
      grainIntensity: 0.2,
    }),
  },
  magentaRain: {
    label: "Magenta Rain",
    bloom: { strength: 5, radius: 0.72 },
    bloomWide: { strength: 2.6, radius: 1 },
    lensflare: {
      strength: 1.1,
      threshold: 0.45,
      ghostSpacing: 0.2,
      ghostAttenuation: 22,
    },
    uniforms: presetUniforms({
      ...fogUniforms([0.4, 0.34, 0.44]),
      gradeTint: [1.08, 0.9, 1.08],
      gradeOffset: [0.012, -0.015, 0.01],
      saturationAmount: 1.28,
      contrast: 1.12,
      greenSuppress: 0.68,
      gradeMix: 0.9,
      chromaticStrength: 0.55,
      vignetteIntensity: 0.5,
      vignetteSmoothness: 0.55,
      grainIntensity: 0.3,
    }),
  },
  tealDusk: {
    label: "Teal Dusk",
    bloom: { strength: 3.6, radius: 0.58 },
    bloomWide: { strength: 1.85, radius: 0.78 },
    lensflare: {
      strength: 0.55,
      threshold: 0.6,
      ghostSpacing: 0.24,
      ghostAttenuation: 30,
    },
    uniforms: presetUniforms({
      ...fogUniforms([0.32, 0.38, 0.46]),
      gradeTint: [0.94, 0.98, 1.06],
      gradeOffset: [-0.008, 0, 0.01],
      saturationAmount: 1.06,
      contrast: 1.06,
      greenSuppress: 0.8,
      gradeMix: 0.72,
      chromaticStrength: 0.28,
      vignetteIntensity: 0.3,
      vignetteSmoothness: 0.68,
      grainIntensity: 0.14,
    }),
  },
};

function toVec3([x, y, z]) {
  return new THREE.Vector3(x, y, z);
}

export function createCyberpunkLook({ scenePass }) {
  const viewDistance = scenePass.getViewZNode().negate();
  const linearDepth = scenePass.getLinearDepthNode();

  const uniforms = {
    fogEnabled: uniform(DEFAULT_FOG.enabled),
    fogNear: uniform(DEFAULT_FOG.near),
    fogFar: uniform(DEFAULT_FOG.far),
    fogColor: uniform(srgbToLinearVec3(DEFAULT_FOG.colorSrgb)),
    fogAmount: uniform(DEFAULT_FOG.amount),
    fogBloomSuppress: uniform(0.75),
    gradeTint: uniform(new THREE.Vector3(1.02, 0.9, 1.06)),
    gradeOffset: uniform(new THREE.Vector3(0.004, -0.006, 0.008)),
    saturation: uniform(1.06),
    contrast: uniform(1.1),
    greenSuppress: uniform(0.72),
    gradeMix: uniform(0.7),
    chromaticStrength: uniform(0.35),
    vignetteIntensity: uniform(0.72),
    vignetteSmoothness: uniform(0.64),
    grainIntensity: uniform(0.22),
  };

  let currentPresetId = DEFAULT_LOOK_PRESET;

  function applyUniformValues(values) {
    uniforms.fogEnabled.value = values.fogEnabled;
    uniforms.fogNear.value = values.fogNear;
    uniforms.fogFar.value = values.fogFar;
    uniforms.fogColor.value.copy(srgbToLinearVec3(values.fogColorSrgb));
    uniforms.fogAmount.value = values.fogAmount;
    uniforms.gradeTint.value.copy(toVec3(values.gradeTint));
    uniforms.gradeOffset.value.copy(toVec3(values.gradeOffset));
    uniforms.saturation.value = values.saturation;
    uniforms.contrast.value = values.contrast;
    uniforms.greenSuppress.value = values.greenSuppress;
    uniforms.gradeMix.value = values.gradeMix;
    uniforms.chromaticStrength.value = values.chromaticStrength;
    uniforms.vignetteIntensity.value = values.vignetteIntensity;
    uniforms.vignetteSmoothness.value = values.vignetteSmoothness;
    uniforms.grainIntensity.value = values.grainIntensity;
  }

  function applyBloomSettings(preset, bloomPass, bloomPassWide) {
    if (bloomPass) {
      bloomPass.strength.value = preset.bloom.strength;
      bloomPass.radius.value = preset.bloom.radius;
    }

    if (bloomPassWide) {
      bloomPassWide.strength.value = preset.bloomWide.strength;
      bloomPassWide.radius.value = preset.bloomWide.radius;
    }
  }

  function applyLensflareSettings(preset, lensflare) {
    if (!lensflare || !preset.lensflare) {
      return;
    }

    const { strength, threshold, ghostSpacing, ghostAttenuation } =
      preset.lensflare;

    if (lensflare.strength) {
      lensflare.strength.value = strength;
    }
    if (lensflare.threshold) {
      lensflare.threshold.value = threshold;
    }
    if (lensflare.ghostSpacing) {
      lensflare.ghostSpacing.value = ghostSpacing;
    }
    if (lensflare.ghostAttenuation) {
      lensflare.ghostAttenuation.value = ghostAttenuation;
    }
  }

  function applyPreset(id, { bloomPass, bloomPassWide, lensflare } = {}) {
    const preset = LOOK_PRESETS[id];
    if (!preset) {
      return false;
    }

    currentPresetId = id;
    applyUniformValues(preset.uniforms);
    applyBloomSettings(preset, bloomPass, bloomPassWide);
    applyLensflareSettings(preset, lensflare);

    return true;
  }

  function buildComposite(beauty, { bloomContribution = null } = {}) {
    // Geometry: world-space distance. Sky/background: linear depth near 1.0
    // (scene.background does not give reliable viewZ in the scene pass).
    const distanceFog = smoothstep(
      uniforms.fogNear,
      uniforms.fogFar,
      viewDistance,
    );
    const skyFog = smoothstep(float(0.68), float(1.0), linearDepth);
    const fogBlend = max(distanceFog, skyFog).mul(uniforms.fogEnabled);
    const fogFactor = fogBlend.mul(uniforms.fogAmount);

    let hazed = vec4(
      mix(beauty.rgb, uniforms.fogColor, fogFactor),
      beauty.a,
    );

    if (bloomContribution) {
      const bloomAttenuation = float(1).sub(
        fogBlend.mul(uniforms.fogBloomSuppress),
      );
      hazed = hazed.add(bloomContribution.mul(bloomAttenuation));
    }

    const tinted = hazed.rgb.mul(uniforms.gradeTint).add(uniforms.gradeOffset);
    let gradedRgb = suppressGreen(tinted, uniforms.greenSuppress);
    gradedRgb = saturation(gradedRgb, uniforms.saturation);
    gradedRgb = applyContrast(gradedRgb, uniforms.contrast);
    const graded = vec4(
      mix(hazed.rgb, gradedRgb, uniforms.gradeMix),
      hazed.a,
    );

    const chroma = chromaticAberration(
      graded,
      uniforms.chromaticStrength,
      vec2(0.5, 0.5),
      1.1,
    );
    const withChroma = mix(
      graded,
      chroma,
      step(float(0.001), uniforms.chromaticStrength),
    );

    const vigDist = length(screenUV.sub(vec2(0.5, 0.5))).mul(1.6);
    const vigFactor = float(1).sub(
      smoothstep(
        uniforms.vignetteSmoothness,
        float(1),
        vigDist,
      ).mul(uniforms.vignetteIntensity),
    );
    const vignetted = vec4(withChroma.rgb.mul(vigFactor), withChroma.a);

    return film(vignetted, uniforms.grainIntensity);
  }

  applyPreset(DEFAULT_LOOK_PRESET);

  return {
    uniforms,
    buildComposite,
    applyPreset,
    getCurrentPresetId: () => currentPresetId,
    getPresetLabels: () => LOOK_PRESET_LABELS,
    getPresets: () => LOOK_PRESETS,
    linearFogColorToSrgb: (target = new THREE.Color()) => {
      target.setRGB(
        uniforms.fogColor.value.x,
        uniforms.fogColor.value.y,
        uniforms.fogColor.value.z,
      );
      return target.convertLinearToSRGB();
    },
    setFogColorFromSrgb: (r, g, b) => {
      uniforms.fogColor.value.copy(srgbToLinearVec3([r, g, b]));
    },
  };
}
