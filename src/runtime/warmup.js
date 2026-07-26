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

async function warmPostFrames({ world, pipeline, post, camera, frames }) {
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

  loaderOverlay.setProgress(1);
  loaderOverlay.setStatus("ASSEMBLING SECTOR");

  setObjectsVisible(deferredObjects, false);
  try {
    await renderer.compileAsync(scene, beautyCamera);

    await warmPostFrames({
      world,
      pipeline,
      post,
      camera,
      frames: 1,
    });
  } finally {
    setObjectsVisible(deferredObjects, true);
  }
}

export async function compileDeferredStartup({ renderer, scene, pipeline }) {
  const beautyCamera = pipeline.beautyCamera;
  if (!beautyCamera) {
    return;
  }

  await renderer.compileAsync(scene, beautyCamera);

  if (pipeline.rainCamera) {
    await renderer.compileAsync(scene, pipeline.rainCamera);
  }
}
