export function collectCollisionHideObjects({ rain, smoke, planes, sky } = {}) {
  const hideObjects = [];

  if (rain?.group) {
    hideObjects.push(rain.group);
  }

  if (sky?.mesh) {
    hideObjects.push(sky.mesh);
  }

  if (planes?.group) {
    hideObjects.push(planes.group);
  }

  if (smoke?.emitters) {
    for (const emitter of smoke.emitters) {
      if (emitter?.mesh) {
        hideObjects.push(emitter.mesh);
      }
    }
  }

  return hideObjects;
}
