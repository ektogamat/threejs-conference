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

function hexToLinearVec3(hex) {
  const color = new THREE.Color(hex);
  color.convertSRGBToLinear();
  return new THREE.Vector3(color.r, color.g, color.b);
}

function presetUniforms({
  fogEnabled,
  fogNear,
  fogFar,
  fogColor,
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
    fogColor,
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
    sun: { hour: 8.3, strength: 2 },
    bloom: { strength: 3, radius: 0.5 },
    bloomWide: { strength: 1.25, radius: 1 },
    uniforms: presetUniforms({
      fogEnabled: 0,
      fogNear: 0.05,
      fogFar: 0.8,
      fogColor: 0x8aa4b8,
      fogAmount: 0,
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
    sun: { hour: 5.8, strength: 0.6 },
    bloom: { strength: 4.5, radius: 0.65 },
    bloomWide: { strength: 2.2, radius: 0.85 },
    uniforms: presetUniforms({
      fogEnabled: 1,
      fogNear: 0.12,
      fogFar: 0.58,
      fogColor: 0x08040c,
      fogAmount: 0.38,
      gradeTint: [1.02, 0.9, 1.06],
      gradeOffset: [0.004, -0.006, 0.008],
      saturationAmount: 1.06,
      contrast: 1.1,
      greenSuppress: 0.72,
      gradeMix: 0.7,
      chromaticStrength: 0.3,
      vignetteIntensity: 0.4,
      vignetteSmoothness: 0.6,
      grainIntensity: 0.2,
    }),
  },
  magentaRain: {
    label: "Magenta Rain",
    sun: { hour: 5.5, strength: 0.45 },
    bloom: { strength: 5, radius: 0.72 },
    bloomWide: { strength: 2.6, radius: 1 },
    uniforms: presetUniforms({
      fogEnabled: 1,
      fogNear: 0.05,
      fogFar: 0.55,
      fogColor: 0x180818,
      fogAmount: 0.58,
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
    sun: { hour: 16.5, strength: 1.15 },
    bloom: { strength: 3.6, radius: 0.58 },
    bloomWide: { strength: 1.85, radius: 0.78 },
    uniforms: presetUniforms({
      fogEnabled: 1,
      fogNear: 0.1,
      fogFar: 0.62,
      fogColor: 0x081018,
      fogAmount: 0.42,
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

export function createCyberpunkLook({ scenePassLinearDepth }) {
  const uniforms = {
    fogEnabled: uniform(1),
    fogNear: uniform(0.08),
    fogFar: uniform(0.5),
    fogColor: uniform(hexToLinearVec3(0x0c0814)),
    fogAmount: uniform(0.48),
    gradeTint: uniform(new THREE.Vector3(1.02, 0.9, 1.06)),
    gradeOffset: uniform(new THREE.Vector3(0.004, -0.006, 0.008)),
    saturation: uniform(1.06),
    contrast: uniform(1.1),
    greenSuppress: uniform(0.72),
    gradeMix: uniform(0.7),
    chromaticStrength: uniform(0.35),
    vignetteIntensity: uniform(0.42),
    vignetteSmoothness: uniform(0.6),
    grainIntensity: uniform(0.22),
  };

  let currentPresetId = DEFAULT_LOOK_PRESET;

  function applyUniformValues(values) {
    uniforms.fogEnabled.value = values.fogEnabled;
    uniforms.fogNear.value = values.fogNear;
    uniforms.fogFar.value = values.fogFar;
    uniforms.fogColor.value.copy(hexToLinearVec3(values.fogColor));
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

  function applyPreset(
    id,
    { onSunApply, bloomPass, bloomPassWide } = {},
  ) {
    const preset = LOOK_PRESETS[id];
    if (!preset) {
      return false;
    }

    currentPresetId = id;
    applyUniformValues(preset.uniforms);
    applyBloomSettings(preset, bloomPass, bloomPassWide);

    if (onSunApply && preset.sun) {
      onSunApply(preset.sun);
    }

    return true;
  }

  function buildComposite(beauty, { bloomContribution = null } = {}) {
    const fogFactor = smoothstep(
      uniforms.fogNear,
      uniforms.fogFar,
      scenePassLinearDepth,
    )
      .mul(uniforms.fogEnabled)
      .mul(uniforms.fogAmount);

    // Apply haze to beauty only. Bloom is added after so emissive glow can
    // spill over sky pixels without being crushed by far-plane fog depth.
    let hazed = vec4(
      mix(beauty.rgb, uniforms.fogColor, fogFactor),
      beauty.a,
    );

    if (bloomContribution) {
      hazed = hazed.add(bloomContribution);
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
      const color = new THREE.Color(r, g, b);
      color.convertSRGBToLinear();
      uniforms.fogColor.value.set(color.r, color.g, color.b);
    },
  };
}
