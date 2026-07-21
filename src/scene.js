import * as THREE from "three/webgpu";

export function freezeStaticTransforms(root) {
  root.traverse((object) => {
    object.matrixAutoUpdate = false;
    object.updateMatrix();
  });
  root.updateMatrixWorld(true);
}

export function addModel(scene, model) {
  scene.add(model);
  freezeStaticTransforms(model);
  return model.position.clone();
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080610);

  const SHADOW_EXTENT = 200;
  const SUN_DISTANCE = 150;

  const sunLight = new THREE.DirectionalLight("#cfefff", 10);
  sunLight.position.set(23, 31, 3);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = SUN_DISTANCE + SHADOW_EXTENT * 2;
  sunLight.shadow.camera.left = -SHADOW_EXTENT;
  sunLight.shadow.camera.right = SHADOW_EXTENT;
  sunLight.shadow.camera.top = SHADOW_EXTENT;
  sunLight.shadow.camera.bottom = -SHADOW_EXTENT;
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0001;
  sunLight.shadow.normalBias = 0.002;
  sunLight.shadow.autoUpdate = false;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const fillLight = new THREE.DirectionalLight("#ffd6c8", 2.5);
  fillLight.position.set(-18, 22, -12);
  fillLight.target.position.set(0, 0, 0);
  fillLight.castShadow = false;
  scene.add(fillLight);
  scene.add(fillLight.target);

  const sunState = {
    intensity: sunLight.intensity,
    color: `#${sunLight.color.getHexString()}`,
    x: sunLight.position.x,
    y: sunLight.position.y,
    z: sunLight.position.z,
  };

  function applySun() {
    sunLight.intensity = sunState.intensity;
    sunLight.color.set(sunState.color);
    sunLight.position.set(sunState.x, sunState.y, sunState.z);
    sunLight.target.updateMatrixWorld();
  }

  applySun();

  return { scene, sunLight, fillLight, sunState, applySun };
}
