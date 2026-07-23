import * as THREE from "three/webgpu";

export function createRenderLoop({
  camera,
  cameraDirector,
  world,
  pipeline,
  post,
  performanceTools,
  renderer,
  getRainGlassIntro,
  onFrame,
}) {
  const timer = new THREE.Timer();

  function renderFrame() {
    timer.update();
    const delta = timer.getDelta();

    cameraDirector.update(delta);
    onFrame?.(delta);

    world.rain?.update(delta, camera);
    world.planes?.update?.(delta);
    world.sky?.update(camera, timer.getElapsed());
    world.ground?.update?.(delta);
    world.carSurfaceRain?.update(delta);
    const rainEnabled = world.rain?.params?.enabled ?? false;
    world.ground?.setRippleAmount?.(rainEnabled ? 1 : 0);
    world.carSurfaceRain?.setEnabled(rainEnabled);

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
