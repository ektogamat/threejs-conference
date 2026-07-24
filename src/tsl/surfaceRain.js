import {
  Fn,
  abs,
  dot,
  float,
  floor,
  fract,
  length,
  max,
  pow,
  sin,
  smoothstep,
  sqrt,
  uniform,
  vec2,
  vec3,
} from "three/tsl";

// Shared drop graph (rocksdanister / BigWings MovingDropLayer).
// https://github.com/rocksdanister/rain

const N13 = /*#__PURE__*/ Fn(([p]) => {
  const p3 = fract(vec3(p, p, p).mul(vec3(0.1031, 0.11369, 0.13787)));
  const p3Dot = p3.add(dot(p3, p3.yzx.add(19.19)));
  return fract(
    vec3(
      p3Dot.x.add(p3Dot.y).mul(p3Dot.z),
      p3Dot.x.add(p3Dot.z).mul(p3Dot.y),
      p3Dot.y.add(p3Dot.z).mul(p3Dot.x),
    ),
  );
});

const N = /*#__PURE__*/ Fn(([t]) => fract(sin(t.mul(12345.564)).mul(7658.76)));

const Saw = /*#__PURE__*/ Fn(([b, t]) =>
  smoothstep(float(0), b, t).mul(smoothstep(float(1), b, t)),
);

export const MovingDropLayer = /*#__PURE__*/ Fn(([uvIn, t, size, dropletMix = float(1)]) => {
  const UV = uvIn;
  const uv = uvIn.toVar();

  const movingTime = t.mul(0.15);
  uv.y.addAssign(movingTime.mul(0.75));

  const a = vec2(4, 2);
  const grid = a.mul(2);

  let id = floor(uv.mul(grid));
  uv.y.addAssign(N(id.x));

  id = floor(uv.mul(grid));
  const n = N13(id.x.mul(35.2).add(id.y.mul(2376.1)));
  const st = fract(uv.mul(grid)).sub(vec2(0.5, 0));

  let x = n.x.sub(0.5);
  const yWiggle = UV.y.mul(10);
  const wiggle = sin(yWiggle.add(sin(yWiggle)));
  x = x.add(wiggle.mul(float(0.5).sub(abs(x))).mul(n.z.sub(0.5)));
  x = x.mul(0.7);

  const ti = fract(movingTime.add(n.z));
  const yDrop = Saw(float(0.85), ti).sub(0.5).mul(0.9).add(0.5);
  const p = vec2(x, yDrop);

  const d = length(st.sub(p).mul(a.yx));
  const mainDrop = pow(smoothstep(float(0.9).mul(size), float(0), d), float(2));

  const r = sqrt(smoothstep(float(1), yDrop, st.y));
  const cd = abs(st.x.sub(x));
  const trail = smoothstep(float(0.23).mul(r).mul(size), float(0.15).mul(r).mul(r).mul(size), cd)
    .mul(smoothstep(float(-0.02).mul(size), float(0.02).mul(size), st.y.sub(yDrop)))
    .mul(r)
    .mul(r);

  const trailFront = smoothstep(
    float(-0.02).mul(size),
    float(0.02).mul(size),
    st.y.sub(yDrop),
  );
  const yTrail = UV.y;
  const dropletY = fract(yTrail.mul(10)).add(st.y.sub(0.5));
  const dd = length(st.sub(vec2(x, dropletY)));
  const droplets = smoothstep(float(0.4).mul(size), float(0), dd);

  const m = mainDrop.add(droplets.mul(r).mul(trailFront).mul(dropletMix));
  const edge = float(1).sub(d).mul(0.5);
  const mask = m.add(trail.mul(0.35));

  return vec2(mask, edge);
});

const StaticDrops = /*#__PURE__*/ Fn(([uvIn, t, size]) => {
  const uv = uvIn.mul(40).toVar();
  const id = floor(uv);
  uv.assign(fract(uv).sub(0.5));
  const n = N13(id.x.mul(107.45).add(id.y.mul(3543.654)));
  const p = n.xy.sub(0.5).mul(0.7);
  const d = length(uv.sub(p));
  const fade = Saw(float(0.025), fract(t.add(n.z)));
  return pow(smoothstep(float(0.4).mul(size), float(0), d), float(1.8))
    .mul(fract(n.z.mul(10)))
    .mul(fade);
});

export const Drops = /*#__PURE__*/ Fn(([uv, t, l0, l1, l2, size, dropletMix = float(1)]) => {
  const s = StaticDrops(uv, t, size).mul(l0);
  const m1 = MovingDropLayer(uv, t, size, dropletMix);
  const m2 = MovingDropLayer(uv.mul(1.85), t, size, dropletMix);

  const c = smoothstep(float(0.3), float(1), s.add(m1.x).add(m2.x));
  return vec2(c, max(m1.y.mul(l0), m2.y.mul(l1)));
});

/** Car paint/glass: moving layers only (static drops always zero on car). */
export const CarDrops = /*#__PURE__*/ Fn(([uv, t, l1, l2, size, dropletMix = float(1)]) => {
  const m1 = MovingDropLayer(uv, t, size, dropletMix);
  const m2 = MovingDropLayer(uv.mul(1.85), t, size, dropletMix);
  const c = smoothstep(float(0.3), float(1), m1.x.add(m2.x));
  return vec2(c, max(m1.y.mul(l1), m2.y.mul(l2)));
});

export function getRainLayerWeights(rainAmount) {
  return {
    staticDrops: smoothstep(float(-0.5), float(1), rainAmount).mul(2),
    layer1: smoothstep(float(0.25), float(0.75), rainAmount),
    layer2: smoothstep(float(0), float(0.5), rainAmount),
  };
}

/** Car paint: skip static drops — they blink as specks when the grid loops. */
export function getCarRainLayerWeights(rainAmount) {
  return {
    staticDrops: float(0),
    layer1: smoothstep(float(0.25), float(0.75), rainAmount),
    layer2: smoothstep(float(0), float(0.5), rainAmount),
  };
}

/**
 * Finite-diff normal from drop mask (tangent-space XY contribution).
 */
export function computeDropNormalOffset(
  rainUv,
  t,
  layerWeights,
  size,
  epsilon = 0.005,
  dropletMix = float(1),
) {
  const { staticDrops, layer1, layer2 } = layerWeights;
  const e = vec2(epsilon, 0);

  const c = Drops(rainUv, t, staticDrops, layer1, layer2, size, dropletMix);
  const cx = Drops(rainUv.add(e), t, staticDrops, layer1, layer2, size, dropletMix).x;
  const cy = Drops(rainUv.add(e.yx), t, staticDrops, layer1, layer2, size, dropletMix).x;

  return {
    mask: c.x,
    edge: c.y,
    normalOffset: vec2(cx.sub(c.x), cy.sub(c.x)),
  };
}

/**
 * Finite-diff normal for car rain (skips static drop layer).
 */
export function computeCarDropNormalOffset(
  rainUv,
  t,
  layerWeights,
  size,
  epsilon = 0.005,
  dropletMix = float(1),
) {
  const { layer1, layer2 } = layerWeights;
  const e = vec2(epsilon, 0);

  const c = CarDrops(rainUv, t, layer1, layer2, size, dropletMix);
  const cx = CarDrops(rainUv.add(e), t, layer1, layer2, size, dropletMix).x;
  const cy = CarDrops(rainUv.add(e.yx), t, layer1, layer2, size, dropletMix).x;

  return {
    mask: c.x,
    edge: c.y,
    normalOffset: vec2(cx.sub(c.x), cy.sub(c.x)),
  };
}

export function createSurfaceRainUniforms() {
  return {
    uTime: uniform(0),
    uSpeed: uniform(1),
    uIntensity: uniform(1),
    uScale: uniform(20.5),
    uDropSize: uniform(0.45),
    uNormalStrength: uniform(0.25),
    uWetRoughness: uniform(0.1),
    uGlassNormalStrength: uniform(0.7),
    uGlassWetRoughness: uniform(0.05),
    uGlassWetBrighten: uniform(1.2),
    uDropletMix: uniform(0.15),
  };
}

/**
 * Evaluate rain mask + normal offset for a given rain UV node.
 */
export function evaluateSurfaceRain(rainUv, uniforms) {
  const t = uniforms.uTime.mul(0.2).mul(uniforms.uSpeed);
  const layerWeights = getRainLayerWeights(uniforms.uIntensity);
  return computeDropNormalOffset(
    rainUv,
    t,
    layerWeights,
    uniforms.uDropSize,
    0.005,
  );
}

/**
 * Car paint/glass rain on a mesh UV channel (typically uv1 / TEXCOORD_1).
 */
export function evaluateCarSurfaceRain(rainUv, uniforms) {
  const t = uniforms.uTime.mul(1.2).mul(uniforms.uSpeed);
  const layerWeights = getCarRainLayerWeights(uniforms.uIntensity);
  return computeCarDropNormalOffset(
    rainUv.mul(uniforms.uScale),
    t,
    layerWeights,
    uniforms.uDropSize,
    0.005,
    uniforms.uDropletMix,
  );
}
