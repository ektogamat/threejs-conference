import { PhysicalLightingModel } from "three/webgpu";
import { uniform, vec3 } from "three/tsl";
import { RENDER_MODES } from "../renderModes.js";

/**
 * 1 = allow env-map specular (Default / no SSR).
 * 0 = block env specular so SSR is the only reflection source.
 * Read at shader compile time — call invalidatePhysicalMaterials after changing.
 */
export const allowEnvMapSpecular = uniform(0);

let _indirectSpecular = null;
let _patchInstalled = false;

export function installIndirectSpecularPatch() {
  if (_patchInstalled) {
    return;
  }

  _patchInstalled = true;
  _indirectSpecular = PhysicalLightingModel.prototype.indirectSpecular;

  PhysicalLightingModel.prototype.indirectSpecular = function (builder) {
    if (allowEnvMapSpecular.value === 0) {
      builder.context.radiance = vec3(0);

      if (this.clearcoatRadiance) {
        this.clearcoatRadiance.assign(vec3(0));
      }
    }

    _indirectSpecular.call(this, builder);
  };
}

export function syncIndirectSpecularPatch(mode) {
  allowEnvMapSpecular.value = mode === RENDER_MODES.default ? 1 : 0;
}

export function invalidatePhysicalMaterials(root) {
  root?.traverse((object) => {
    if (!object.material) {
      return;
    }

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      if (!material) {
        continue;
      }

      material.needsUpdate = true;
      if (typeof material.version === "number") {
        material.version += 1;
      }
    }
  });
}
