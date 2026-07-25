export function createDevAppApi({ scene, world, camera, controls }) {
  if (!import.meta.env.DEV) {
    return null;
  }

  window.__app = {
    scene,
    city: world.city,
    quadraCar: world.car,
    ground: world.ground,
    rain: world.rain,
    smoke: world.smoke,
    planes: world.planes,
    sky: world.sky,
    listObjectNames() {
      const rows = [];

      world.city?.traverse((object) => {
        if (!object.name) {
          return;
        }

        rows.push({
          name: object.name,
          type: object.type,
          castShadow: object.castShadow ?? "",
          receiveShadow: object.receiveShadow ?? "",
        });
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      console.table(rows);
      return rows;
    },
    dumpCamera: () => {
      const pose = {
        position: [
          Number(camera.position.x.toFixed(3)),
          Number(camera.position.y.toFixed(3)),
          Number(camera.position.z.toFixed(3)),
        ],
        target: [
          Number(controls.target.x.toFixed(3)),
          Number(controls.target.y.toFixed(3)),
          Number(controls.target.z.toFixed(3)),
        ],
      };
      console.log(JSON.stringify(pose, null, 2));
      return pose;
    },
  };

  console.info("[dev] Camera pose: run __app.dumpCamera() in the console");

  return window.__app;
}

export function attachDevAudio(
  appApi,
  carEngineAudio,
  planeEngineAudio,
  wetFootstepAudio,
) {
  if (!import.meta.env.DEV || !appApi) {
    return;
  }

  appApi.carEngineAudio = carEngineAudio;
  appApi.planeEngineAudio = planeEngineAudio;
  appApi.wetFootstepAudio = wetFootstepAudio;
}

export function attachDevPerf(appApi, perfApi) {
  if (!import.meta.env.DEV || !appApi) {
    return;
  }

  appApi.perf = perfApi;
}
