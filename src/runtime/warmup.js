export async function finalizeStartupLighting({
  loaderOverlay,
  syncLighting,
  requestShadowMapUpdate,
  renderer,
  scene,
  pipeline,
  camera,
  world,
  post,
}) {
  loaderOverlay.setProgress(0.88);
  loaderOverlay.setStatus("Preparing lighting...");

  syncLighting();
  requestShadowMapUpdate?.("startup-lighting");

  loaderOverlay.setProgress(0.93);
  loaderOverlay.setStatus("Compiling shaders...");
  world.ground?.syncReflectionSize?.(renderer);
  await renderer.compileAsync(scene, pipeline.beautyCamera ?? camera);
  if (pipeline.rainCamera) {
    await renderer.compileAsync(scene, pipeline.rainCamera);
  }

  loaderOverlay.setProgress(0.96);
  loaderOverlay.setStatus("Warming up...");
  for (let i = 0; i < 4; i += 1) {
    world.rain?.update(1 / 60, camera);
    world.ground?.update?.(1 / 60);
    world.ground?.setRippleAmount?.(world.rain?.params?.enabled ? 1 : 0);
    world.ground?.updateReflection?.(renderer, camera);
    pipeline.syncCameras?.(camera);
    post.render();
  }
}
