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

</page>
