import * as THREE from "three/webgpu";
import {
  color,
  mix,
  range,
  rotateUV,
  texture,
  time,
  uniform,
  uv,
} from "three/tsl";
import { performanceProfile } from "../../platform/performanceProfile.js";

const SMOKE_TEXTURE_PATH = "/textures/smoke.png";

/** Dedicated render layer so GTAO / beauty depth ignore transparent sprites. */
export const SMOKE_LAYER = 3;

function setSmokeLayer(object) {
  object.layers.disable(0);
  object.layers.enable(SMOKE_LAYER);
}

function loadTexture(path) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(path, resolve, undefined, reject);
  });
}

function setSmokeBounds(sprite, offsetMin, offsetMax, worldScale) {
  const reach = Math.max(
    offsetMin.length(),
    offsetMax.length(),
    worldScale,
  );
  sprite.geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, reach * 0.5, 0),
    reach,
  );
  sprite.frustumCulled = true;
}

function createSmokeEmitter({
  map,
  count,
  speed,
  offsetMin,
  offsetMax,
  scaleMin,
  scaleMax,
  opacity,
  colorStart,
  colorEnd,
  worldScale,
}) {
  const lifeRange = range(0.1, 1);
  const offsetRange = range(offsetMin, offsetMax);
  const scaleRange = range(scaleMin, scaleMax);
  const rotateRange = range(0.1, 4);

  const speedUniform = uniform(speed);
  const opacityUniform = uniform(opacity);
  const scaledTime = time.add(5).mul(speedUniform);
  const lifeTime = scaledTime.mul(lifeRange).mod(1);
  const life = lifeTime.div(lifeRange);

  const textureNode = texture(map, rotateUV(uv(), scaledTime.mul(rotateRange)));
  const smokeAlpha = textureNode.a.mul(textureNode.r.max(textureNode.g).max(textureNode.b));
  const opacityNode = smokeAlpha.mul(life.oneMinus()).mul(opacityUniform);

  const material = new THREE.SpriteNodeMaterial();
  material.colorNode = mix(color(colorStart), color(colorEnd), life.mul(0.85));
  material.opacityNode = opacityNode;
  material.positionNode = offsetRange.mul(lifeTime);
  material.scaleNode = scaleRange.mul(lifeTime.max(0.25));
  material.depthWrite = false;
  material.depthTest = false;
  material.transparent = true;
  material.toneMapped = false;

  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(worldScale);
  sprite.count = count;
  setSmokeBounds(sprite, offsetMin, offsetMax, worldScale);
  setSmokeLayer(sprite);
  sprite.renderOrder = 5;

  return { mesh: sprite, material, speedUniform, opacityUniform };
}

/**
 * GPU smoke via TSL instanced sprites — exhaust on the car + ambient street puffs.
 * Particle counts stay low (~250–350 total) to avoid competing with rain/post.
 */
export async function createSmoke({ scene, car }) {
  if (!performanceProfile.smokeEnabled) {
    return { params: null, dispose() {} };
  }

  const map = await loadTexture(SMOKE_TEXTURE_PATH);
  map.colorSpace = THREE.SRGBColorSpace;

  const emitters = [];
  const exhaustParticleCount = performanceProfile.exhaustCount;
  const ambientParticleCount = performanceProfile.ambientCount;

  const params = {
    exhaustOpacity: 0.4,
    exhaustScale: 4,
    exhaustSpeed: 0.5,
    exhaust: [
      { x: 0.47, y: 0.52, z: -2.45 },
      { x: -0.51, y: 0.55, z: -2.42 },
    ],
    ambientOpacity: 0.4,
    ambientSpeed: 0.065,
    ambient: [
      { x: -138.5, y: -5.0, z: 36.2, scale: 9.5 },
      { x: -119.5, y: -4.85, z: 16.8, scale: 15 },
      { x: -135.5, y: -5.0, z: 36.0, scale: 5.0 },
      { x: -106.2, y: -5.0, z: 18.0, scale: 9.8 },
    ],
  };

  for (let index = 0; index < params.exhaust.length; index += 1) {
    const config = params.exhaust[index];
    const emitter = createSmokeEmitter({
      map,
      count: exhaustParticleCount,
      speed: params.exhaustSpeed,
      offsetMin: new THREE.Vector3(-0.08, 0.02, -0.04),
      offsetMax: new THREE.Vector3(0.08, 0.35, 0.04),
      scaleMin: 0.12,
      scaleMax: 0.42,
      opacity: params.exhaustOpacity,
      colorStart: 0x9a9890,
      colorEnd: 0x4a4845,
      worldScale: params.exhaustScale,
    });

    emitter.mesh.position.set(config.x, config.y, config.z);
    emitter.mesh.name = `exhaust-smoke-${index + 1}`;
    car.add(emitter.mesh);
    emitters.push(emitter);
  }

  for (let index = 0; index < params.ambient.length; index += 1) {
    const config = params.ambient[index];
    const emitter = createSmokeEmitter({
      map,
      count: ambientParticleCount,
      speed: params.ambientSpeed,
      offsetMin: new THREE.Vector3(-0.7, 0.0, -0.7),
      offsetMax: new THREE.Vector3(0.7, 1.2, 0.7),
      scaleMin: 0.3,
      scaleMax: 0.9,
      opacity: params.ambientOpacity,
      colorStart: 0x8a8885,
      colorEnd: 0x454340,
      worldScale: config.scale,
    });

    emitter.mesh.position.set(config.x, config.y, config.z);
    emitter.mesh.name = `ambient-smoke-${index + 1}`;
    scene.add(emitter.mesh);
    emitters.push(emitter);
  }

  const exhaustEmitterCount = params.exhaust.length;

  function syncExhaustPosition(index) {
    const config = params.exhaust[index];
    const emitter = emitters[index];
    if (!config || !emitter) {
      return;
    }

    emitter.mesh.position.set(config.x, config.y, config.z);
  }

  function syncAmbientPosition(index) {
    const config = params.ambient[index];
    const emitter = emitters[exhaustEmitterCount + index];
    if (!config || !emitter) {
      return;
    }

    emitter.mesh.position.set(config.x, config.y, config.z);
  }

  function setExhaustOpacity(value) {
    params.exhaustOpacity = value;
    for (let index = 0; index < exhaustEmitterCount; index += 1) {
      emitters[index].opacityUniform.value = value;
      emitters[index].opacityUniform.needsUpdate = true;
    }
  }

  function setAmbientOpacity(value) {
    params.ambientOpacity = value;
    for (let index = exhaustEmitterCount; index < emitters.length; index += 1) {
      emitters[index].opacityUniform.value = value;
      emitters[index].opacityUniform.needsUpdate = true;
    }
  }

  function setExhaustScale(value) {
    params.exhaustScale = value;
    for (let index = 0; index < exhaustEmitterCount; index += 1) {
      emitters[index].mesh.scale.setScalar(value);
    }
  }

  function setAmbientScale(index, value) {
    const config = params.ambient[index];
    const emitter = emitters[exhaustEmitterCount + index];
    if (!config || !emitter) {
      return;
    }

    config.scale = value;
    emitter.mesh.scale.setScalar(value);
  }

  function setExhaustSpeed(value) {
    params.exhaustSpeed = value;
    for (let index = 0; index < exhaustEmitterCount; index += 1) {
      emitters[index].speedUniform.value = value;
      emitters[index].speedUniform.needsUpdate = true;
    }
  }

  function setAmbientSpeed(value) {
    params.ambientSpeed = value;
    for (let index = exhaustEmitterCount; index < emitters.length; index += 1) {
      emitters[index].speedUniform.value = value;
      emitters[index].speedUniform.needsUpdate = true;
    }
  }

  function logConfig() {
    console.info("[smoke] Current config:", JSON.stringify(params, null, 2));
  }

  return {
    emitters,
    params,
    layer: SMOKE_LAYER,
    syncExhaustPosition,
    syncAmbientPosition,
    setExhaustOpacity,
    setAmbientOpacity,
    setExhaustScale,
    setAmbientScale,
    setExhaustSpeed,
    setAmbientSpeed,
    logConfig,
    dispose() {
      for (const emitter of emitters) {
        emitter.mesh.removeFromParent();
        emitter.material.dispose();
      }

      map.dispose();
    },
  };
}
