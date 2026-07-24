import * as THREE from "three/webgpu";
import {
  float,
  mix,
  normalMap,
  texture,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { getMeshMaterials } from "../loaders/meshUtils.js";
import {
    createSurfaceRainUniforms,
    evaluateCarSurfaceRain,
} from "../../tsl/surfaceRain.js";

const GLASS_MATERIAL_NAMES = new Set(["77_5"]);
const EXCLUDED_MATERIAL_NAMES = new Set(["mat_0.001"]);

/**
 * Opaque smoked glass: dielectric base + clearcoat for the glossy “wet glass”
 * layer. Avoids metalness/mirror HDRI blobs while keeping reflections alive.
 */
const GLASS_LOOK = {
  color: [0.24, 0.25, 0.26],
  roughness: 0.12,
  metalness: 0,
  envMapIntensity: 0.85,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  specularIntensity: 1,
};

function isGlassMaterial(material) {
  return GLASS_MATERIAL_NAMES.has(material?.name);
}

function applyGlassLook(material) {
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.side = THREE.FrontSide;
  material.color.setRGB(...GLASS_LOOK.color);
  material.roughness = GLASS_LOOK.roughness;
  material.metalness = GLASS_LOOK.metalness;
  material.envMapIntensity = GLASS_LOOK.envMapIntensity;
  material.clearcoat = GLASS_LOOK.clearcoat;
  material.clearcoatRoughness = GLASS_LOOK.clearcoatRoughness;
  material.specularIntensity = GLASS_LOOK.specularIntensity;
}

function isPaintMaterial(material) {
  if (!material || material.isMeshBasicMaterial) {
    return false;
  }

  if (EXCLUDED_MATERIAL_NAMES.has(material.name)) {
    return false;
  }

  if (material.transparent && (material.opacity ?? 1) < 0.6) {
    return false;
  }

  const metalness = material.metalness ?? 0;
  const emissiveIntensity = material.emissiveIntensity ?? 0;
  const hasEmissive =
    emissiveIntensity > 0.5 &&
    (material.emissiveMap || material.emissive?.getHex?.() > 0);

  if (hasEmissive && metalness < 0.15) {
    return false;
  }

  return (
    metalness >= 0.15 ||
    Boolean(material.roughnessMap || material.metalnessMap || material.normalMap)
  );
}

function replaceMeshMaterial(mesh, materialIndex, material) {
  if (Array.isArray(mesh.material)) {
    mesh.material[materialIndex] = material;
    return;
  }

  mesh.material = material;
}

function ensurePaintNodeMaterial(source) {
  if (source?.isMeshStandardNodeMaterial && !source.isMeshPhysicalNodeMaterial) {
    return source;
  }

  const material = new THREE.MeshStandardNodeMaterial();
  material.name = source.name;
  material.color.copy(source.color ?? new THREE.Color(0xffffff));
  material.roughness = source.roughness ?? 0.5;
  material.metalness = source.metalness ?? 0;
  material.emissive.copy(source.emissive ?? new THREE.Color(0x000000));
  material.emissiveIntensity = source.emissiveIntensity ?? 1;
  material.map = source.map ?? null;
  material.roughnessMap = source.roughnessMap ?? null;
  material.metalnessMap = source.metalnessMap ?? null;
  material.normalMap = source.normalMap ?? null;
  material.emissiveMap = source.emissiveMap ?? null;
  material.normalScale.copy(source.normalScale ?? new THREE.Vector2(1, 1));
  material.transparent = source.transparent ?? false;
  material.opacity = source.opacity ?? 1;
  material.side = source.side ?? THREE.FrontSide;
  material.depthWrite = source.depthWrite ?? true;
  material.alphaTest = source.alphaTest ?? 0;
  return material;
}

function ensureGlassNodeMaterial(source) {
  if (source?.isMeshPhysicalNodeMaterial) {
    return source;
  }

  const material = new THREE.MeshPhysicalNodeMaterial();
  material.name = source.name;
  material.color.copy(source.color ?? new THREE.Color(0xffffff));
  material.roughness = source.roughness ?? 0.5;
  material.metalness = source.metalness ?? 0;
  material.emissive.copy(source.emissive ?? new THREE.Color(0x000000));
  material.emissiveIntensity = source.emissiveIntensity ?? 1;
  material.map = source.map ?? null;
  material.roughnessMap = source.roughnessMap ?? null;
  material.metalnessMap = source.metalnessMap ?? null;
  material.normalMap = source.normalMap ?? null;
  material.emissiveMap = source.emissiveMap ?? null;
  material.normalScale.copy(source.normalScale ?? new THREE.Vector2(1, 1));
  material.transparent = false;
  material.opacity = 1;
  material.side = THREE.FrontSide;
  material.depthWrite = true;
  material.alphaTest = source.alphaTest ?? 0;
  return material;
}

function wireSurfaceRain(
  material,
  uniforms,
  { wetRoughness, normalStrength, wetBrighten = null },
) {
  // Albedo / PBR maps stay on UV0; rain uses the model secondary UV (TEXCOORD_1).
  const uvNode = uv();
  const rain = evaluateCarSurfaceRain(uv(1), uniforms);
  const rainAmount = rain.mask.mul(uniforms.uIntensity);

  const baseRoughSample = material.roughnessMap
    ? texture(material.roughnessMap, uvNode).g
    : float(1);
  const baseRoughness = baseRoughSample.mul(float(material.roughness ?? 0.5));

  const baseMetalSample = material.metalnessMap
    ? texture(material.metalnessMap, uvNode).b
    : float(1);
  const baseMetalness = baseMetalSample.mul(float(material.metalness ?? 0));

  material.roughnessNode = mix(baseRoughness, wetRoughness, rainAmount);
  material.metalnessNode = baseMetalness;

  if (material.normalMap) {
    const normalSample = texture(material.normalMap, uvNode);
    material.normalNode = normalMap(
      vec4(
        normalSample.xy.add(rain.normalOffset.mul(normalStrength)),
        normalSample.zw,
      ),
    );
  } else {
    material.normalNode = normalMap(
      vec4(rain.normalOffset.mul(normalStrength), float(0), float(1)),
    );
  }

  const opacity = float(material.opacity ?? 1);
  let baseColor;
  if (material.map) {
    baseColor = texture(material.map, uvNode);
  } else {
    const c = material.color;
    baseColor = vec4(float(c.r), float(c.g), float(c.b), opacity);
  }

  // Dark glass needs a wet-bead brighten so drops read without relying only on specular.
  if (wetBrighten) {
    const wetTint = vec3(float(0.55), float(0.6), float(0.65));
    material.colorNode = vec4(
      mix(baseColor.rgb, wetTint, rainAmount.mul(wetBrighten)),
      baseColor.a,
    );
  } else {
    material.colorNode = baseColor;
  }

  if (material.emissiveMap) {
    material.emissiveNode = texture(material.emissiveMap, uvNode).rgb.mul(
      float(material.emissiveIntensity ?? 1),
    );
  } else if ((material.emissiveIntensity ?? 0) > 0) {
    const e = material.emissive;
    material.emissiveNode = vec3(float(e.r), float(e.g), float(e.b)).mul(
      float(material.emissiveIntensity ?? 1),
    );
  }

  material.needsUpdate = true;
}

/**
 * Applies animated rain streaks to car paint and glass via roughness + normal perturbation.
 */
export function applyCarSurfaceRain(carRoot) {
  const uniforms = createSurfaceRainUniforms();
  const convertedMaterials = new Set();
  let paintCount = 0;
  let glassCount = 0;

  carRoot.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    getMeshMaterials(child).forEach((material, materialIndex) => {
      const isGlass = isGlassMaterial(material);
      if (!isGlass && !isPaintMaterial(material)) {
        return;
      }

      const nodeMaterial = isGlass
        ? ensureGlassNodeMaterial(material)
        : ensurePaintNodeMaterial(material);
      if (isGlass) {
        applyGlassLook(nodeMaterial);
      }
      wireSurfaceRain(
        nodeMaterial,
        uniforms,
        isGlass
          ? {
              wetRoughness: uniforms.uGlassWetRoughness,
              normalStrength: uniforms.uGlassNormalStrength,
              wetBrighten: uniforms.uGlassWetBrighten,
            }
          : {
              wetRoughness: uniforms.uWetRoughness,
              normalStrength: uniforms.uNormalStrength,
            },
      );
      convertedMaterials.add(nodeMaterial);

      if (isGlass) {
        glassCount += 1;
      } else {
        paintCount += 1;
      }

      if (nodeMaterial !== material) {
        replaceMeshMaterial(child, materialIndex, nodeMaterial);
      }
    });
  });

  function update(delta) {
    uniforms.uTime.value += delta;
    uniforms.uTime.needsUpdate = true;
  }

  function setEnabled(enabled) {
    uniforms.uIntensity.value = enabled ? 1 : 0;
    uniforms.uIntensity.needsUpdate = true;
  }

  function setIntensity(value) {
    uniforms.uIntensity.value = value;
    uniforms.uIntensity.needsUpdate = true;
  }

  function dispose() {
    convertedMaterials.clear();
  }

  return {
    paintCount,
    glassCount,
    uniforms,
    update,
    setEnabled,
    setIntensity,
    dispose,
  };
}
