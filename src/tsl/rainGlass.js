import {
  Fn,
  abs,
  convertToTexture,
  dot,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  pow,
  renderGroup,
  screenCoordinate,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  sqrt,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";

// Port of rocksdanister/rain DropLayer (via MovingDropLayer),
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

/**
 * Sliding drop + vertical trail (rocksdanister MovingDropLayer).
 * `uv` is aspect-corrected, Y-up. `size` scales drop/trail thickness.
 */
const MovingDropLayer = /*#__PURE__*/ Fn(([uvIn, t, size]) => {
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
  const trail2 = smoothstep(float(0.2).mul(r).mul(size), float(0), cd);

  const yTrail = UV.y;
  const dropletY = fract(yTrail.mul(10)).add(st.y.sub(0.5));
  const dd = length(st.sub(vec2(x, dropletY)));
  const droplets = smoothstep(float(0.4).mul(size), float(0), dd);

  const m = mainDrop.add(droplets.mul(r).mul(trailFront));
  const edge = float(1).sub(d).mul(0.5);

  // Keep trail in the graph so it contributes to finite-difference normals.
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

const Drops = /*#__PURE__*/ Fn(([uv, t, l0, l1, l2, size]) => {
  const s = StaticDrops(uv, t, size).mul(l0);
  const m1 = MovingDropLayer(uv, t, size);
  const m2 = MovingDropLayer(uv.mul(1.85), t, size);

  const c = smoothstep(float(0.3), float(1), s.add(m1.x).add(m2.x));
  return vec2(c, max(m1.y.mul(l0), m2.y.mul(l1)));
});

export function createRainGlassUniforms() {
  return {
    speed: uniform(1).setGroup(renderGroup),
    intensity: uniform(0.85).setGroup(renderGroup),
    distortionStrength: uniform(0.28).setGroup(renderGroup),
    dropSize: uniform(1).setGroup(renderGroup),
    blurRadius: uniform(3.5).setGroup(renderGroup),
    amount: uniform(0).setGroup(renderGroup),
  };
}

/**
 * Rain-on-glass pass (rocksdanister MovingDropLayer + light gaussian blur).
 */
export function applyRainGlass(sceneColorNode, uniforms) {
  const blurredScene = gaussianBlur(sceneColorNode, uniforms.blurRadius, 2, {
    resolutionScale: 0.6,
  });
  const tex = convertToTexture(blurredScene);

  return Fn(() => {
    const UV = screenUV;
    // Aspect-correct, Y-up (Shadertoy / rocksdanister). WebGPU frag Y is down.
    const aspectUv = vec2(
      screenCoordinate.x.sub(screenSize.x.mul(0.5)).div(screenSize.y),
      screenSize.y.mul(0.5).sub(screenCoordinate.y).div(screenSize.y),
    );

    const t = time.mul(0.2).mul(uniforms.speed);
    const rainAmount = uniforms.intensity;
    const size = uniforms.dropSize;

    const staticDrops = smoothstep(float(-0.5), float(1), rainAmount).mul(2);
    const layer1 = smoothstep(float(0.25), float(0.75), rainAmount);
    const layer2 = smoothstep(float(0), float(0.5), rainAmount);

    const c = Drops(aspectUv, t, staticDrops, layer1, layer2, size);

    const e = vec2(0.005, 0);
    const cx = Drops(aspectUv.add(e), t, staticDrops, layer1, layer2, size).x;
    const cy = Drops(aspectUv.add(e.yx), t, staticDrops, layer1, layer2, size).x;
    // Flip Y normal into screenUV space (Y-down).
    const n = vec2(cx.sub(c.x), c.x.sub(cy)).mul(3.5);

    const distortedUV = UV.add(
      n.mul(uniforms.distortionStrength).mul(size).mul(float(1).add(c.x.mul(0.5))),
    );

    let col = tex.sample(distortedUV).rgb;

    const refraction = c.x.mul(0.1);
    col = vec3(
      col.r.add(n.x.mul(refraction).mul(uniforms.distortionStrength).mul(size)),
      col.g.add(n.y.mul(refraction).mul(uniforms.distortionStrength).mul(size)),
      col.b,
    );

    const brightness = float(1).add(c.x.mul(0.2));
    col = col.mul(mix(vec3(1), vec3(brightness), c.x));

    const highlight = pow(c.y, float(2)).mul(0.25);
    col = col.add(vec3(highlight).mul(float(1).sub(c.x)));

    col = col.mul(mix(vec3(1), vec3(0.85, 0.92, 1.12), float(0.45)));

    const vignetteUv = UV.sub(0.5);
    col = col.mul(float(1).sub(dot(vignetteUv, vignetteUv).mul(0.75)));

    // Blend toward distorted drops (keep soft glass elsewhere).
    const clear = tex.sample(UV).rgb;
    col = mix(clear, col, c.x.mul(0.85));

    return vec4(col.mul(0.85), float(0.75));
  })();
}
