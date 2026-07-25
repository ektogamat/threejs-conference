/**
 * Startup shader warmup split into:
 * - Critical path (blocks loader at 100% + "assembling" status): city / car / ground /
 *   sky via beauty camera. Progress hits 100 early so the long compile does not look stuck.
 * - Deferred (runs after the loop starts, during intro): rain, smoke, planes
 *
 * Same idea as three.js webgpu_compile_async — pay compile cost off the first visible
 * hitch — but only block the loader on what must be ready for the first frame.
 */

function collectDeferredObjects(world) {
  const objects = [];

  if (world?.rain?.group) {
    objects.push(world.rain.group);
  }

  if (world?.planes?.group) {
    objects.push(world.planes.group);
  }

  if (world?.smoke?.emitters) {
    for (const emitter of world.smoke.emitters) {
      if (emitter?.mesh) {
        objects.push(emitter.mesh);
      }
    }
  }

  return objects;
}

function setObjectsVisible(objects, visible) {
  for (const object of objects) {
    object.visible = visible;
  }
}

async function warmPostFrames({
  world,
  pipeline,
  post,
  renderer,
  camera,
  frames,
  includeReflection,
}) {
  for (let i = 0; i < frames; i += 1) {
    world.rain?.update(1 / 60, camera);
    world.ground?.update?.(1 / 60);
    const rainEnabled = world.rain?.params?.enabled ?? false;
    world.ground?.setRippleAmount?.(rainEnabled ? 1 : 0);
    const carRainActive = world.carSurfaceRain?.syncProximity({
      camera,
      carRoot: world.car,
      rainEnabled,
    });
    if (carRainActive) {
      world.carSurfaceRain.update(1 / 60);
    }
    if (includeReflection) {
      world.ground?.updateReflection?.(renderer, camera);
    }
    pipeline.syncCameras?.(camera);
    post.render();
  }
}

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
  loaderOverlay.setStatus("SYNCING LIGHTS");

  syncLighting();
  requestShadowMapUpdate?.("startup-lighting");

  const deferredObjects = collectDeferredObjects(world);
  const beautyCamera = pipeline.beautyCamera ?? camera;

  // Assets are in — show 100% and a phase label while shaders compile (can take seconds).
  loaderOverlay.setProgress(1);
  loaderOverlay.setStatus("ASSEMBLING SECTOR");
  world.ground?.syncReflectionSize?.(renderer);

  // Hide rain / smoke / planes so beauty compile only builds core pipelines.
  setObjectsVisible(deferredObjects, false);
  try {
    await renderer.compileAsync(scene, beautyCamera);

    // One post frame compiles the RenderPipeline graph; reflection + rain wait for deferred.
    await warmPostFrames({
      world,
      pipeline,
      post,
      renderer,
      camera,
      frames: 1,
      includeReflection: false,
    });
  } finally {
    setObjectsVisible(deferredObjects, true);
  }
}

export async function compileDeferredStartup({
  renderer,
  scene,
  pipeline,
}) {
  const beautyCamera = pipeline.beautyCamera;
  if (!beautyCamera) {
    return;
  }

  // Smoke / planes were skipped on the critical path — compile them now.
  await renderer.compileAsync(scene, beautyCamera);

  if (pipeline.rainCamera) {
    await renderer.compileAsync(scene, pipeline.rainCamera);
  }
}
