import { RENDER_MODES } from "./renderModes.js";

const WARMUP_FRAMES = 24;
const SAMPLE_FRAMES = 48;

function waitFrames(count) {
  return new Promise((resolve) => {
    let remaining = count;

    function tick() {
      remaining -= 1;

      if (remaining <= 0) {
        resolve();
        return;
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  });
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const mid = Math.floor(sorted.length / 2);

  return {
    frames: sorted.length,
    avgMs: total / sorted.length,
    p50Ms:
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid],
    p95Ms:
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    fps: 1000 / (total / sorted.length),
  };
}

/**
 * Compares frame times across FSR / DPR configurations.
 * Trigger with `?benchmark=fsr` in development.
 *
 * @param {{
 *   renderLoop: ReturnType<import("./adaptiveDprLoop.js").createAdaptiveDprLoop>,
 *   renderModeController: { setMode: (mode: string, options?: object) => void, getMode: () => string },
 *   pipeline: {
 *     applyFsrTuning: (tuning: object) => void,
 *     getScenePassResolutionScale: () => number,
 *     getFsrEnabled: () => boolean,
 *   },
 *   renderFrame: () => void,
 * }} deps
 */
export async function runFsrBenchmark(deps) {
  const { renderLoop, renderModeController, pipeline, renderFrame } = deps;

  const originalMode = renderModeController.getMode();
  const results = [];

  async function measureConfig(label, setup) {
    await setup();
    renderLoop.invalidate("fsr-benchmark", {
      frames: WARMUP_FRAMES + SAMPLE_FRAMES,
    });

    for (let i = 0; i < WARMUP_FRAMES; i += 1) {
      const start = performance.now();
      renderFrame();
      await waitFrames(1);
      void start;
    }

    const samples = [];

    for (let i = 0; i < SAMPLE_FRAMES; i += 1) {
      const start = performance.now();
      renderFrame();
      await waitFrames(1);
      samples.push(performance.now() - start);
    }

    const stats = summarize(samples.filter((value) => value > 0));
    const entry = {
      label,
      dpr: renderLoop.getDPR(),
      scenePassScale: pipeline.getScenePassResolutionScale(),
      fsrEnabled: pipeline.getFsrEnabled(),
      ...stats,
    };

    results.push(entry);
    console.info("[FSR benchmark]", entry);
  }

  console.info("[FSR benchmark] starting…");

  await measureConfig("ultra-dpr1-fsr-sharpen", async () => {
    renderModeController.setMode(RENDER_MODES.ultra, { userChoice: false });
    pipeline.applyFsrTuning({
      enabled: true,
      sharpness: 0.2,
      scenePassResolutionScale: 1,
    });
    renderLoop.setIdleMaxDPR(1, 0.95);
  });

  await measureConfig("ultra-dpr1-no-fsr", async () => {
    renderModeController.setMode(RENDER_MODES.ultra, { userChoice: false });
    pipeline.applyFsrTuning({
      enabled: false,
      sharpness: 2,
      scenePassResolutionScale: 1,
    });
    renderLoop.setIdleMaxDPR(1, 0.95);
  });

  await measureConfig("insane-native-capped-dpr", async () => {
    renderModeController.setMode(RENDER_MODES.insane, { userChoice: false });
    pipeline.applyFsrTuning({
      enabled: false,
      sharpness: 2,
      scenePassResolutionScale: 1,
    });
    renderLoop.setIdleMaxDPR(
      Math.min(1.5, window.devicePixelRatio || 1),
      0.95,
    );
  });

  renderModeController.setMode(originalMode, { userChoice: false });

  const table = results.map((entry) => ({
    label: entry.label,
    dpr: entry.dpr.toFixed(2),
    scenePass: entry.scenePassScale.toFixed(2),
    fsr: entry.fsrEnabled ? "on" : "off",
    avgMs: entry.avgMs.toFixed(2),
    fps: entry.fps.toFixed(1),
    p95Ms: entry.p95Ms.toFixed(2),
  }));

  console.table(table);
  console.info("[FSR benchmark] done");

  return results;
}

export function shouldRunFsrBenchmark() {
  if (!import.meta.env.DEV) {
    return false;
  }

  try {
    return new URLSearchParams(window.location.search).get("benchmark") === "fsr";
  } catch {
    return false;
  }
}
