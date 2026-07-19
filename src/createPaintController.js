import { findMeshByName, getMeshMaterials } from "./loadModel.js";
import {
  PAINT_TARGETS,
  getPaintTarget,
  resolvePaintTargetKeyFromObject,
} from "./colorTargets.js";
import { createSplashTransitionMaterial } from "./materials/createSplashTransitionMaterial.js";

function clampIndex(index, length) {
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

function getPrimaryMaterial(mesh) {
  const materials = getMeshMaterials(mesh);
  return materials[0] ?? null;
}

export function createPaintController({
  model,
  renderer,
  renderLoop,
  onTransitionStart,
  onTransitionEnd,
} = {}) {
  const entries = new Map();
  let hoveredTargetKey = null;

  function invalidate(options) {
    renderLoop?.invalidate("paint", options);
  }

  function paintAnimLifecycle(event) {
    if (event.type === "start") {
      renderLoop?.startInteraction("paint");
      onTransitionStart?.();
      renderLoop?.invalidate("paint");
      return;
    }

    if (event.type === "complete") {
      onTransitionEnd?.();
      renderLoop?.endInteraction("camera");
      renderLoop?.invalidate("paint");
      renderLoop?.scheduleInteractionEnd("paint");
    }
  }

  for (const [targetKey, config] of Object.entries(PAINT_TARGETS)) {
    const mesh = findMeshByName(model, config.meshName);
    if (!mesh) {
      console.warn(`[paint] mesh not found: ${config.meshName}`);
      continue;
    }

    const sourceMaterial = getPrimaryMaterial(mesh);
    const initialColor = config.palette[config.defaultIndex] ?? "#ffffff";
    const props = config.materialProps ?? {};

    const splash = createSplashTransitionMaterial({
      initialColor,
      map: sourceMaterial?.map ?? null,
      tintMap: props.tintMap ?? false,
      roughness: sourceMaterial?.roughness ?? props.roughness ?? 0.7,
      metalness: sourceMaterial?.metalness ?? props.metalness ?? 0,
      center: [0.5, 0.5],
      duration: props.duration ?? 1.5,
      angleNoiseScale: props.angleNoiseScale ?? 0.5,
      angleNoiseStrength: props.angleNoiseStrength ?? 0.5,
      renderer,
      onInvalidate: invalidate,
      onAnimLifecycle: paintAnimLifecycle,
    });

    mesh.material = splash.material;

    entries.set(targetKey, {
      targetKey,
      mesh,
      meshName: config.meshName,
      palette: config.palette,
      splash,
      colorIndex: config.defaultIndex,
      center: [0.5, 0.5],
    });
  }

  function getEntry(targetKey) {
    return entries.get(targetKey) ?? null;
  }

  function getColorForEntry(entry) {
    return entry.palette[entry.colorIndex] ?? entry.palette[0];
  }

  function applyColor(entry, { center, animate = true } = {}) {
    const color = getColorForEntry(entry);
    if (center) {
      entry.center = [...center];
    }

    if (animate) {
      entry.splash.setTransitionColor(color, { center: entry.center });
    } else {
      entry.splash.setInitialColor(color, { skipAnimation: true });
      if (center) {
        entry.splash.setCenter(entry.center);
      }
    }
  }

  return {
    resolveHit(object) {
      return resolvePaintTargetKeyFromObject(object);
    },

    getColorIndex(targetKey) {
      return getEntry(targetKey)?.colorIndex ?? 0;
    },

    cycleColor(targetKey, center) {
      const entry = getEntry(targetKey);
      if (!entry) {
        return false;
      }

      entry.colorIndex = clampIndex(
        entry.colorIndex + 1,
        entry.palette.length,
      );
      applyColor(entry, { center, animate: true });
      return true;
    },

    setColorIndex(targetKey, index, { center, animate = true } = {}) {
      const entry = getEntry(targetKey);
      if (!entry) {
        return false;
      }

      entry.colorIndex = clampIndex(index, entry.palette.length);
      applyColor(entry, { center, animate });
      return true;
    },

    getRadialMenuData(targetKey) {
      const entry = getEntry(targetKey);
      if (!entry) {
        return null;
      }

      return {
        targetKey,
        colors: [...entry.palette],
        activeIndex: entry.colorIndex,
      };
    },

    getMesh(targetKey) {
      return getEntry(targetKey)?.mesh ?? null;
    },

    setHoveredTarget(targetKey) {
      const nextKey = targetKey ?? null;
      if (nextKey === hoveredTargetKey) {
        return false;
      }

      if (hoveredTargetKey) {
        getEntry(hoveredTargetKey)?.splash.setHovered(false);
      }

      hoveredTargetKey = nextKey;

      if (hoveredTargetKey) {
        getEntry(hoveredTargetKey)?.splash.setHovered(true);
      }

      return true;
    },

    applySavedState(meshColors = {}) {
      if (!meshColors || typeof meshColors !== "object") {
        return;
      }

      for (const [targetKey, index] of Object.entries(meshColors)) {
        const entry = getEntry(targetKey);
        if (!entry) {
          continue;
        }

        entry.colorIndex = clampIndex(Number(index), entry.palette.length);
        applyColor(entry, { animate: false });
      }
    },

    getSnapshot() {
      const snapshot = {};
      for (const [targetKey, entry] of entries) {
        snapshot[targetKey] = entry.colorIndex;
      }
      return snapshot;
    },

    handleResize() {
      for (const entry of entries.values()) {
        entry.splash.handleResize();
      }
    },

    dispose() {
      for (const entry of entries.values()) {
        entry.splash.dispose();
      }
      entries.clear();
    },
  };
}

export { getPaintTarget };
