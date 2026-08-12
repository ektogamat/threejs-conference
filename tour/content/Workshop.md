<page name="Three.js Punk">

<page name="The Cyberpunk Scene">

We import the `threejs-punk/scene` script, which configures:

- **WebGPU Renderer & Scene**: A night sky backdrop and directional neon lighting.
- **Mesh Loading**: Streams the city mesh (`cyberpunk_compressed.glb`), the player bounds collider (`colider.glb`), and the sports car (`quadra.glb`).
- **OrbitControls**: Lets you drag to orbit the camera, scroll to zoom, and right-click drag to pan.

Run the code to view the scene:

```tsl
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';
```

> [!TIP]
>
> - Click and drag the left mouse button to rotate around the city street.
> - Use the scroll wheel to zoom in and out.
> - Click and drag the right mouse button to pan.

</page>

<page name="Ground">

<page name="Creating the Ground">

Explain about ripple

```tsl ripple
import * as THREE from 'three';
import 'threejs-punk/scene';

const textureLoader = new THREE.TextureLoader();

albedoMap = textureLoader.load( '/textures/wet-puddles-albedo.jpg' );
albedoMap.wrapS = THREE.RepeatWrapping;
albedoMap.wrapT = THREE.RepeatWrapping;
albedoMap.colorSpace = THREE.SRGBColorSpace;
albedoMap.repeat.set( 15, 15 );

roughnessMap = textureLoader.load( '/textures/wet-puddles-roughness.jpg' );
roughnessMap.wrapS = THREE.RepeatWrapping;
roughnessMap.wrapT = THREE.RepeatWrapping;
roughnessMap.repeat.set( 15, 15 );

normalMapTex = textureLoader.load( '/textures/wet-puddles-normal.jpg' );
normalMapTex.wrapS = THREE.RepeatWrapping;
normalMapTex.wrapT = THREE.RepeatWrapping;
normalMapTex.repeat.set( 15, 15 );

const material = new THREE.MeshStandardNodeMaterial( {
    map: albedoMap,
    roughnessMap: roughnessMap,
    roughness: 0.55,
    metalness: 0.0
} );

const geometry = new THREE.PlaneGeometry( 400, 400 );
const ground = new THREE.Mesh( geometry, material );
ground.rotation.x = - Math.PI / 2;
ground.position.y = - 5.4;
ground.receiveShadow = true;

scene.add( ground );
```

</page>

<page name="Rain ripples">

Post processing example

```tsl
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';
```

</page>

</page>

<page name="Post-Processing">

Post-processing means we render the scene first, then change the image with TSL nodes. We connect those nodes to `renderPipeline.outputNode`.

We build the effect in small steps. Each step adds one idea. Run the code after every step and compare the result.

<page name="Bloom">

Bloom makes bright areas glow. It is perfect for neon signs and headlights in a night city.

**Step 1** — Render the scene into a pass.

**Step 2** — Run the `bloom()` node on that pass.

**Step 3** — Add the bloom back on top of the original image.

```tsl postprocessingBloom
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';

// 1. Render the scene once
const mainPass = pass( scene, camera );

// 2. Bloom: strength, radius, threshold (only bright pixels glow)
const bloomPass = bloom( mainPass, 0.2, 0.4, 0.35 );

// 3. Add glow on top of the normal image
renderPipeline.outputNode = mainPass.add( bloomPass );
renderPipeline.needsUpdate = true;
```

### Try this

1. Make the glow much stronger, then much weaker. Which number did you change?
2. Set `threshold` to `0`. What happens to the street and the rain?
3. Raise `threshold` until only the neon signs glow.

</page>

<page name="Lens Flare">

Lens flare creates light ghosts from very bright spots. It uses the bloom result, so we chain it after bloom.

**Step 1** — Keep bloom from the previous step.

**Step 2** — Pass the bloom texture into `lensflare()`.

**Step 3** — Add a soft flare layer on top of the scene + bloom.

```tsl postprocessingLensflare
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';

const mainPass = pass( scene, camera );
const bloomPass = bloom( mainPass, 0.2, 0.4, 0.35 );

// Flare reads the bloom texture (bright areas only)
const flarePass = lensflare( bloomPass, {
	threshold: 0.1,
	ghostSpacing: 0.2,
	ghostAttenuationFactor: 35
} );

renderPipeline.outputNode = mainPass.add( bloomPass ).add( flarePass.mul( 0.6 ) );
renderPipeline.needsUpdate = true;
```

### Try this

1. Change `flarePass.mul( 0.6 )` to `0` and to `2`. Watch the ghosts.
2. Change `ghostSpacing`. Do the ghosts move closer or farther?
3. Why do we pass `bloomPass` into `lensflare()`, not `mainPass`? (Hint: flare wants only bright pixels.)

</page>

<page name="Anti-Aliasing">

SMAA smooths jagged edges on neon lines and building silhouettes. Run it after bloom and flare. Film grain comes later, after SMAA. If grain runs first, SMAA can treat the noise as edges.

**Step 1** — Build the full image (scene + bloom + flare).

**Step 2** — Wrap it with `smaa()`.

```tsl postprocessingSmaa
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';

const mainPass = pass( scene, camera );
const bloomPass = bloom( mainPass, 0.2, 0.4, 0.35 );
const flarePass = lensflare( bloomPass, {
	threshold: 0.1,
	ghostSpacing: 0.2,
	ghostAttenuationFactor: 35
} );

const beauty = mainPass.add( bloomPass ).add( flarePass.mul( 0.6 ) );

// SMAA after bloom and flare. Grain comes after SMAA (next step)
renderPipeline.outputNode = smaa( beauty );
renderPipeline.needsUpdate = true;
```

### Try this

1. Comment out `smaa()` and look at neon edges. Put it back.
2. Try `smaa( bloomPass )` only (wrong input). Why does the rest of the image look bad?
3. Do not add film grain on this page yet. Grain comes in the next step.

</page>

<page name="Cinematic Color Grade">

This step gives the cyberpunk mood: color tint, chromatic aberration at the edges, vignette, and film grain.

**Step 1** — Sample the scene color and split RGB slightly at the screen edges (chromatic aberration).

**Step 2** — Tint and boost saturation.

**Step 3** — Add bloom + flare, then darken the corners (vignette).

**Step 4** — Run SMAA, then add film grain last.

```tsl postprocessingColorGrade
import { pass, screenUV, vec2, vec3, vec4, float, smoothstep, length, saturation } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';

const mainPass = pass( scene, camera );
const mainColor = mainPass.getTextureNode( 'output' );

// Bloom + lens flare (same as before)
const bloomPass = bloom( mainPass, 0.2, 0.4, 0.35 );
const flarePass = lensflare( bloomPass, {
	threshold: 0.1,
	ghostSpacing: 0.2,
	ghostAttenuationFactor: 35
} );
const glow = bloomPass.add( flarePass.mul( 0.6 ) );

// 1. Chromatic aberration — RGB channels shift a little at the edges
const center = vec2( 0.5, 0.5 );
const toCenter = screenUV.sub( center );
const edgeMask = smoothstep( 0.2, 0.85, length( toCenter ).mul( 1.6 ) );
const shift = toCenter.mul( edgeMask ).mul( 0.012 );

const r = mainColor.sample( screenUV.add( shift ) ).r;
const g = mainColor.sample( screenUV ).g;
const b = mainColor.sample( screenUV.sub( shift ) ).b;
const a = mainColor.sample( screenUV ).a;

// 2. Neon tint + a bit more saturation
const tint = vec3( 1.02, 0.9, 1.06 );
let graded = vec4( saturation( vec3( r, g, b ).mul( tint ), 1.08 ), a );

// 3. Add glow, then vignette (darker corners)
graded = vec4( graded.rgb.add( glow.rgb ), graded.a );

const vigDist = length( screenUV.sub( center ) ).mul( 1.6 );
const vigFactor = float( 1 ).sub( smoothstep( 0.64, 1.0, vigDist ).mul( 0.75 ) );
graded = vec4( graded.rgb.mul( vigFactor ), graded.a );

// 4. SMAA first, then film grain (grain after AA so noise is not treated as edges)
const aa = smaa( graded );
renderPipeline.outputNode = film( aa, 0.15 );
renderPipeline.needsUpdate = true;
```

### Try this

1. Change the tint toward teal (`0.9, 1.0, 1.1`), then toward magenta.
2. Raise vignette until the corners are almost black. Then turn it off (`mul( 0 )` on the vignette strength).
3. Put `film()` **before** `smaa()`. Compare. Put grain back after SMAA.
4. Extra: use `hue()` or `grayscale()` from `three/tsl` on the graded color before SMAA.

</page>

<page name="Your turn">

You have the full pipeline. Now make it yours.

**Stay in the playground**

Combine all steps and invent a look:

- **Silent Hill** — low saturation, more grain, strong vignette
- **Neon night** — more bloom, magenta tint, soft flare

**If you finish early**

Open the Three.js examples and try **one** extra display node. Good choices:

- `gaussianBlur` from `three/addons/tsl/display/GaussianBlurNode.js`
- `sepia` from `three/addons/tsl/display/Sepia.js`

Examples: [threejs.org/examples/?q=post](https://threejs.org/examples/?q=post)

**Rule:** add any new effect **before** `smaa()`. Put film grain **after** `smaa()`.

</page>

</page>

<page name="Final Optimization">

Post effects can be expensive because they blur many pixels. Some nodes let you render **inside** the effect at lower resolution. The final image on screen stays full size.

Keep full resolution for the main scene, color grade, and SMAA. Use lower resolution inside bloom, flare, and the ground reflector.

<page name="Bloom resolution">

Bloom runs many blur passes. You can make those passes smaller with `setResolutionScale()`.

- `1.0` — full resolution (sharper glow, slower)
- `0.5` — half width and height (4x fewer pixels, usually looks fine for glow)
- `0.25` — very fast, glow may look blocky

```tsl optimizationBloom
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';

const mainPass = pass( scene, camera );
const bloomPass = bloom( mainPass, 0.2, 0.4, 0.35 );

// Half resolution inside bloom only — main scene stays sharp
bloomPass.setResolutionScale( 0.5 );

const flarePass = lensflare( bloomPass, {
	threshold: 0.1,
	ghostSpacing: 0.2,
	ghostAttenuationFactor: 35
} );

renderPipeline.outputNode = mainPass.add( bloomPass ).add( flarePass.mul( 0.6 ) );
renderPipeline.needsUpdate = true;
```

### Try this

1. Try `1.0`, then `0.5`, then `0.25`. Which looks best?
2. The street and buildings should stay sharp. Only the glow changes. Why?

</page>

<page name="Lens flare resolution">

Lens flare also renders into a smaller buffer. Use `downSampleRatio` in the `lensflare()` options.

- `1` — full buffer size (sharper flare, slower)
- `4` — default, buffer is 1/4 screen size
- `8` — even smaller and faster, may look softer

```tsl optimizationFlare
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';

const mainPass = pass( scene, camera );
const bloomPass = bloom( mainPass, 0.2, 0.4, 0.35 );
bloomPass.setResolutionScale( 0.5 );

const flarePass = lensflare( bloomPass, {
	threshold: 0.1,
	ghostSpacing: 0.2,
	ghostAttenuationFactor: 35,
	downSampleRatio: 4
} );

renderPipeline.outputNode = mainPass.add( bloomPass ).add( flarePass.mul( 0.6 ) );
renderPipeline.needsUpdate = true;
```

### Try this

1. Set `downSampleRatio` to `1`. Is the flare sharper? Is it worth it?
2. Set it to `8`. Do you see quality loss?
3. Keep bloom at `0.5` and flare at `4`. This is a good balance for a night city.

</page>

<page name="Ground reflection">

The wet ground uses `reflector()`. It draws the city **again** every frame into a mirror buffer. At full size (`resolutionScale: 1.0`) this is very expensive.

This example keeps bloom and flare from the previous steps, with their resolution settings. Then we tune the ground on top.

Use `setReflectionScale()` to make the mirror buffer smaller:

- `1.0` — full size (sharpest reflection, slowest)
- `0.5` — half width and height (4x fewer pixels, puddles still look wet)
- `0.25` — even faster, reflection may look softer

`hashBlur` softens the reflection for a dirty wet look. It samples many times per pixel. It is **off** by default here — turn it on only if you want that look and can afford the cost.

```tsl optimizationGround
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import 'threejs-punk/scene';
import 'threejs-punk/collisionHeight';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
import 'threejs-punk/fog';

const mainPass = pass( scene, camera );
const bloomPass = bloom( mainPass, 0.2, 0.4, 0.35 );
bloomPass.setResolutionScale( 0.5 );

const flarePass = lensflare( bloomPass, {
	threshold: 0.1,
	ghostSpacing: 0.2,
	ghostAttenuationFactor: 35,
	downSampleRatio: 4
} );

setReflectionScale( 0.5 );
setHashBlur( false );

renderPipeline.outputNode = mainPass.add( bloomPass ).add( flarePass.mul( 0.6 ) );
renderPipeline.needsUpdate = true;
```

### Try this

1. Try `setReflectionScale( 1.0 )`, then `0.5`, then `0.25`. Which still looks wet?
2. Set `setHashBlur( true )`. Does the puddle look better? Is the FPS hit worth it?
3. Good balance for a night city: bloom `0.5`, flare `4`, reflection scale `0.5`, hashBlur off.

</page>

</page>

</page>
