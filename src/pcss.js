import {
  Fn,
  float,
  int,
  vec2,
  ivec2,
  If,
  uniform,
  textureLoad,
  screenCoordinate,
  reference,
  renderGroup,
  fract,
  sin,
  cos,
  dot,
  pow,
  vogelDiskSample,
  interleavedGradientNoise,
} from "three/tsl";

const NUM_SAMPLES = 16;
const NUM_RINGS = 11;
const PI2 = 6.28318530718;

// Poisson spiral sample used in the classic variant.
const rand = Fn(([co]) =>
  fract(sin(dot(co, vec2(12.9898, 78.233))).mul(43758.5453)),
);

const poissonSample = Fn(([index, angleOffset]) => {
  const angleStep = float((PI2 * NUM_RINGS) / NUM_SAMPLES);
  const invSamples = float(1 / NUM_SAMPLES);
  const radius = invSamples.mul(float(index).add(1));
  const angle = float(index).mul(angleStep).add(angleOffset);
  return vec2(cos(angle), sin(angle)).mul(pow(radius, 0.75));
});

/**
 * Create a PCSS shadow filter node (Three.js TSL / WebGPU, JS version).
 *
 * Assign the returned `filter` function to `light.shadow.filterNode`.
 *
 * @param {object}  opts
 * @param {number}  opts.lightSize     - Light source size in world units.
 * @param {number}  opts.nearPlane     - Shadow camera near plane (match light.shadow.camera.near).
 * @param {number}  opts.frustumScale  - Half-width of the shadow frustum at near (world units).
 *                                       For SpotLight: shadow.camera.near * Math.tan(spotLight.angle).
 *                                       For DirectionalLight: shadow.camera.right.
 * @param {number}  opts.samples       - Sample count (default 17).
 * @param {'poisson'|'vogel'} opts.sampling
 */
export function createPCSSFilter(opts = {}) {
  const lightSize = uniform(opts.lightSize ?? 0.5);
  const nearPlane = uniform(opts.nearPlane ?? 0.5);

  // Half-width of the shadow frustum at near plane in world units.
  // Updated from JS after the light / shadow camera is configured.
  const frustumScale = uniform(opts.frustumScale ?? 1.0);

  const samples = opts.samples ?? NUM_SAMPLES;
  const sampling = opts.sampling ?? "vogel";

  const filter = Fn(({ depthTexture, shadowCoord, shadow }, builder) => {
    const reversed = builder.renderer.reversedDepthBuffer;

    const mapSize = reference("mapSize", "vec2", shadow).setGroup(renderGroup);

    // Light size expressed as a fraction of the shadow map UV space.
    const lightSizeUV = lightSize.div(frustumScale.mul(2));

    const uv = shadowCoord.xy;

    const zReceiver = reversed
      ? float(1).sub(shadowCoord.z).toVar("zReceiver")
      : float(shadowCoord.z).toVar("zReceiver");

    // Per-pixel random rotation angle.
    const phi =
      sampling === "poisson"
        ? rand(uv).mul(PI2)
        : interleavedGradientNoise(screenCoordinate.xy).mul(PI2);

    const diskSample = (i) =>
      sampling === "poisson"
        ? poissonSample(int(i), phi)
        : vogelDiskSample(int(i), int(samples), phi);

    const secondRingOffset = (offset) =>
      sampling === "poisson"
        ? vec2(offset.y.negate(), offset.x.negate())
        : vec2(offset.y.negate(), offset.x);

    // Sampler-less texel fetch — bypasses hardware compare, works with BasicShadowMap.
    const sampleDepth = (sampleUV) => {
      const texel = ivec2(sampleUV.mul(mapSize));
      const raw = textureLoad(depthTexture, texel).x;
      return reversed ? float(1).sub(raw) : raw;
    };

    // Stage 1: Blocker search.
    const searchRadius = lightSizeUV
      .mul(zReceiver.sub(nearPlane))
      .div(zReceiver);

    const blockerSum = float(0).toVar("blockerSum");
    const blockerCount = float(0).toVar("blockerCount");

    for (let i = 0; i < samples; i++) {
      const offset = diskSample(i).mul(searchRadius);
      const rawDepth = sampleDepth(uv.add(offset));
      If(rawDepth.lessThan(zReceiver), () => {
        blockerSum.addAssign(rawDepth);
        blockerCount.addAssign(1);
      });
    }

    // No occluders → fully lit, early exit.
    const result = float(1).toVar("pcssResult");

    If(blockerCount.greaterThan(0), () => {
      const avgBlockerDepth = blockerSum.div(blockerCount);

      // Stage 2: Penumbra size from average blocker distance.
      const penumbraRatio = zReceiver.sub(avgBlockerDepth).div(avgBlockerDepth);
      const filterRadius = penumbraRatio
        .mul(lightSizeUV)
        .mul(nearPlane)
        .div(zReceiver);

      // Stage 3: Variable-radius PCF over two rings.
      const litSum = float(0).toVar("litSum");

      for (let i = 0; i < samples; i++) {
        const offset = diskSample(i).mul(filterRadius);
        const depth = sampleDepth(uv.add(offset));
        If(depth.greaterThanEqual(zReceiver), () => {
          litSum.addAssign(1);
        });
      }

      for (let i = 0; i < samples; i++) {
        const offset = diskSample(i).mul(filterRadius);
        const depth = sampleDepth(uv.add(secondRingOffset(offset)));
        If(depth.greaterThanEqual(zReceiver), () => {
          litSum.addAssign(1);
        });
      }

      result.assign(litSum.div(float(samples * 2)));
    });

    return result;
  });

  return { filter, lightSize, nearPlane, frustumScale };
}

/**
 * Compute the shadow frustum half-width at near plane for a DirectionalLight.
 * Use this to initialise / update the `frustumScale` uniform.
 *
 * @param {THREE.DirectionalLight} directionalLight
 */
export function computeDirectionalFrustumScale(directionalLight) {
  return directionalLight.shadow.camera.right;
}

/**
 * Compute the shadow frustum half-width at near plane for a SpotLight.
 * Use this to initialise / update the `frustumScale` uniform.
 *
 * @param {THREE.SpotLight} spotLight
 */
export function computeSpotFrustumScale(spotLight) {
  const near = spotLight.shadow.camera.near;
  // spotLight.angle is the half-cone angle in radians; shadow fov = angle * 2.
  return near * Math.tan(spotLight.angle);
}
