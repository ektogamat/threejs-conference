import { FEATURES } from "../world/features.js";
import { createRainGlassIntro } from "../intro/createRainGlassIntro.js";
import { createIntroOverlay } from "../ui/intro/createIntroOverlay.js";

export function createIntroFlow({
  pipeline,
  renderer,
  post,
  loaderOverlay,
  revealAppUi,
}) {
  let rainGlassIntro = null;

  async function revealCanvas() {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderer.domElement.style.opacity = "1";
    renderer.domElement.style.zIndex = "14";
    post.render();
    await loaderOverlay.finish();
  }

  async function runIntroSequence() {
    rainGlassIntro = createRainGlassIntro({ pipeline });

    const introOverlay = createIntroOverlay({
      onStart: () => {
        void (async () => {
          const fadePromise = rainGlassIntro?.fadeOut({ duration: 1.2 });
          await fadePromise;
          rainGlassIntro?.destroy();
          rainGlassIntro = null;
          revealAppUi();
        })();
      },
    });

    await revealCanvas();
    introOverlay.playEnter();
  }

  async function enterAppWithoutIntro() {
    await revealCanvas();
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
  };
}
