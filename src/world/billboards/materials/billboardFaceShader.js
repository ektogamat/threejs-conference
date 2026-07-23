import {
  Fn,
  float,
  length,
  mix,
  smoothstep,
  texture,
  uniform,
  uv,
  vec4,
} from "three/tsl";

export function createBillboardVignetteUniforms({
  vignetteInner = 0.05,
  vignetteOuter = 0.9,
  vignetteMin = 0.01,
} = {}) {
  return {
    vignetteInner: uniform(vignetteInner),
    vignetteOuter: uniform(vignetteOuter),
    vignetteMin: uniform(vignetteMin),
  };
}

export function createBillboardFaceOutput(videoTexture, vignetteUniforms) {
  const videoSample = texture(videoTexture);
  const { vignetteInner, vignetteOuter, vignetteMin } = vignetteUniforms;

  const output = Fn(() => {
    const vUv = uv();
    const centered = vUv.sub(0.5);
    const edgeDist = length(centered).mul(2);
    const vignette = float(1).sub(
      smoothstep(vignetteInner, vignetteOuter, edgeDist),
    );
    const edgeFalloff = mix(vignetteMin, float(1), vignette);

    const rgb = videoSample.rgb.mul(edgeFalloff);

    return vec4(rgb, videoSample.a);
  })();

  return { output };
}
