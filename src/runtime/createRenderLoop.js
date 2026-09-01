import * as THREE from "three/webgpu";
import { collectCollisionHideObjects } from "../world/weather/collisionHideObjects.js";

export function createRenderLoop({
  camera,
  cameraDirector,
  world,
  pipeline,
  post,
  performanceTools,
  renderer,
  getRainGlassIntro,
  getIntroActive,
  onFrame,
}) {
  const timer = new THREE.Timer();

  function renderFrame() {
    timer.update();
    const delta = timer.getDelta();

    cameraDirector.update(delta);
    onFrame?.(delta);

    world.collisionHeight?.update({
      camera,
      hideObjects: collectCollisionHideObjects(world),
    });
    world.rain?.update(delta, camera);

    const introActive = getIntroActive?.() ?? false;

    if (!introActive) {
      world.planes?.update?.(delta);
    }

    world.sky?.update(camera, timer.getElapsed());
    world.ground?.update?.(delta);
    const rainEnabled = world.rain?.params?.enabled ?? false;
    world.ground?.setRippleAmount?.(rainEnabled ? 1 : 0);

    if (!introActive) {
      world.billboards?.userData?.billboardMaterials?.billboard?.update?.(camera);
    }
    const carRainActive = world.carSurfaceRain?.syncProximity({
      camera,
      carRoot: world.car,
      rainEnabled,
    });
    if (carRainActive) {
      world.carSurfaceRain.update(delta);
    }

    if (performanceTools?.shouldUpdateGroundReflection()) {
      world.ground?.updateReflection?.(renderer, camera);
    }

    pipeline.syncCameras?.(camera);
    pipeline.dof.updateFocusPoint(cameraDirector.focusPoint, camera);
    getRainGlassIntro?.()?.update();
    post.render();
    performanceTools?.sampleFps();
  }

  function startLoop() {
    renderer.setAnimationLoop(renderFrame);
  }

  function stopLoop() {
    renderer.setAnimationLoop(null);
  }

  function warmFrame() {
    renderFrame();
  }

  return {
    renderFrame,
    startLoop,
    stopLoop,
    warmFrame,
  };
}
