import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  abs,
  clamp,
  float,
  min,
  mix,
  modelViewProjection,
  smoothstep,
  sub,
  texture,
  uniform,
  uv,
  varyingProperty,
  vec2, vec4
} from "three/tsl";

export function createCloudsMaterial({ noiseTex, perlinTex }) {
  const material = new NodeMaterial();

  const uTime = uniform(0);
  const uSpeed = uniform(1.45);
  const uCloudDensity = uniform(1.3);
  const uNoiseScale = uniform(15.5);
  const uDistortionStrength = uniform(1.8);
  const uDetailAmount = uniform(1);
  const uSmoothness = uniform(1);
  const uContrast = uniform(0.9);
  const uOpacity = uniform(0.95);
  const uInstanceSeed = uniform(0.5);
  const uWindDirection = uniform(new THREE.Vector2(0.5, 0.25));
  const uCloudDarkColor = uniform(new THREE.Color("#b1b6d7"));
  const uCloudLightColor = uniform(new THREE.Color("#f8f2fb"));
  const uDarkMultiplier = uniform(new THREE.Vector3(0.86, 0.9, 0.95));
  const uLightMultiplier = uniform(new THREE.Vector3(1.55, 1.4, 1.16));
  const uDensityDarkening = uniform(new THREE.Vector3(0.5, 0.6, 0.7));
  const uDensityStrength = uniform(0.0001);
  const uSkyTop = uniform(new THREE.Color(0x6fc3ff));
  const uSkyBottom = uniform(new THREE.Color(0xb5e6ff));

  const tNoise = texture(noiseTex);
  const tPerlin = texture(perlinTex);

  const vUv = varyingProperty("vec2", "vCloudUv");

  const vertexNode = Fn(() => {
    vUv.assign(uv());
    const position = modelViewProjection;
    position.z.assign(position.w);
    return position;
  })();

  const colorNode = Fn(() => {
    const dUv = vUv.toVar("dUv");
    const time = uTime.mul(0.5).mul(uSpeed);

    const windMovement1 = uWindDirection.mul(vec2(-0.04, -0.025)).mul(time);
    const windMovement2 = uWindDirection.mul(vec2(0.005, 0.01)).mul(time);
    const windMovement3 = uWindDirection.mul(-0.036).mul(time);

    const noiseUv1 = vUv
      .mul(0.2)
      .mul(uNoiseScale)
      .add(windMovement1)
      .add(uInstanceSeed.mul(0.1));
    const noiseUv2 = vUv
      .mul(0.08)
      .mul(uNoiseScale)
      .add(windMovement2)
      .add(uInstanceSeed.mul(0.05));
    const perlinUv = vUv
      .mul(0.5)
      .mul(uNoiseScale)
      .add(windMovement3)
      .add(uInstanceSeed.mul(0.02));

    dUv.y.addAssign(
      uDistortionStrength.mul(0.3).mul(sub(texture(tNoise, noiseUv1).r, 0.5)),
    );
    dUv.y.subAssign(
      uDistortionStrength.mul(0.5).mul(sub(texture(tNoise, noiseUv2).r, 0.5)),
    );
    dUv.y.mulAssign(
      float(1).add(
        uDistortionStrength
          .mul(0.1)
          .mul(sub(texture(tPerlin, perlinUv).r, 0.5)),
      ),
    );

    const smoothnessWindMovement = uWindDirection
      .mul(vec2(-0.08, -0.04))
      .mul(time);
    const smoothness = smoothstep(
      0.4,
      0.7,
      texture(tNoise, vUv.mul(0.08).mul(uNoiseScale).add(smoothnessWindMovement))
        .r,
    ).mul(uSmoothness);

    let clouds = smoothstep(float(0.9).sub(smoothness.mul(0.1)), 0.7, dUv.y)
      .mul(uCloudDensity)
      .toVar("clouds");
    clouds.mulAssign(
      smoothstep(0, 0.2, dUv.y.sub(float(0.2).mul(smoothstep(0.4, 1, vUv.x)))),
    );

    const sparseWindMovement = uWindDirection
      .mul(vec2(0, -0.3).mul(time).mul(0.1));
    const sparseUv = vUv
      .mul(0.7)
      .mul(uNoiseScale)
      .add(sparseWindMovement)
      .add(uInstanceSeed.mul(0.03));
    sparseUv.addAssign(texture(tNoise, vUv.mul(0.5).mul(uNoiseScale)).rg.mul(0.04));

    const sparse = texture(tNoise, sparseUv)
      .r.mul(texture(tNoise, vUv.mul(1.2).mul(uNoiseScale)).r);
    const sparseLayer = float(0.4)
      .mul(smoothstep(0.45, 0.75, sparse))
      .mul(uCloudDensity);

    const fluffWindMovement = uWindDirection.mul(vec2(time.mul(0.3)));
    const fluff = texture(
      tNoise,
      vec2(1.2, 0.6)
        .mul(vUv)
        .mul(uNoiseScale)
        .add(texture(tPerlin, vUv).rg.mul(0.02))
        .add(texture(tNoise, vUv.mul(0.8).mul(uNoiseScale)).rg.mul(0.04))
        .add(fluffWindMovement)
        .add(uInstanceSeed.mul(0.08)),
    ).r;
    const detailLayer = float(0.3)
      .mul(smoothstep(0.4, 0.7, fluff))
      .mul(uDetailAmount);

    clouds.addAssign(sparseLayer);
    clouds.addAssign(detailLayer);
    clouds.assign(smoothstep(0.2, 0.9, clouds.mul(uContrast)));
    clouds.assign(min(clouds, 1));

    let alpha = clouds
      .mul(smoothstep(1, 0.95, vUv.y))
      .mul(smoothstep(0, 0.05, vUv.y))
      .mul(smoothstep(0, 0.05, vUv.x))
      .mul(smoothstep(1, 0.95, vUv.x))
      .toVar("alpha");
    alpha.mulAssign(smoothstep(0, 0.15, abs(vUv.y.sub(0.5))));
    alpha.mulAssign(smoothstep(0, 0.1, abs(vUv.y.sub(0.5))));
    alpha.assign(min(alpha, 1).mul(uOpacity));

    const cloudDarkness = smoothstep(0.35, 1, dUv.y).add(
      smoothstep(0.35, 0, dUv.y),
    );
    const densityVariation = clouds.mul(0.7).add(0.25);

    const darkColor = uCloudDarkColor.mul(uDarkMultiplier);
    const lightColor = uCloudLightColor.mul(uLightMultiplier);
    let color = mix(darkColor, lightColor, densityVariation.mul(cloudDarkness));
    color.assign(
      mix(color, color.mul(uDensityDarkening), clouds.mul(uDensityStrength)),
    );

    const skyColor = mix(uSkyBottom, uSkyTop, clamp(vUv.y, 0, 1));
    color.assign(mix(color, skyColor, smoothstep(0.99, 0, alpha)));

    const finalColor = mix(skyColor, color, alpha);

    return vec4(finalColor, 1);
  })();

  material.vertexNode = vertexNode;
  material.colorNode = colorNode;
  material.transparent = false;
  material.depthWrite = false;
  material.depthTest = true;

  return {
    material,
    uniforms: {
      uTime,
      uSpeed,
      uCloudDensity,
      uNoiseScale,
      uDistortionStrength,
      uDetailAmount,
      uSmoothness,
      uContrast,
      uOpacity,
      uInstanceSeed,
      uWindDirection,
      uCloudDarkColor,
      uCloudLightColor,
      uDarkMultiplier,
      uLightMultiplier,
      uDensityDarkening,
      uDensityStrength,
      uSkyTop,
      uSkyBottom,
    },
  };
}
