import {
  Fn,
  Loop,
  dot,
  float,
  floor,
  fract,
  int,
  length,
  max,
  normalize,
  sin,
  smoothstep,
  sqrt,
  uniform,
  vec2,
  vec3,
} from "three/tsl";

const MAX_RADIUS = 1;
const HASHSCALE1 = 0.1031;
const HASHSCALE3 = vec3(0.1031, 0.103, 0.0973);
const CELL_COUNT = (MAX_RADIUS * 2 + 1) ** 2;

const hash12 = Fn(([p]) => {
  const p3 = fract(vec3(p.x, p.yx).mul(HASHSCALE1));
  const p3Dot = p3.add(dot(p3, p3.yzx.add(19.19)));
  return fract(p3Dot.x.add(p3Dot.y).mul(p3Dot.z));
});

const hash22 = Fn(([p]) => {
  const p3 = fract(vec3(p.x, p.yx).mul(HASHSCALE3));
  const p3Dot = p3.add(dot(p3, p3.yzx.add(19.19)));
  return fract(p3Dot.xx.add(p3Dot.yz).mul(p3Dot.zy));
});

export function createRainRipples({ uTime, uRippleSpeed = uniform(3) }) {
  const getRipples = Fn(([uvCoord]) => {
    const p0 = floor(uvCoord);
    const time = uTime.mul(uRippleSpeed);
    const circles = vec2(0).toVar();

    Loop(
      { start: int(-MAX_RADIUS), end: int(MAX_RADIUS), name: "i", condition: "<=" },
      ({ i: iNode }) => {
        Loop(
          { start: int(-MAX_RADIUS), end: int(MAX_RADIUS), name: "j", condition: "<=" },
          ({ j: jNode }) => {
            const pi = p0.add(vec2(iNode, jNode));
            const hsh = pi;
            const p = pi.add(hash22(hsh));
            const t = fract(float(0.3).mul(time).add(hash12(hsh)));
            const v = p.sub(uvCoord);
            const d = length(v).sub(float(MAX_RADIUS + 1).mul(t));
            const h = float(0.001);
            const d1 = d.sub(h);
            const d2 = d.add(h);
            const p1 = sin(float(31).mul(d1))
              .mul(smoothstep(float(-0.6), float(-0.3), d1))
              .mul(smoothstep(float(0), float(-0.3), d1));
            const p2 = sin(float(31).mul(d2))
              .mul(smoothstep(float(-0.6), float(-0.3), d2))
              .mul(smoothstep(float(0), float(-0.3), d2));
            const fade = float(1).sub(t).mul(float(1).sub(t));
            const derivative = p2.sub(p1).div(h.mul(2)).mul(fade);
            circles.addAssign(normalize(v).mul(derivative).mul(0.5));
          },
        );
      },
    );

    circles.divAssign(float(CELL_COUNT));
    const z = sqrt(max(float(1).sub(dot(circles, circles)), float(0)));
    return vec3(circles, z);
  });

  return getRipples;
}
