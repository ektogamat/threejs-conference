import { Spherical, Vector3 } from "three/webgpu";

export const DEFAULT_ORBIT_LIMITS = {
  minDistance: 0.1,
  maxDistance: 4.5,
  minPolarAngle: 0,
  maxPolarAngle: Math.PI,
  minAzimuthAngle: Number.NEGATIVE_INFINITY,
  maxAzimuthAngle: Number.POSITIVE_INFINITY,
};

const LIMIT_KEYS = [
  "minDistance",
  "maxDistance",
  "minPolarAngle",
  "maxPolarAngle",
  "minAzimuthAngle",
  "maxAzimuthAngle",
];

const PAIR_KEYS = [
  ["minDistance", "maxDistance"],
  ["minPolarAngle", "maxPolarAngle"],
  ["minAzimuthAngle", "maxAzimuthAngle"],
];

const _twoPI = 2 * Math.PI;

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

export function getOrbitSpherical(camera, target) {
  const offset = new Vector3().subVectors(camera.position, target);
  const spherical = new Spherical().setFromVector3(offset);

  return {
    distance: round(spherical.radius),
    polarAngle: round(spherical.phi),
    azimuthAngle: round(spherical.theta),
  };
}

export function normalizeLimits(limits = {}) {
  const normalized = { ...limits };

  for (const [minKey, maxKey] of PAIR_KEYS) {
    const minValue = normalized[minKey];
    const maxValue = normalized[maxKey];

    if (
      typeof minValue === "number" &&
      typeof maxValue === "number" &&
      minValue > maxValue
    ) {
      normalized[minKey] = maxValue;
      normalized[maxKey] = minValue;
    }
  }

  return normalized;
}

export function applyOrbitLimits(
  controls,
  limits,
  defaults = DEFAULT_ORBIT_LIMITS,
) {
  if (!controls || !limits) {
    return;
  }

  const normalized = normalizeLimits(limits);

  for (const key of LIMIT_KEYS) {
    if (typeof normalized[key] === "number") {
      controls[key] = normalized[key];
    } else {
      controls[key] = defaults[key];
    }
  }
}

export function clearOrbitLimits(controls, defaults = DEFAULT_ORBIT_LIMITS) {
  if (!controls) {
    return;
  }

  for (const key of LIMIT_KEYS) {
    controls[key] = defaults[key];
  }
}

function formatLimitsBlock(limits) {
  if (!limits || Object.keys(limits).length === 0) {
    return "";
  }

  const normalized = normalizeLimits(limits);
  const lines = LIMIT_KEYS.filter(
    (key) => typeof normalized[key] === "number",
  ).map((key) => `      ${key}: ${normalized[key]},`);

  if (lines.length === 0) {
    return "";
  }

  return `    limits: {\n${lines.join("\n")}\n    },`;
}

export function formatPresetSnippet({ id, position, target, limits } = {}) {
  const limitsBlock = formatLimitsBlock(limits);
  const limitsSection = limitsBlock ? `\n${limitsBlock}` : "";

  return `  {
    id: "${id}",
    position: [${position.map(round).join(", ")}],
    target: [${target.map(round).join(", ")}],${limitsSection}
  },`;
}

export function radToDeg(radians) {
  return round((radians * 180) / Math.PI, 1);
}

function clampScalar(value, min, max) {
  let clamped = value;

  if (typeof min === "number") {
    clamped = Math.max(clamped, min);
  }

  if (typeof max === "number") {
    clamped = Math.min(clamped, max);
  }

  return clamped;
}

function clampAzimuthAngle(theta, minAzimuthAngle, maxAzimuthAngle) {
  if (
    typeof minAzimuthAngle !== "number" &&
    typeof maxAzimuthAngle !== "number"
  ) {
    return theta;
  }

  let min =
    typeof minAzimuthAngle === "number"
      ? minAzimuthAngle
      : Number.NEGATIVE_INFINITY;
  let max =
    typeof maxAzimuthAngle === "number"
      ? maxAzimuthAngle
      : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return theta;
  }

  if (min < -Math.PI) {
    min += _twoPI;
  } else if (min > Math.PI) {
    min -= _twoPI;
  }

  if (max < -Math.PI) {
    max += _twoPI;
  } else if (max > Math.PI) {
    max -= _twoPI;
  }

  if (min <= max) {
    return Math.max(min, Math.min(max, theta));
  }

  return theta > (min + max) / 2
    ? Math.max(min, theta)
    : Math.min(max, theta);
}

export function clampViewToLimits(
  view,
  limits,
  defaults = DEFAULT_ORBIT_LIMITS,
) {
  if (!view?.position || !view?.target || !limits) {
    return view;
  }

  const target = new Vector3(...view.target);
  const offset = new Vector3(...view.position).sub(target);
  const spherical = new Spherical().setFromVector3(offset);
  const normalized = normalizeLimits(limits);

  spherical.theta = clampAzimuthAngle(
    spherical.theta,
    normalized.minAzimuthAngle,
    normalized.maxAzimuthAngle,
  );
  spherical.phi = clampScalar(
    spherical.phi,
    normalized.minPolarAngle,
    normalized.maxPolarAngle,
  );
  spherical.makeSafe();
  spherical.radius = clampScalar(
    spherical.radius,
    normalized.minDistance,
    normalized.maxDistance,
  );

  const clampedOffset = new Vector3().setFromSpherical(spherical);
  const clampedPosition = target.clone().add(clampedOffset);

  return {
    ...view,
    position: [
      round(clampedPosition.x),
      round(clampedPosition.y),
      round(clampedPosition.z),
    ],
    target: [...view.target],
    limits: view.limits ? { ...view.limits } : undefined,
  };
}

export function normalizePresetView(preset) {
  if (!preset?.limits) {
    return preset;
  }

  const clamped = clampViewToLimits(preset, preset.limits);
  return {
    ...preset,
    position: clamped.position,
    target: clamped.target,
  };
}

export function getPresetViewForAnimation(preset) {
  return normalizePresetView(preset);
}
