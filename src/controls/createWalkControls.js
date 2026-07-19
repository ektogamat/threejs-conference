import * as THREE from "three/webgpu";

const DEFAULTS = {
  moveSpeed: 28,
  sprintMultiplier: 1.75,
  mouseSensitivity: 0.002,
  eyeHeight: 1.75,
  playerRadius: 0.6,
  groundProbeHeight: 200,
  groundProbeDistance: 400,
  wallProbeDistance: 0.35,
};

const KEY_MAP = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function createWalkControls({
  camera,
  domElement,
  model,
  settings: settingsOverrides = {},
  onLookChange,
} = {}) {
  const settings = { ...DEFAULTS, ...settingsOverrides };

  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };

  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const moveInput = new THREE.Vector2();
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const probeOrigin = new THREE.Vector3();
  const probeDirection = new THREE.Vector3();
  const nextPosition = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();

  let active = false;
  let pointerLocked = false;
  let moving = false;

  const listeners = new Set();

  function notifyChange() {
    for (const listener of listeners) {
      listener({
        active,
        pointerLocked,
        moving,
      });
    }
  }

  function syncEulerFromCamera() {
    euler.setFromQuaternion(camera.quaternion, "YXZ");
  }

  function applyEulerToCamera() {
    camera.quaternion.setFromEuler(euler);
  }

  function sampleGroundY(x, z, referenceY) {
    if (!model) {
      return referenceY - settings.eyeHeight;
    }

    probeOrigin.set(x, referenceY + settings.groundProbeHeight, z);
    probeDirection.set(0, -1, 0);
    raycaster.set(probeOrigin, probeDirection);
    raycaster.far = settings.groundProbeDistance;

    const hits = raycaster.intersectObject(model, true);
    if (hits.length === 0) {
      return referenceY - settings.eyeHeight;
    }

    return hits[0].point.y;
  }

  function snapCameraToGround() {
    const groundY = sampleGroundY(
      camera.position.x,
      camera.position.z,
      camera.position.y,
    );
    camera.position.y = groundY + settings.eyeHeight;
  }

  function canMoveTo(from, to) {
    if (!model) {
      return true;
    }

    probeDirection.subVectors(to, from);
    const distance = probeDirection.length();
    if (distance < 1e-5) {
      return true;
    }

    probeDirection.multiplyScalar(1 / distance);
    probeOrigin.copy(from);
    probeOrigin.y += settings.eyeHeight * 0.45;

    raycaster.set(probeOrigin, probeDirection);
    raycaster.far = distance + settings.wallProbeDistance;

    const hits = raycaster.intersectObject(model, true);
    return hits.length === 0 || hits[0].distance >= distance;
  }

  function onKeyDown(event) {
    if (!active || isEditableTarget(event.target)) {
      return;
    }

    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      keys.sprint = true;
      return;
    }

    const action = KEY_MAP[event.code];
    if (action) {
      keys[action] = true;
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      keys.sprint = false;
      return;
    }

    const action = KEY_MAP[event.code];
    if (action) {
      keys[action] = false;
    }
  }

  function onMouseMove(event) {
    if (!active || !pointerLocked) {
      return;
    }

    euler.y -= event.movementX * settings.mouseSensitivity;
    euler.x -= event.movementY * settings.mouseSensitivity;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    applyEulerToCamera();
    onLookChange?.();
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === domElement;
    notifyChange();
  }

  function onCanvasClick(event) {
    if (!active || pointerLocked || event.button !== 0) {
      return;
    }

    if (event.target !== domElement) {
      return;
    }

    domElement.requestPointerLock?.();
  }

  function bind() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    domElement.addEventListener("click", onCanvasClick);
  }

  function unbind() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    domElement.removeEventListener("click", onCanvasClick);
  }

  bind();

  function setActive(nextActive) {
    if (active === nextActive) {
      return;
    }

    active = nextActive;

    if (!active) {
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock?.();
      }
      for (const key of Object.keys(keys)) {
        keys[key] = false;
      }
      moving = false;
    } else {
      syncEulerFromCamera();
      snapCameraToGround();
    }

    notifyChange();
  }

  function update(delta) {
    if (!active || delta <= 0) {
      moving = false;
      return false;
    }

    if (!pointerLocked) {
      snapCameraToGround();
      if (moving) {
        moving = false;
        notifyChange();
      }
      return false;
    }

    moveInput.set(0, 0);
    if (keys.forward) {
      moveInput.y -= 1;
    }
    if (keys.backward) {
      moveInput.y += 1;
    }
    if (keys.left) {
      moveInput.x -= 1;
    }
    if (keys.right) {
      moveInput.x += 1;
    }

    const wantsMove = moveInput.lengthSq() > 0;
    if (wantsMove) {
      moveInput.normalize();

      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) {
        forward.set(0, 0, -1);
      } else {
        forward.normalize();
      }

      side.crossVectors(forward, camera.up).normalize();

      velocity.set(0, 0, 0);
      velocity.addScaledVector(forward, -moveInput.y);
      velocity.addScaledVector(side, moveInput.x);

      if (velocity.lengthSq() > 0) {
        velocity.normalize();
      }

      const speed = keys.sprint
        ? settings.moveSpeed * settings.sprintMultiplier
        : settings.moveSpeed;

      nextPosition.copy(camera.position);
      nextPosition.addScaledVector(velocity, speed * delta);

      if (canMoveTo(camera.position, nextPosition)) {
        camera.position.x = nextPosition.x;
        camera.position.z = nextPosition.z;
      }
    }

    snapCameraToGround();

    const isMoving = wantsMove;
    if (isMoving !== moving) {
      moving = isMoving;
      notifyChange();
    }

    return isMoving;
  }

  function dispose() {
    setActive(false);
    unbind();
    listeners.clear();
  }

  return {
    settings,
    setActive,
    isActive: () => active,
    isPointerLocked: () => pointerLocked,
    isMoving: () => moving,
    update,
    syncEulerFromCamera,
    snapCameraToGround,
    subscribe: (listener) => {
      listeners.add(listener);
      listener({ active, pointerLocked, moving });
      return () => listeners.delete(listener);
    },
    dispose,
  };
}
