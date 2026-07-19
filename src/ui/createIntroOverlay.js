import "./introOverlay.css";
import gsap from "gsap";

function splitIntoLetters(element, className = "intro-letter") {
  const text = element.textContent.trim();
  element.textContent = "";
  element.setAttribute("aria-label", text);

  return [...text].map((char) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = char;
    span.setAttribute("aria-hidden", "true");
    element.appendChild(span);
    return span;
  });
}

function splitIntoWords(element, className = "intro-word") {
  const words = element.textContent.trim().split(/\s+/);
  element.textContent = "";
  element.setAttribute("aria-label", words.join(" "));

  return words.map((word, index) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = word;
    span.setAttribute("aria-hidden", "true");
    element.appendChild(span);

    if (index < words.length - 1) {
      element.appendChild(document.createTextNode(" "));
    }

    return span;
  });
}

export function createIntroOverlay({ onStart } = {}) {
  const root = document.createElement("div");
  root.className = "intro-container";
  root.setAttribute("aria-hidden", "false");
  root.innerHTML = `
    <h2 class="intro-sub-title">LUMEN</h2>
    <h1 class="intro-main-title">DECORATION EXPERIENCE BY ANDERSON MANCINI</h1>
    <div class="intro-loading">
      <button type="button" class="intro-button" disabled>START</button>
    </div>
  `;

  const button = root.querySelector(".intro-button");
  const title = root.querySelector(".intro-main-title");
  const subTitle = root.querySelector(".intro-sub-title");

  document.body.appendChild(root);

  const lumenLetters = splitIntoLetters(subTitle);
  const titleWords = splitIntoWords(title);

  let started = false;
  let enterTween = null;
  let exitTween = null;

  gsap.set(lumenLetters, {
    opacity: 0,
    y: 22,
    scale: 0.94,
    filter: "blur(5px)",
  });
  gsap.set(titleWords, { opacity: 0, y: 10 });
  gsap.set(button, { opacity: 0, y: 8 });

  function playEnter() {
    enterTween?.kill();
    enterTween = gsap
      .timeline()
      .to(lumenLetters, {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        duration: 0.95,
        ease: "power3.out",
        stagger: {
          each: 0.09,
          from: "start",
        },
      })
      .to(
        titleWords,
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: "power2.out",
          stagger: {
            each: 0.06,
            from: "start",
          },
        },
        "-=0.45",
      )
      .to(
        button,
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power2.out",
          onComplete: () => {
            button.disabled = false;
          },
        },
        "-=0.2",
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
