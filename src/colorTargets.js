const CABINET_PALETTE = [
  "#656c73",
  "#bcc3c9",
  "#ffffff",
  "#9c27b0",
  "#f44336",
  "#2196f3",
  "#4caf50",
  "#ff9800",
  "#795548",
];

const CABINET_DEFAULT_INDEX = 2;

const CABINET_MATERIAL_PROPS = {
  roughness: 0.7,
  metalness: 0.5,
  duration: 1.5,
  angleNoiseScale: 0.5,
  angleNoiseStrength: 0.5,
};

export const PAINT_TARGETS = {
  cabines_top_1: {
    meshName: "cabines_top_1",
    palette: CABINET_PALETTE,
    defaultIndex: CABINET_DEFAULT_INDEX,
    transition: "splash",
    materialProps: CABINET_MATERIAL_PROPS,
  },
  cabines_top_3: {
    meshName: "cabines_top_3",
    palette: CABINET_PALETTE,
    defaultIndex: CABINET_DEFAULT_INDEX,
    transition: "splash",
    materialProps: CABINET_MATERIAL_PROPS,
  },
  cabines_bottom: {
    meshName: "cabines_bottom",
    palette: CABINET_PALETTE,
    defaultIndex: 0,
    transition: "splash",
    materialProps: CABINET_MATERIAL_PROPS,
  },
  walls_front: {
    meshName: "walls_front",
    palette: CABINET_PALETTE,
    defaultIndex: CABINET_DEFAULT_INDEX,
    transition: "splash",
    materialProps: CABINET_MATERIAL_PROPS,
  },
  walls_right: {
    meshName: "walls_right",
    palette: CABINET_PALETTE,
    defaultIndex: CABINET_DEFAULT_INDEX,
    transition: "splash",
    materialProps: CABINET_MATERIAL_PROPS,
  },
  cube038: {
    meshName: "Cube038",
    palette: CABINET_PALETTE,
    defaultIndex: CABINET_DEFAULT_INDEX,
    transition: "splash",
    materialProps: CABINET_MATERIAL_PROPS,
  },
  cube017: {
    meshName: "Cube017",
    palette: CABINET_PALETTE,
    defaultIndex: CABINET_DEFAULT_INDEX,
    transition: "splash",
    materialProps: CABINET_MATERIAL_PROPS,
  },
  cube036: {
    meshName: "Cube036",
    palette: CABINET_PALETTE,
    defaultIndex: CABINET_DEFAULT_INDEX,
    transition: "splash",
    materialProps: {
      ...CABINET_MATERIAL_PROPS,
      metalness: 0,
      tintMap: true,
    },
  },
  island: {
    meshName: "island",
    palette: ["#ffffff", "#656c73", "#41876c", "#bd9e6a"],
    defaultIndex: 0,
    transition: "splash",
    materialProps: {
      roughness: 0.1,
      metalness: 0,
      tintMap: true,
      duration: 1.5,
      angleNoiseScale: 0.5,
      angleNoiseStrength: 0.5,
    },
  },
  piso: {
    meshName: "Cube",
    palette: ["#ffffff", "#656c73"],
    defaultIndex: 0,
    transition: "splash",
    materialProps: {
      roughness: 0.2,
      metalness: 0,
      tintMap: true,
      duration: 1.5,
      angleNoiseScale: 0.5,
      angleNoiseStrength: 0.5,
    },
  },
};

const MESH_NAME_TO_TARGET = Object.fromEntries(
  Object.entries(PAINT_TARGETS).map(([key, target]) => [target.meshName, key]),
);

export function getPaintTargetKey(meshName) {
  return MESH_NAME_TO_TARGET[meshName] ?? null;
}

export function getPaintTarget(targetKey) {
  return PAINT_TARGETS[targetKey] ?? null;
}

export function getPalette(targetKey) {
  return getPaintTarget(targetKey)?.palette ?? [];
}

export function isPaintableMesh(meshName) {
  return meshName in MESH_NAME_TO_TARGET;
}

export function resolvePaintTargetKeyFromObject(object) {
  let node = object;

  while (node) {
    const key = getPaintTargetKey(node.name);
    if (key) {
      return key;
    }
    node = node.parent;
  }

  return null;
}
