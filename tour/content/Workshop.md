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
const bloomPass = bloom( mainPass, 1.2, 0.4, 0.35 );

// 3. Add glow on top of the normal image
renderPipeline.outputNode = mainPass.add( bloomPass );
renderPipeline.needsUpdate = true;
```

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
const bloomPass = bloom( mainPass, 1.2, 0.4, 0.35 );

// Flare reads the bloom texture (bright areas only)
const flarePass = lensflare( bloomPass, {
	threshold: 0.1,
	ghostSpacing: 0.2,
	ghostAttenuationFactor: 35
} );

renderPipeline.outputNode = mainPass.add( bloomPass ).add( flarePass.mul( 0.6 ) );
renderPipeline.needsUpdate = true;
```

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
const bloomPass = bloom( mainPass, 1.2, 0.4, 0.35 );
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
const bloomPass = bloom( mainPass, 1.2, 0.4, 0.35 );
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

</page>

</page>

</page>
