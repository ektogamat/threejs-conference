import "./hudPanel.css";

const COMPACT_DELAY_S = 0.6;
const VITALS_PERCENT = 82;

const LIFE_RING_SVG = `
  <svg class="hud-life-ring" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="hudRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#a855f7" />
        <stop offset="50%" stop-color="#22d3ee" />
        <stop offset="100%" stop-color="#a855f7" />
      </linearGradient>
      <filter id="hudRingGlow">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(168,85,247,0.15)" stroke-width="2" />
    <circle
      cx="32"
      cy="32"
      r="28"
      fill="none"
      stroke="url(#hudRingGrad)"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-dasharray="132 44"
      stroke-dashoffset="0"
      filter="url(#hudRingGlow)"
      class="hud-life-ring-arc"
    />
    <g class="hud-life-ticks">
      ${Array.from({ length: 24 }, (_, i) => {
        const angle = (i * 360) / 24;
        const rad = (angle * Math.PI) / 180;
        const x1 = 32 + Math.cos(rad) * 24;
        const y1 = 32 + Math.sin(rad) * 24;
        const x2 = 32 + Math.cos(rad) * 27;
        const y2 = 32 + Math.sin(rad) * 27;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(34,211,238,0.5)" stroke-width="1" />`;
      }).join("")}
    </g>
    <path
      d="M32 38c-4-5-8-8-8-12a4 4 0 0 1 8 0 4 4 0 0 1 8 0c0 4-4 7-8 12z"
      fill="none"
      stroke="#22d3ee"
      stroke-width="1.5"
      stroke-linejoin="round"
      filter="url(#hudRingGlow)"
      class="hud-life-heart"
    />
  </svg>
`;

const SIGNAL_WAVE_SVG = `
  <svg class="hud-signal-icon" viewBox="0 0 24 12" aria-hidden="true">
    <rect x="0" y="8" width="2" height="4" fill="currentColor" rx="0.5" />
    <rect x="4" y="5" width="2" height="7" fill="currentColor" rx="0.5" />
    <rect x="8" y="2" width="2" height="10" fill="currentColor" rx="0.5" />
    <rect x="12" y="4" width="2" height="8" fill="currentColor" rx="0.5" />
    <rect x="16" y="0" width="2" height="12" fill="currentColor" rx="0.5" />
    <rect x="20" y="6" width="2" height="6" fill="currentColor" rx="0.5" />
  </svg>
`;

export function createHudPanel() {
  const root = document.createElement("div");
  root.className = "cyber-hud";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="cyber-hud-frame">
      <span class="cyber-hud-corner cyber-hud-corner--tl"></span>
      <span class="cyber-hud-corner cyber-hud-corner--tr"></span>
      <span class="cyber-hud-corner cyber-hud-corner--bl"></span>
      <span class="cyber-hud-corner cyber-hud-corner--br"></span>

      <div class="cyber-hud-inner">
        <div class="hud-avatar">
          ${LIFE_RING_SVG}
          <span class="hud-compact-value">${VITALS_PERCENT}%</span>
        </div>

        <div class="hud-stats">
          <div class="hud-vitals">
            <div class="hud-vitals-header">
              <span class="hud-label">VITALS</span>
              <span class="hud-value">${VITALS_PERCENT}%</span>
            </div>
            <div class="hud-gauge">
              <div class="hud-gauge-track">
                <div class="hud-gauge-fill" style="width: ${VITALS_PERCENT}%"></div>
              </div>
            </div>
          </div>

          <div class="hud-substats">
            <div class="hud-stat-chip">
              <span class="hud-stat-dot hud-stat-dot--energy"></span>
              <span class="hud-label">ENERGY</span>
              <span class="hud-value">64%</span>
            </div>
            <div class="hud-stat-chip">
              <span class="hud-stat-icon">${SIGNAL_WAVE_SVG}</span>
              <span class="hud-label">SIGNAL</span>
              <span class="hud-value">98%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  let walkControls = null;
  let moveTimer = 0;
  let compact = false;

  function setCompact(next) {
    if (compact === next) {
      return;
    }

    compact = next;
    root.classList.toggle("cyber-hud--compact", compact);
  }

  function update(delta) {
    if (!walkControls?.isActive()) {
      moveTimer = 0;
      setCompact(false);
      return;
    }

    if (walkControls.isMoving()) {
      moveTimer += delta;
      if (moveTimer >= COMPACT_DELAY_S) {
        setCompact(true);
      }
      return;
    }

    moveTimer = 0;
    setCompact(false);
  }

  function bindWalkControls(controls) {
    walkControls = controls;
    moveTimer = 0;
    setCompact(false);
  }

  return { root, update, bindWalkControls };
}
