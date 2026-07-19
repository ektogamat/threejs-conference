import * as THREE from "three/webgpu";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import {
  uniform,
  vec2,
  float,
  sin,
  cos,
  screenUV,
  atan,
  dot,
  fract,
  floor,
  mix,
  clamp,
  smoothstep,
  add,
  sub,
  mul,
  Fn,
  OnMaterialUpdate,
  texture,
  uv,
} from "three/tsl";
import gsap from "gsap";

function getResolution(renderer) {
  const dpr = Math.min(window.devicePixelRatio, 1);
  return new THREE.Vector2(
    renderer.domElement.clientWidth * dpr,
    renderer.domElement.clientHeight * dpr,
  );
}

function buildSplashColorNode({
  prevColor,
  newColor,
  resolution,
  angleNoiseScale,
  angleNoiseStrength,
  map = null,
  tintMap = false,
}) {
  return Fn(() => {
    const uProgress = uniform(0.0);
    const uPrevColor = uniform(prevColor);
    const uNewColor = uniform(newColor);
    const uResolution = uniform(resolution.clone());
    const uCenter = uniform(new THREE.Vector2(0.5, 0.5));
    const uAngleNoiseScale = uniform(angleNoiseScale);
    const uAngleNoiseStrength = uniform(angleNoiseStrength);
    const uHoverBoost = uniform(1.0);

    OnMaterialUpdate(({ material }) => {
      if (material.userData.transitionColor) {
        newColor.set(material.userData.transitionColor);
        uNewColor.value.copy(newColor);
      }
      if (material.userData.prevColor) {
        prevColor.copy(material.userData.prevColor);
        uPrevColor.value.copy(prevColor);
      }
      if (material.userData.progress !== undefined) {
        uProgress.value = material.userData.progress;
      }
      if (material.userData.center) {
        uCenter.value.set(
          material.userData.center[0],
          material.userData.center[1],
        );
      }
      if (material.userData.resolution) {
        uResolution.value.copy(material.userData.resolution);
      }
      if (material.userData.angleNoiseScale !== undefined) {
        uAngleNoiseScale.value = material.userData.angleNoiseScale;
      }
      if (material.userData.angleNoiseStrength !== undefined) {
        uAngleNoiseStrength.value = material.userData.angleNoiseStrength;
      }
      if (material.userData.hoverBoost !== undefined) {
        uHoverBoost.value = material.userData.hoverBoost;
      }
    });

    const rand2 = (n) =>
      fract(sin(dot(n, vec2(12.9898, 4.1414))).mul(43758.5453));

    const noise = (p) => {
      const ip = floor(p);
      const u = p.sub(ip);
      const u2 = u.mul(u).mul(sub(float(3.0), u.mul(2.0)));
      const mix1 = mix(rand2(ip), rand2(ip.add(vec2(1.0, 0.0))), u2.x);
      const mix2 = mix(
        rand2(ip.add(vec2(0.0, 1.0))),
        rand2(ip.add(vec2(1.0, 1.0))),
        u2.x,
      );
      return mix(mix1, mix2, u2.y);
    };

    const fbm = (p, octaves) => {
      let n = float(0.0);
      let a = float(1.0);
      let norm = float(0.0);
      let pp = p;
      for (let i = 0; i < octaves; i++) {
        n = add(n, noise(pp).mul(a));
        norm = add(norm, a);
        pp = pp.mul(2.0);
        a = a.mul(0.5);
      }
      return n.div(norm);
    };

    const suv = screenUV;
    const centeredUV = suv.sub(uCenter);
    const aspect = uResolution.y.div(uResolution.x);
    const uvScaled = vec2(centeredUV.x, centeredUV.y.mul(aspect));

    const angle = atan(uvScaled.y, uvScaled.x).add(
      fbm(uvScaled.mul(uAngleNoiseScale), 2).mul(uAngleNoiseStrength),
    );
    const p = vec2(cos(angle), sin(angle));

    let t = uProgress;
    t = t.mul(t).mul(1.05);
    const tSafe = clamp(t, 0.001, 1.0);

    let l = dot(uvScaled.div(tSafe), uvScaled.div(tSafe));
    l = sub(l, fbm(uvScaled.mul(30.0), 8).mul(0.5).sub(0.25));

    const ink = fbm(p.mul(8.0), 1).add(1.05).sub(l);
    const inkClamped = clamp(ink, 0.0, 1.0);

    const finalProgress = mix(
      inkClamped,
      float(1.0),
      smoothstep(0.95, 1.0, uProgress),
    );

    const transitionColor = mix(uPrevColor, uNewColor, finalProgress);
    const baseColor =
      tintMap && map
        ? transitionColor.mul(texture(map, uv()))
        : transitionColor;

    return baseColor.mul(uHoverBoost);
  });
}

export function createSplashTransitionMaterial({
  initialColor = "#ffffff",
  map = null,
  tintMap = false,
  roughness = 0.7,
  metalness = 0.5,
  center = [0.5, 0.5],
  duration = 1.5,
  angleNoiseScale = 0.5,
  angleNoiseStrength = 0.5,
  renderer,
  onInvalidate,
  onAnimLifecycle,
} = {}) {
  const prevColor = new THREE.Color(initialColor);
  const newColor = new THREE.Color(initialColor);
  const resolution = getResolution(renderer);
  const useMapTint = tintMap && map;

  const colorNode = buildSplashColorNode({
    prevColor,
    newColor,
    resolution,
    angleNoiseScale,
    angleNoiseStrength,
    map,
    tintMap: useMapTint,
  })();

  const material = new MeshPhysicalNodeMaterial({
    colorNode,
    map: useMapTint ? null : map,
    roughness,
    metalness,
  });

  material.userData.transitionColor = initialColor;
  material.userData.prevColor = prevColor.clone();
  material.userData.progress = 1;
  material.userData.center = [...center];
  material.userData.resolution = resolution.clone();
  material.userData.angleNoiseScale = angleNoiseScale;
  material.userData.angleNoiseStrength = angleNoiseStrength;
  material.userData.hoverBoost = 1;

  let isAnimating = false;
  let animationTween = null;
  let invalidateFrames = 0;
  let colorQueue = [];
  let animationDuration = duration;

  function requestInvalidate(options) {
    onInvalidate?.(options);
  }

  function tickInvalidateLoop() {
    if (invalidateFrames <= 0) {
      return;
    }

    invalidateFrames--;
    requestInvalidate();

    if (invalidateFrames > 0) {
      requestAnimationFrame(tickInvalidateLoop);
    }
  }

  function startInvalidateFrames(count) {
    invalidateFrames = count;
    requestInvalidate();
    requestAnimationFrame(tickInvalidateLoop);
  }

  function processColorQueue() {
    if (colorQueue.length === 0 || isAnimating) {
      return;
    }

    const nextColor = colorQueue.shift();
    if (!nextColor) {
      return;
    }

    isAnimating = true;
    newColor.set(nextColor);
    material.userData.transitionColor = nextColor;
    material.userData.prevColor = prevColor.clone();

    const totalFrames = Math.ceil(animationDuration * 60) + 5;
    startInvalidateFrames(totalFrames);
    onAnimLifecycle?.({ type: "start", duration: animationDuration });

    if (animationTween) {
      animationTween.kill();
    }

    material.userData.progress = 0;
    animationTween = gsap.fromTo(
      material.userData,
      { progress: 0 },
      {
        progress: 1,
        duration: animationDuration,
        ease: "power1.out",
        onUpdate: requestInvalidate,
        onComplete: () => {
          onAnimLifecycle?.({ type: "complete" });
          prevColor.copy(newColor);
          material.userData.prevColor = prevColor.clone();
          isAnimating = false;
          animationTween = null;
          processColorQueue();
        },
      },
    );
  }

  function addColorToQueue(color) {
    if (!isAnimating) {
      colorQueue = [color];
      processColorQueue();
      return;
    }

    if (colorQueue.length > 0 && colorQueue[colorQueue.length - 1] === color) {
      return;
    }

    if (colorQueue.length >= 2) {
      colorQueue = [colorQueue[colorQueue.length - 1], color];
    } else {
      colorQueue.push(color);
    }
  }

  function setTransitionColor(color, { center: nextCenter } = {}) {
    if (nextCenter) {
      material.userData.center = [...nextCenter];
    }
    addColorToQueue(color);
  }

  function setCenter(nextCenter) {
    material.userData.center = [...nextCenter];
    requestInvalidate();
  }

  function setHovered(hovered) {
    material.userData.hoverBoost = hovered ? 1.5 : 1;
    requestInvalidate({ frames: 6 });
  }

  function setInitialColor(color, { skipAnimation = true } = {}) {
    prevColor.set(color);
    newColor.set(color);
    material.userData.transitionColor = color;
    material.userData.prevColor = prevColor.clone();
    material.userData.progress = 1;
    colorQueue = [];
    isAnimating = false;
    if (animationTween) {
      animationTween.kill();
      animationTween = null;
    }
    if (!skipAnimation) {
      addColorToQueue(color);
    } else {
      requestInvalidate();
    }
  }

  function handleResize() {
    const nextResolution = getResolution(renderer);
    material.userData.resolution.copy(nextResolution);
    resolution.copy(nextResolution);
    requestInvalidate();
  }

  function dispose() {
    if (animationTween) {
      animationTween.kill();
      animationTween = null;
    }
    colorQueue = [];
    material.dispose();
  }

  return {
    material,
    setTransitionColor,
    setCenter,
    setHovered,
    setInitialColor,
    handleResize,
    dispose,
  };
}
