// Edit position and target arrays to fine-tune each view.
// Dev workflow: orbit manually, then in the browser console run:
//   __app.camera.update(3)   — save current view into preset #3
//   __app.camera.capture()   — log snippet for a new preset
//   __app.camera.limits.copy(3)
//   __app.camera.limits.help() — orbit limit commands

/** Intro hold pose — not listed in the camera views panel. */
export const INTRO_CAMERA = {
  id: "15",
  position: [1.013, 1.161, 4.292],
  target: [-0.465, 1.433, 0.415],
};

export const CAMERA_PRESETS = [
  {
    id: "1",
    position: [1, 2.3, 4.996],
    target: [1, 2.5, 0.5],
    limits: {
      minDistance: 2.801,
      maxDistance: 4.5,
      minPolarAngle: 0.899,
      maxPolarAngle: 1.834,
      minAzimuthAngle: -0.253,
      maxAzimuthAngle: 0.811,
    },
  },
  {
    id: "2",
    position: [3, 2.1, 2.5],
    target: [1, 2.2, 1.2],
    limits: {
      minDistance: 0.195,
      maxDistance: 2.779,
      minPolarAngle: 1.154,
      maxPolarAngle: 1.623,
    },
  },
  {
    id: "3",
    position: [3.697, 1.921, 3.835],
    target: [1, 3, 1.39],
    limits: {
      minDistance: 3.797,
      maxDistance: 3.797,
      minPolarAngle: 0.506,
      maxPolarAngle: 1.917,
      minAzimuthAngle: -0.517,
      maxAzimuthAngle: 1.249,
    },
  },
  {
    id: "4",
    position: [-1.001, 2.083, -2.47],
    target: [1, 2, -1.75],
    limits: {
      minDistance: 0.793,
      maxDistance: 2.128,
      minPolarAngle: 1.532,
      maxPolarAngle: 1.574,
      minAzimuthAngle: -2.085,
      maxAzimuthAngle: 1.394,
    },
  },
  {
    id: "5",
    position: [-0.026, 2.114, -2.732],
    target: [1, 2.1, -2.31],
    limits: {
      minDistance: 0.689,
      maxDistance: 1.109,
      minPolarAngle: 1.558,
      maxPolarAngle: 1.558,
      minAzimuthAngle: -1.961,
      maxAzimuthAngle: 0.741,
    },
  },
  {
    id: "6",
    position: [3.726, 2, -1.543],
    target: [1, 2, 0.42],
    limits: {
      minDistance: 3.359,
      maxDistance: 3.359,
      minPolarAngle: 1.18,
      maxPolarAngle: 1.852,
      minAzimuthAngle: 2.134,
      maxAzimuthAngle: 2.268,
    },
  },
  {
    id: "7",
    position: [-1, 5.413, -2.71],
    target: [0, 5.4, -1.16],
    limits: {
      minDistance: 0.279,
      maxDistance: 2.054,
      minPolarAngle: 1.115,
      maxPolarAngle: 1.564,
    },
  },
  {
    id: "8",
    position: [-1, 6.3, -0.72],
    target: [0, 5.6, 0.08],
    limits: {
      minDistance: 0.131,
      maxDistance: 1.688,
      minPolarAngle: 0.652,
      maxPolarAngle: 1.936,
    },
  },
  {
    id: "9",
    position: [1, 5.799, 3.141],
    target: [1, 5.4, 0.09],
    limits: {
      minDistance: 3.077,
      maxDistance: 3.077,
      minPolarAngle: 1.354,
      maxPolarAngle: 1.928,
    },
  },
  {
    id: "10",
    position: [1, 4.9, -2.61],
    target: [0, 5.1, -0.83],
    limits: {
      minDistance: 1.262,
      maxDistance: 2.396,
      minPolarAngle: 0.822,
      maxPolarAngle: 1.841,
      minAzimuthAngle: 2.353,
      maxAzimuthAngle: 3.101,
    },
  },
  {
    id: "11",
    position: [3.976, 6.153, 4.665],
    target: [2, 3.3, 1.74],
    limits: {
      minPolarAngle: 0.891,
      maxPolarAngle: 0.891,
    },
  },
  {
    id: "12",
    position: [-1.024, 5.214, 4.369],
    target: [1, 3.2, 1.07],
    limits: {
      minDistance: 4.016,
      maxDistance: 4.5,
      minPolarAngle: 1.091,
      maxPolarAngle: 1.091,
      minAzimuthAngle: -0.81,
      maxAzimuthAngle: 1.485,
    },
  },
];
