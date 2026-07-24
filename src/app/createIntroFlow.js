import { FEATURES } from "../world/features.js";
import { createRainGlassIntro } from "../intro/createRainGlassIntro.js";
import { createIntroOverlay } from "../ui/intro/createIntroOverlay.js";
import { createPerformanceNotice } from "../ui/intro/createPerformanceNotice.js";

export function createIntroFlow({
  pipeline,
  renderer,
  loaderOverlay,
  revealAppUi,
  world,
}) {
  let rainGlassIntro = null;
  let introActive = false;

  function setIntroWorldPaused(paused) {
    if (!world) {
      return;
    }

    for (const emitter of world.smoke?.emitters ?? []) {
      emitter.mesh.visible = !paused;
    }
  }

  async function revealCanvas() {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderer.domElement.style.opacity = "1";
    renderer.domElement.style.zIndex = "14";
    await loaderOverlay.finish();
  }

  async function runIntroSequence() {
    introActive = true;
    setIntroWorldPaused(true);
    // Block look / pointer-lock while the glass + title are up. Overlay uses
    // pointer-events: none except the ENTER button, so clicks would otherwise
    // hit the canvas under it (walk is already active for pose stability).
    renderer.domElement.style.pointerEvents = "none";
    rainGlassIntro = createRainGlassIntro({ pipeline });

    const introOverlay = createIntroOverlay({
      onStart: async () => {
        // 1) text already faded via playExit
        // 2) show notice while glass is still fully on
        const notice = createPerformanceNotice();
        notice.show();
        await new Promise((resolve) => setTimeout(resolve, 450));

        // 3) fade glass, then restore DoF / lensflare / dispose pass
        await rainGlassIntro?.fadeOut({ duration: 1.2 });
        rainGlassIntro?.destroy();
        rainGlassIntro = null;
        introActive = false;
        setIntroWorldPaused(false);

        // Keep the notice up after the graph restore so the hitch is covered.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await notice.hide();
        notice.destroy();
        renderer.domElement.style.pointerEvents = "auto";
        revealAppUi();
      },
    });

    await revealCanvas();
    introOverlay.playEnter();
  }

  async function enterAppWithoutIntro() {
    await revealCanvas();
    renderer.domElement.style.pointerEvents = "auto";
    revealAppUi();
  }

  async function run() {
    if (FEATURES.intro) {
      await runIntroSequence();
    } else {
      await enterAppWithoutIntro();
    }
  }

  return {
    run,
    getRainGlassIntro: () => rainGlassIntro,
    isIntroActive: () => introActive,
  };
}
