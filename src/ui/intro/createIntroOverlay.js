import "./introOverlay.css";
import gsap from "gsap";

function splitIntoLetters(element, className = "intro-letter") {
  const text = element.textContent.trim();
  element.textContent = "";
  element.setAttribute("aria-label", text);

  return [...text].map((char) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = char === " " ? "\u00a0" : char;
    span.setAttribute("aria-hidden", "true");
    element.appendChild(span);
    return span;
  });
}

export function createIntroOverlay({ onStart } = {}) {
  const root = document.createElement("div");
  root.className = "intro-container";
  root.setAttribute("aria-hidden", "false");
  root.innerHTML = `
    <div class="intro-stack">
      <p class="intro-kicker">through the glass</p>
      <h1 class="intro-brand" aria-label="THREEJS-PUNK">
        <span class="intro-brand-line">THREEJS</span>
        <span class="intro-brand-line intro-brand-line--accent">PUNK</span>
      </h1>
      <p class="intro-rule" aria-hidden="true"></p>
      <p class="intro-tagline">A rain-soaked alley under neon.</p>
      <div class="intro-actions">
        <button type="button" class="intro-button" disabled>ENTER</button>
      </div>
      <p class="intro-credit">Anderson Mancini · Sunag</p>
    </div>
  `;

  const button = root.querySelector(".intro-button");
  const kicker = root.querySelector(".intro-kicker");
  const brandLines = [...root.querySelectorAll(".intro-brand-line")];
  const rule = root.querySelector(".intro-rule");
  const tagline = root.querySelector(".intro-tagline");
  const credit = root.querySelector(".intro-credit");

  document.body.appendChild(root);

  const brandLetters = brandLines.flatMap((line) =>
    splitIntoLetters(line, "intro-letter"),
  );

  let started = false;
  let enterTween = null;
  let exitTween = null;

  gsap.set(kicker, { opacity: 0, y: 12 });
  gsap.set(brandLetters, {
    opacity: 0,
    y: 28,
    filter: "blur(8px)",
  });
  gsap.set(rule, { scaleX: 0, opacity: 0 });
  gsap.set(tagline, { opacity: 0, y: 14 });
  gsap.set(button, { opacity: 0, y: 10 });
  gsap.set(credit, { opacity: 0, y: 8 });

  function playEnter() {
    enterTween?.kill();
    enterTween = gsap
      .timeline()
      .to(kicker, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: "power2.out",
      })
      .to(
        brandLetters,
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.9,
          ease: "power3.out",
          stagger: {
            each: 0.035,
            from: "start",
          },
        },
        "-=0.35",
      )
      .to(
        rule,
        {
          scaleX: 1,
          opacity: 1,
          duration: 0.75,
          ease: "power2.inOut",
        },
        "-=0.55",
      )
      .to(
        tagline,
        {
          opacity: 1,
          y: 0,
          duration: 0.75,
          ease: "power2.out",
        },
        "-=0.4",
      )
      .to(
        button,
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          ease: "power2.out",
          onComplete: () => {
            button.disabled = false;
          },
        },
        "-=0.25",
      )
      .to(
        credit,
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power2.out",
        },
        "-=0.35",
      );
  }

  function handleStart() {
    if (started || button.disabled) {
      return;
    }

    started = true;
    button.disabled = true;
    button.style.pointerEvents = "none";

    exitTween?.kill();
    exitTween = gsap.to(root, {
      opacity: 0,
      duration: 0.6,
      ease: "power1.out",
      onComplete: () => {
        root.remove();
      },
    });

    onStart?.();
  }

  button.addEventListener("click", handleStart);

  return {
    root,
    playEnter,
    destroy() {
      enterTween?.kill();
      exitTween?.kill();
      button.removeEventListener("click", handleStart);
      root.remove();
    },
  };
}
