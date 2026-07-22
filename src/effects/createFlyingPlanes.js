import * as THREE from "three/webgpu";
import { performanceProfile } from "../performanceProfile.js";
import { loadPlaneModel } from "../loadModel.js";

const DEBUG_PATH_SEGMENTS = 200;
const PROGRESS_SPEED = 0.1;
/** Seconds to wait after finishing a path before respawning. */
const DEFAULT_LOOP_DELAY = 30;

const DEFAULT_PATHS = [
  {
    curvePoints: [
      [-250, 17, 94.5],
      [-178.5, 17, 37.5],
      [-133.5, 17, 30.5],
      [17.5, 30.5, 25.5],
      [221.5, 40, 94.5],
    ],
    speed: 1,
    scale: 1,
    startOffset: 0,
    direction: 1,
    yawOffset: 0.098407346410207,
    loopDelay: DEFAULT_LOOP_DELAY,
  },
  {
    curvePoints: [
      [204, 60, -25],
      [115.5, 60, 39],
      [-22, 60, -4],
      [-152, 60, 39],
      [11.5, 60, 120],
      [50, 60, -19],
    ],
    speed: 1,
    scale: 1,
    startOffset: 0.4,
    direction: 1,
    yawOffset: 0.078407346410207,
    loopDelay: DEFAULT_LOOP_DELAY,
  },
];

function clonePathConfig(path) {
  return {
    curvePoints: path.curvePoints.map((point) => [...point]),
    speed: path.speed ?? 1,
    scale: path.scale ?? 1,
    startOffset: path.startOffset ?? 0,
    direction: path.direction ?? 1,
    yawOffset: path.yawOffset ?? 0,
    loopDelay: path.loopDelay ?? DEFAULT_LOOP_DELAY,
  };
}

function createCurveFromPoints(curvePoints) {
  if (!curvePoints || curvePoints.length < 2) {
    return null;
  }

  const points = curvePoints.map(
    ([x, y, z]) => new THREE.Vector3(x, y, z),
  );

  if (curvePoints.length === 2) {
    return new THREE.LineCurve3(points[0], points[1]);
  }

  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
}

function buildDebugLineGeometry(curve, segments) {
  const sampled = curve.getPoints(segments);
  return new THREE.BufferGeometry().setFromPoints(sampled);
}

function configurePlaneMesh(root) {
  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function centerModelAtOrigin(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
}

function orientAlongPath(anchor, position, tangent, yawOffset, lookTarget) {
  if (tangent.lengthSq() <= 1e-10) {
    return;
  }

  lookTarget.copy(position).add(tangent);
  anchor.lookAt(lookTarget);

  if (yawOffset) {
    anchor.rotateY(yawOffset);
  }
}

/**
 * Sky planes following Catmull-Rom paths. Each path entry spawns one cloned GLB.
 */
export async function createFlyingPlanes({
  scene,
  renderer,
  paths = DEFAULT_PATHS,
  debugPath = false,
} = {}) {
  if (!performanceProfile.planeEnabled) {
    return {
      params: null,
      update() {},
      dispose() {},
    };
  }

  const planeTemplate = await loadPlaneModel(renderer);
  centerModelAtOrigin(planeTemplate);
  const group = new THREE.Group();
  group.name = "flying-planes";
  scene.add(group);

  const debugGroup = new THREE.Group();
  debugGroup.name = "flying-planes-debug";
  group.add(debugGroup);

  const params = {
    enabled: true,
    debugPath,
    debugPathColor: "#00ffff",
    speedMultiplier: 1,
    paths: paths.map(clonePathConfig),
  };

  const planeInstances = [];
  const _position = new THREE.Vector3();
  const _tangent = new THREE.Vector3();
  const _lookTarget = new THREE.Vector3();

  function createDebugLine(curve) {
    const geometry = buildDebugLineGeometry(curve, DEBUG_PATH_SEGMENTS);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: params.debugPathColor }),
    );
    line.visible = params.debugPath;
    debugGroup.add(line);
    return { line, geometry };
  }

  function syncPathCurve(index) {
    const instance = planeInstances[index];
    const pathParams = params.paths[index];
    if (!instance || !pathParams) {
      return;
    }

    instance.curve = createCurveFromPoints(pathParams.curvePoints);
    if (!instance.curve) {
      return;
    }

    if (instance.debugLine) {
      instance.debugGeometry?.dispose();
      instance.debugGeometry = buildDebugLineGeometry(
        instance.curve,
        DEBUG_PATH_SEGMENTS,
      );
      instance.debugLine.geometry = instance.debugGeometry;
      return;
    }

    const { line, geometry } = createDebugLine(instance.curve);
    instance.debugLine = line;
    instance.debugGeometry = geometry;
    syncDebugVisibility();
  }

  function syncPlaneScale(index) {
    const instance = planeInstances[index];
    const pathParams = params.paths[index];
    if (!instance || !pathParams) {
      return;
    }

    instance.mesh.scale.setScalar(pathParams.scale);
  }

  function syncDebugVisibility() {
    debugGroup.visible = params.enabled && params.debugPath;
    for (const instance of planeInstances) {
      if (instance.debugLine) {
        instance.debugLine.visible = params.enabled && params.debugPath;
      }
    }
  }

  for (let index = 0; index < params.paths.length; index += 1) {
    const pathParams = params.paths[index];
    const anchor = new THREE.Group();
    anchor.name = `plane-anchor-${index + 1}`;

    const mesh = planeTemplate.clone(true);
    mesh.name = `plane-${index + 1}`;
    configurePlaneMesh(mesh);
    mesh.scale.setScalar(pathParams.scale);
    anchor.add(mesh);
    group.add(anchor);

    const curve = createCurveFromPoints(pathParams.curvePoints);
    const debug = curve ? createDebugLine(curve) : { line: null, geometry: null };

    planeInstances.push({
      anchor,
      mesh,
      curve,
      debugLine: debug.line,
      debugGeometry: debug.geometry,
      progress: pathParams.startOffset,
      waitRemaining: 0,
    });
  }

  function update(delta) {
    if (!params.enabled) {
      group.visible = false;
      return;
    }

    group.visible = true;
    syncDebugVisibility();

    for (let index = 0; index < planeInstances.length; index += 1) {
      const instance = planeInstances[index];
      const pathParams = params.paths[index];
      const { curve, anchor } = instance;

      if (!curve || !pathParams) {
        anchor.visible = false;
        continue;
      }

      if (instance.waitRemaining > 0) {
        instance.waitRemaining -= delta;
        anchor.visible = false;
        continue;
      }

      anchor.visible = true;

      const directionSign = pathParams.direction >= 0 ? 1 : -1;
      instance.progress +=
        delta * pathParams.speed * params.speedMultiplier * PROGRESS_SPEED * directionSign;

      if (instance.progress > 1) {
        instance.progress = 0;
        instance.waitRemaining = pathParams.loopDelay;
        anchor.visible = false;
        continue;
      }

      if (instance.progress < 0) {
        instance.progress = 1;
        instance.waitRemaining = pathParams.loopDelay;
        anchor.visible = false;
        continue;
      }

      curve.getPointAt(instance.progress, _position);
      anchor.position.copy(_position);

      curve.getTangentAt(instance.progress, _tangent);
      _tangent.multiplyScalar(directionSign);
      orientAlongPath(anchor, _position, _tangent, pathParams.yawOffset, _lookTarget);
    }
  }

  function setEnabled(value) {
    params.enabled = Boolean(value);
  }

  function setSpeedMultiplier(value) {
    params.speedMultiplier = value;
  }

  function setDebugPath(value) {
    params.debugPath = Boolean(value);
    syncDebugVisibility();
  }

  function setDebugPathColor(value) {
    params.debugPathColor = value;
    for (const instance of planeInstances) {
      if (instance.debugLine?.material) {
        instance.debugLine.material.color.set(value);
      }
    }
  }

  function syncPathPoint(pathIndex, pointIndex) {
    syncPathCurve(pathIndex);
  }

  function logConfig() {
    console.info("[planes] Current config:", JSON.stringify(params, null, 2));
  }

  return {
    group,
    params,
    update,
    setEnabled,
    setSpeedMultiplier,
    setDebugPath,
    setDebugPathColor,
    syncPathCurve,
    syncPathPoint,
    syncPlaneScale,
    logConfig,
    dispose() {
      for (const instance of planeInstances) {
        instance.anchor.removeFromParent();
        instance.debugGeometry?.dispose();
        instance.debugLine?.material?.dispose();
        instance.debugLine?.removeFromParent();
      }

      group.removeFromParent();
    },
  };
}
