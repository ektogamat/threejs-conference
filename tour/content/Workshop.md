<page name="Introduction">

<page name="Welcome">

Welcome to the **Three.js Punk Workshop**!

This interactive tour provides a hands-on environment for creating and experimenting with **TSL (Three.js Shading Language)** and **WebGPU**.

### Workshop Tools

- **Tour of TSL Environment**: An integrated editor with live code compilation and real-time 3D preview. You can modify any code directly, tweak uniforms, or experiment with your own shaders.
- **Three.js Inspector**: A built-in visual inspection tool on the 3D viewport. It lets you inspect nodes, tweak scene properties, and dynamically adjust shader parameters.
- **Console & Error Diagnostics**: The collapsible console panel at the bottom captures WebGPU compilation outputs, logs, and syntax errors.

> **Refreshing the Scene**
> Code executes reactively. If your shader enters an invalid state, an error occurs, or the GPU preview freezes:
> - Click the **Refresh** button (<i data-icon="refresh" style="width: 1rem; height: 1rem; display: inline-block; vertical-align: middle;"></i>) in the preview toolbar or top header to cleanly re-execute and reset the scene.
> - Open the **Console** at the bottom to inspect error traces.

</page>

</page>

<page name="Ground">

<page name="Ripples">

Procedural rain ripples simulate circular expanding wavefronts created by raindrops hitting the ground, inspired by [Shadertoy (ldfyzl)](https://www.shadertoy.com/view/ldfyzl).

- **World-Space Coordinates**: We derive continuous coordinates from `positionWorld.xz` so the ripple grid aligns seamlessly across any surface and remains independent of geometry UV layout.
- **Time Propagation & Volume**: The `time` node drives wave expansion, while `volume` (0.0 to 1.0) controls the density/frequency of active raindrops falling on each area.
- **Normal Perturbations**: The `ripples()` function generates procedural ripples and returns tangent-space normal vectors `vec3` ready to displace surface reflections and lighting.

#### Related
- [Coordinate Spaces](?tour#coordinate-spaces)
- [Position](?tour#position)
- [Normal](?tour#normal)
- [time](?tour#timer)

```tsl
import * as THREE from 'three';
import { time, positionWorld } from 'three/tsl';
import { ripples } from 'threejs-punk/utils';
import 'threejs-punk/scene';

// https://www.shadertoy.com/view/ldfyzl
// 1. Tiled coordinate derived from horizontal world position
const rippleUV = positionWorld.xz.mul( 5 );

// 2. Generate animated rain ripples
const rippleSample = ripples( rippleUV, time, .5 );

// 3. Direct visualization of the ripple vectors on colorNode
ground.material = new THREE.MeshBasicNodeMaterial();
ground.material.colorNode = rippleSample;
```

</page>

<page name="Reflector">

Building upon the procedural rain ripples from the previous step, real-time planar reflections capture mirror images of dynamic scene geometry onto flat surfaces and distort them using ripple normal vectors.

- **Planar Reflector**: The `reflector` node creates an offscreen render target and virtual camera tracked by the ground plane via `ground.add( reflection.target )`. Configured with `resolutionScale: 0.5` and `generateMipmaps: true` for crisp, blurred reflections.
- **Screen-Space UV & Mirror Alignment**: The `screenUV` coordinates are horizontally flipped using `flipX` to align the mirrored projection accurately with the ground plane.
- **Ripple Perturbations**: Animated rain ripple normal vectors perturb the reflection coordinates through `rippleOffset`, creating realistic optical water distortion.
- **Distance Attenuation**: Uses `rangeFogFactor( 0, 30 ).oneMinus()` to smoothly fade out ripple distortion over distance, eliminating sub-pixel shimmering in the background.
- **Bicubic Mipmap Filtering**: The `textureBicubic` node filters the distorted reflection texture across mipmap levels for smooth, artifact-free blurring.

#### Related
- [Screen](?tour#screen)
- [Texture](?tour#texture)
- [Fog](?tour#fog)
- [Coordinate Spaces](?tour#coordinate-spaces)

```tsl
import * as THREE from 'three';
import { time, positionWorld, screenUV, reflector, texture, textureBicubic, rangeFogFactor } from 'three/tsl';
import { ripples } from 'threejs-punk/utils';
import 'threejs-punk/scene';

// ===========================================================================
// Rain Ripples (from previous step)
// ===========================================================================

const rippleUV = positionWorld.xz.mul( 5 );
const rippleSample = ripples( rippleUV, time, .5 );

// ===========================================================================
// Planar Reflector
// ===========================================================================

// 1. Create realtime planar reflector with mipmaps
const reflection = reflector( { resolutionScale: 0.5, generateMipmaps: true } );
reflection.reflector.getVirtualCamera( camera ).layers.set( 0 );
ground.add( reflection.target );

// 2. Distortion & Distance Attenuation
const distFade = rangeFogFactor( 0, 30 ).oneMinus();
const rippleOffset = rippleSample.xy.mul( 0.13 ).mul( distFade );
const reflectionUV = screenUV.flipX().add( rippleOffset );

// 3. Bicubic Mipmap Blur
const blurredReflection = textureBicubic( texture( reflection, reflectionUV ), 0 );

// 4. Direct visualization of blurred reflection on ground material
ground.material = new THREE.MeshBasicNodeMaterial();
ground.material.colorNode = blurredReflection;
```

</page>

<page name="Collision Height">

A top-down orthographic camera captures the scene elevation into a floating-point collision height map. We then compare surface heights against the ground level using `pcfSoft` to generate a smooth, anti-aliased occlusion mask.

### Collision Height

The `collisionHeight` instance renders the scene from above using an orthographic camera to record world-space elevation:
- **Orthographic Top-Down Camera**: Positioned above the scene looking straight down along the Y axis to cover the gameplay area.
- **Elevation Encoding**: Uses `scene.overrideMaterial` with `outputNode = vec4( vec3( positionWorld.y ), 1 )` to write unclamped world Y coordinates directly into a `HalfFloatType` texture, bypassing tone mapping.
- **Coordinate Transformations**: The `getUV` method maps any world `XZ` position into normalized `[0, 1]` UV coordinates matching the collision camera bounds.

### Collision Mask & Filtering

- **Height Bias**: A `bias` offset avoids self-occlusion and ensures only objects elevated above the ground (like cars, roofs, and bridges) block raindrops.
- **PCFSoft Filtering**: The `pcfSoft` function samples a 16-tap rotated Vogel disk around the collision UV coordinates to smoothly filter the occlusion threshold without pixelated edges.

#### Related
- [Texture](?tour#texture)
- [Position](?tour#position)
- [Coordinate Spaces](?tour#coordinate-spaces)

```tsl
import * as THREE from 'three';
import { float, positionWorld, texture } from 'three/tsl';
import { pcfSoft } from 'threejs-punk/utils';
import { collisionHeight } from 'threejs-punk/collisionHeight';
import 'threejs-punk/scene';

// 1. Sample top-down collision height map at ground position
const height = texture( collisionHeight.renderTarget.texture, collisionHeight.getUV( positionWorld ) );

// 2. Generate soft anti-aliased collision mask with height bias
const bias = float( 0.5 );
const floorPosition = positionWorld.y.add( bias );

//const binaryMask = floorPosition.step( height );
const mask = pcfSoft( height, floorPosition );

// 3. Display the soft collision mask directly on the ground plane
ground.material = new THREE.MeshBasicNodeMaterial();
ground.material.colorNode = mask;
```

</page>

<page name="Reflector Mask">

Combining the planar reflector with the collision mask allows rain ripples to only perturb reflections in open, exposed areas. Sheltered ground beneath cars, bridges, and roofs remains calm with crisp planar reflections.

- **Masked Ripples**: Multiplying the ripple displacement by `mask` ensures ripple normal offsets only distort the reflection where raindrops can freely reach the ground.
- **Occlusion Blend**: Sheltered areas transition smoothly into calm reflective surfaces without hard seams thanks to `pcfSoft` filtering.

#### Related
- [Texture](?tour#texture)
- [Screen](?tour#screen)
- [Position](?tour#position)
- [Coordinate Spaces](?tour#coordinate-spaces)

```tsl
import * as THREE from 'three';
import { float, positionWorld, rangeFogFactor, reflector, screenUV, texture, textureBicubic, time } from 'three/tsl';
import { pcfSoft, ripples } from 'threejs-punk/utils';
import { collisionHeight } from 'threejs-punk/collisionHeight';
import 'threejs-punk/scene';

// ===========================================================================
// Rain Ripples
// ===========================================================================

const rippleUV = positionWorld.xz.mul( 5 );
const rippleSample = ripples( rippleUV, time, .5 );

// ===========================================================================
// Collision Mask
// ===========================================================================

const height = texture( collisionHeight.renderTarget.texture, collisionHeight.getUV( positionWorld ) );
const bias = float( 0.5 );
const floorPosition = positionWorld.y.add( bias );
const mask = pcfSoft( height, floorPosition );

// ===========================================================================
// Planar Reflector
// ===========================================================================

// 1. Create realtime planar reflector with mipmaps
const reflection = reflector( { resolutionScale: 0.5, generateMipmaps: true } );
reflection.reflector.getVirtualCamera( camera ).layers.set( 0 );
ground.add( reflection.target );

// 2. Distortion modulated by collision mask & distance fade
const distFade = rangeFogFactor( 0, 30 ).oneMinus();
const rippleOffset = rippleSample.xy.mul( 0.13 ).mul( distFade ).mul( mask );
const reflectionUV = screenUV.flipX().add( rippleOffset );

// 3. Bicubic Mipmap Blur
const blurredReflection = textureBicubic( texture( reflection, reflectionUV ), 0 );

// 4. Direct visualization of masked reflection on ground material
ground.material = new THREE.MeshBasicNodeMaterial();
ground.material.colorNode = blurredReflection;
```

</page>

<page name="Ground Details">

PBR textures provide the base visual details for wet asphalt, configuring diffuse albedo, surface roughness, and normal bump maps.

- **Tiled Coordinates**: The `uv` is scaled and offset using `.mul( 25 ).add( 0.13 )` to repeat asphalt details seamlessly across the ground plane.
- **PBR Maps**: Samples `albedoMap`, `roughnessMap`, and `normalMapTex` to define surface appearance, reflectivity, and surface normals.

#### Related
- [Texture](?tour#texture)
- [UV](?tour#uv)
- [Node Material](?tour#node-material)

```tsl
import * as THREE from 'three';
import { uv, texture, normalMap } from 'three/tsl';
import 'threejs-punk/scene';

const textureLoader = new THREE.TextureLoader();

const albedoMap = textureLoader.load( '/textures/wet-puddles-albedo.jpg' );
albedoMap.wrapS = THREE.RepeatWrapping;
albedoMap.wrapT = THREE.RepeatWrapping;
albedoMap.colorSpace = THREE.SRGBColorSpace;

const roughnessMap = textureLoader.load( '/textures/wet-puddles-roughness.jpg' );
roughnessMap.wrapS = THREE.RepeatWrapping;
roughnessMap.wrapT = THREE.RepeatWrapping;

const normalMapTex = textureLoader.load( '/textures/wet-puddles-normal.jpg' );
normalMapTex.wrapS = THREE.RepeatWrapping;
normalMapTex.wrapT = THREE.RepeatWrapping;

// 1. TSL tiled UV with offset to avoid repetitive texture alignment
const tiledUV = uv().mul( 25 ).add( 0.13 );

// 2. Albedo and roughness
const albedo = texture( albedoMap, tiledUV );
const roughness = texture( roughnessMap, tiledUV ).r;

const material = new THREE.MeshStandardNodeMaterial();
material.colorNode = albedo;
material.roughnessNode = roughness;
material.metalness = 0;
material.normalNode = normalMap( texture( normalMapTex, tiledUV ) );

ground.material = material;
```

</page>

<page name="Ground Final">

The final ground material fuses all previously explored shading techniques into a complete, photorealistic wet asphalt shader with dynamic puddle reflections and procedural rain ripples.

- **PBR Surface Textures**: Tiled albedo, roughness, and normal maps define the asphalt and puddle material foundation.
- **Occluded Rain Ripples**: Procedural raindrop ripples perturb the ground normal map only in open areas verified by the `pcfSoft` collision mask.
- **Roughness-Aware Planar Reflection**: The planar mirror texture is blurred dynamically based on the surface roughness using `textureBicubic`, and masked by surface wetness.
- **PBR Material Integration**: Standard node material unifies lighting, diffuse color, perturbed normal vectors, and emissive mirror reflections into a single GPU pipeline.

#### Related
- [Node Material](?tour#node-material)
- [Texture](?tour#texture)
- [Screen](?tour#screen)
- [Coordinate Spaces](?tour#coordinate-spaces)

```tsl
import * as THREE from 'three';
import { float, normalMap, normalView, normalViewGeometry, positionWorld, reflector, screenUV, texture, textureBicubic, time, uv, vec4 } from 'three/tsl';
import { pcfSoft, ripples } from 'threejs-punk/utils';
import { collisionHeight } from 'threejs-punk/collisionHeight';
import 'threejs-punk/scene';

// ===========================================================================
// 1. Ground Details (PBR Textures)
// ===========================================================================

const textureLoader = new THREE.TextureLoader();

const albedoMap = textureLoader.load( '/textures/wet-puddles-albedo.jpg' );
albedoMap.wrapS = THREE.RepeatWrapping;
albedoMap.wrapT = THREE.RepeatWrapping;
albedoMap.colorSpace = THREE.SRGBColorSpace;

const roughnessMap = textureLoader.load( '/textures/wet-puddles-roughness.jpg' );
roughnessMap.wrapS = THREE.RepeatWrapping;
roughnessMap.wrapT = THREE.RepeatWrapping;

const normalMapTex = textureLoader.load( '/textures/wet-puddles-normal.jpg' );
normalMapTex.wrapS = THREE.RepeatWrapping;
normalMapTex.wrapT = THREE.RepeatWrapping;

const tiledUV = uv().mul( 25 ).add( 0.13 );

const albedo = texture( albedoMap, tiledUV );
const roughness = texture( roughnessMap, tiledUV ).r;
const normalSample = texture( normalMapTex, tiledUV );

// ===========================================================================
// 2. Rain Ripples
// ===========================================================================

const rippleUV = positionWorld.xz.mul( 5 );
const rippleSample = ripples( rippleUV, time, .5 );

// ===========================================================================
// 3. Collision Mask
// ===========================================================================

const height = texture( collisionHeight.renderTarget.texture, collisionHeight.getUV( positionWorld ) );
const bias = float( 0.5 );
const floorPosition = positionWorld.y.add( bias );
const mask = pcfSoft( height, floorPosition );

// ===========================================================================
// 4. Planar Reflector
// ===========================================================================

const reflection = reflector( { resolutionScale: 0.5, generateMipmaps: true } );
reflection.reflector.getVirtualCamera( camera ).layers.set( 0 );
ground.add( reflection.target );

const normalOffset = normalView.sub( normalViewGeometry ).xy.mul( 0.035 );
const reflectionUV = screenUV.flipX().add( normalOffset );
const blurredReflection = textureBicubic( texture( reflection, reflectionUV ), roughness );
const reflectionWetness = roughness.oneMinus().pow( 4.0 );

// ===========================================================================
// 5. Ground Material Assembly
// ===========================================================================

const wetness = roughness.oneMinus();
const rippleOffset = rippleSample.xy.mul( 0.5 ).mul( mask ).mul( wetness );
const perturbedNormal = normalSample.add( vec4( rippleOffset, 0, 0 ) );

const material = new THREE.MeshStandardNodeMaterial();
material.colorNode = albedo.pow( 2 );
material.roughnessNode = roughness;
material.metalness = 0;
material.normalNode = normalMap( perturbedNormal );
material.emissiveNode = blurredReflection.rgb.mul( reflectionWetness );

ground.material = material;
```

</page>

</page>

<page name="Scene">

<page name="Fog">

Volumetric height fog adds atmospheric depth and mood by combining camera distance attenuation with an exponential vertical height falloff. The fog gathers densely over the wet ground and gradually dissipates into the sky.

- **Camera Distance**: Uses `positionView.z.negate()` to measure planar depth directly in view space without spherical edge distortion. In world space, the equivalent calculation is `positionWorld.distance( cameraPosition )`.
- **Exponential Height Decay**: Calculates elevation above `fogFloor` and applies `.negate().exp()` to create dense low-altitude ground fog that smoothly thins out with height.
- **Global Scene Integration**: Setting `scene.fogNode = fog( fogColor, fogFactor )` automatically blends the atmospheric fog across all rendered materials in the scene.

#### Related
- [Fog](?tour#fog)
- [Position](?tour#position)
- [Math](?tour#math)
- [Camera](?tour#camera)

```tsl
import { color, float, fog, positionView, positionWorld } from 'three/tsl';
import 'threejs-punk/scene';
import 'threejs-punk/ground';

// 1. Fog parameters
const fogColor = color( 0xb6c5cb );
const fogDensity = float( 0.002 );
const fogHeight = float( 0.5 );
const fogFloor = float( - 5.4 );

// 2. Camera distance factor (view-space planar depth)
const distance = positionView.z.negate();

// 3. Height factor: dense at floor, fades exponentially above fogHeight
const heightAboveFloor = positionWorld.y.sub( fogFloor );
const heightFade = heightAboveFloor.div( fogHeight ).negate().exp();

// 4. Combined fog factor clamped to [0, 1]
const power = 3;
const fogFactor = fogDensity.mul( distance ).mul( heightFade ).mul( power ).clamp();

const fogNode = fog( fogColor.pow( 3 ), fogFactor );
scene.fogNode = fogNode;
```

</page>

</page>

<page name="Simple Particle">

<page name="Smoke">

Procedural exhaust smoke particles are created using `SpriteNodeMaterial` and GPU instancing with `range`, driving complex particle lifetimes and animations directly in shader code without compute shaders or CPU loops.

- **GPU Instanced Sprites**: Setting `sprite.count = 60` instantiates 60 camera-facing billboard sprites rendered in a single draw call.
- **Instance Randomization**: The `range` node generates per-instance variations for particle lifetime, 3D velocity offsets, scaling, and rotation speed.
- **Procedural Lifetime Animation**: `time` combined with `.mod( 1 )` drives continuous emission cycles, while `smoothstep` and `.oneMinus()` create smooth spawn and dissipation alpha fades.
- **Texture UV Rotation**: The `rotateUV` node dynamically spins the smoke texture over time at randomized rates per puff.
- **Shared Material Architecture**: Both exhaust pipes attach separate instanced sprites while sharing the exact same `SpriteNodeMaterial` instance.

#### Related
- [Sprite Material](?tour#sprite-material)
- [Range](?tour#range)
- [UV](?tour#uv)
- [Math](?tour#math)

```tsl
import * as THREE from 'three';
import { color, mix, range, rotateUV, smoothstep, texture, time, uniform, uv } from 'three/tsl';
import 'threejs-punk/scene';
import 'threejs-punk/ground';
import 'threejs-punk/fog';

const textureLoader = new THREE.TextureLoader();
const smokeMap = textureLoader.load( '/textures/smoke.png' );
smokeMap.colorSpace = THREE.SRGBColorSpace;

// 1. Random ranges per particle instance
const lifeRange = range( 0.1, 1 );
const offsetRange = range( new THREE.Vector3( - 0.08, 0.02, - 0.04 ), new THREE.Vector3( 0.08, 0.35, 0.04 ) );
const scaleRange = range( 0.12, 0.42 );
const rotateRange = range( 0.1, 4 );

// 2. Animated lifetime calculations
const speed = uniform( 0.5 );
const opacity = uniform( 0.4 );
const scaledTime = time.add( 5 ).mul( speed );
const lifeTime = scaledTime.mul( lifeRange ).mod( 1 );
const life = lifeTime.div( lifeRange );

// 3. Rotating smoke texture with smooth fade-in and fade-out
const fadeIn = smoothstep( 0.0, 0.2, life );
const fadeOut = life.oneMinus();
const textureNode = texture( smokeMap, rotateUV( uv(), scaledTime.mul( rotateRange ) ) );
const opacityNode = textureNode.a.mul( fadeIn ).mul( fadeOut ).mul( opacity );

// 4. Single shared SpriteNodeMaterial for all smoke sprites
const smokeMaterial = new THREE.SpriteNodeMaterial();
smokeMaterial.colorNode = mix( color( 0x9a9890 ), color( 0x4a4845 ), life.mul( 0.85 ) );
smokeMaterial.opacityNode = opacityNode;
smokeMaterial.positionNode = offsetRange.mul( lifeTime );
smokeMaterial.scaleNode = scaleRange.mul( lifeTime.max( 0.25 ) );
smokeMaterial.depthWrite = false;
smokeMaterial.depthTest = true;
smokeMaterial.transparent = true;

// 5. Multiple sprites sharing the exact same material
const exhaustRight = new THREE.Sprite( smokeMaterial );
exhaustRight.scale.setScalar( 6 );
exhaustRight.count = 60;
exhaustRight.position.set( 0.47, 0.52, - 2.45 );
car.add( exhaustRight );

const exhaustLeft = new THREE.Sprite( smokeMaterial );
exhaustLeft.scale.setScalar( 6 );
exhaustLeft.count = 60;
exhaustLeft.position.set( - 0.51, 0.55, - 2.42 );
car.add( exhaustLeft );
```

</page>

</page>

<page name="Compute Particle">

<page name="Compute">

Compute shaders in WebGPU enable high-performance general-purpose parallel computing directly on the GPU. Using GPU storage buffers `instancedArray` and compute nodes `Fn().compute()`, thousands of data elements can be calculated simultaneously in parallel without CPU overhead.

- **GPU Storage Buffers**: `instancedArray` allocates GPU memory buffers for instance data (like 3D positions) that persist across dispatches and can be read by shaders.
- **Compute Kernel**: `Fn()().compute( count )` creates an executable GPU compute shader dispatched across `count` parallel threads `instanceIndex`.
- **Parallel Randomization**: The `hash` TSL node produces pseudo-random numbers per invocation to scatter initial particle positions in 3D space.
- **Buffer Element Access**: `positionBuffer.element( instanceIndex )` indexes into the storage buffer to position each geometry instance during rendering.

#### Related
- [Compute](?tour#compute)
- [Instanced Array](?tour#instanced-array)
- [Hash](?tour#hash)
- [Fn](?tour#fn)

```tsl
import * as THREE from 'three';
import { color, Fn, hash, instancedArray, instanceIndex, positionGeometry, vec3 } from 'three/tsl';
import 'threejs-punk/scene';
import 'threejs-punk/ground';
import 'threejs-punk/fog';
import 'threejs-punk/smoke';

const particleCount = 1000;
const area = { width: 60, height: 25, depth: 60 };

// 1. Storage buffers for particle positions and velocities
const positionBuffer = instancedArray( particleCount, 'vec3' );

// 2. Compute Init: randomize initial rain positions within area
const computeInit = Fn( () => {

	const position = positionBuffer.element( instanceIndex );

	const randX = hash( instanceIndex );
	const randY = hash( instanceIndex.add( particleCount + 1 ) );
	const randZ = hash( instanceIndex.add( particleCount + 2 ) );

	position.x = randX.mul( area.width ).sub( area.width / 2 );
	position.z = randZ.mul( area.depth ).sub( area.depth / 2 );
	position.y = randY.mul( area.height ).sub( area.height / 2 );

} )().compute( particleCount );

// Initial compute pass
renderer.compute( computeInit );

// 3. Material using instanced position buffer
const rainMaterial = new THREE.MeshStandardMaterial();
rainMaterial.colorNode = color( 0xdcf4ff );
rainMaterial.positionNode = positionGeometry.add( positionBuffer.element( instanceIndex ) ).add( 
	vec3( - 100, 7, 10 )
);

const rainGeometry = new THREE.SphereGeometry( .6, 12, 10 );
const rain = new THREE.Mesh( rainGeometry, rainMaterial );
rain.count = particleCount;
rain.frustumCulled = false;
rain.layers.set( 1 );

scene.add( rain );
camera.layers.enable( 1 );
```

</page>

<page name="Rain">

Full GPU particle simulation with dynamic physics and real-time terrain collision detection. Using delta time integration and collision height sampling, raindrops fall, wrap infinitely around the camera, and collide with scene surfaces.

- **Delta Time Physics**: The `computeUpdate` shader advances particles every frame using `position.addAssign( velocity.mul( deltaTime ) )`.
- **Camera-Centered Area Positioning**: Spawns raindrops in a 3D box area around the camera using `area` and `uniform( camera.position )`.
- **Terrain Heightmap Collision**: Samples the ground collision texture using `collisionHeight.getUV()` to detect floor impacts.
- **Dynamic Respawn**: Droplets hitting surfaces respawn with randomized coordinates and velocities to prevent clumping.
- **Cylindrical Billboarding**: Renders each rain streak with cylindrical billboarding `horizontal: true` and distance-based opacity.

#### Related
- [Compute](?tour#compute)
- [Collision](?tour#collision)
- [Billboarding](?tour#billboarding)
- [Delta Time](?tour#delta-time)

```tsl
import * as THREE from 'three';
import { billboarding, color, deltaTime, Fn, hash, If, instancedArray, instanceIndex, positionGeometry, texture, time, uniform, uv } from 'three/tsl';
import { collisionHeight } from 'threejs-punk/collisionHeight';
import 'threejs-punk/scene';
import 'threejs-punk/ground';
import 'threejs-punk/fog';
import 'threejs-punk/smoke';

const particleCount = 4000;
const area = { width: 60, height: 25, depth: 60 };
const center = uniform( camera.position );

// 1. Storage buffers for particle positions and velocities
const positionBuffer = instancedArray( particleCount, 'vec3' );
const velocityBuffer = instancedArray( particleCount, 'vec3' );

// 2. Compute Init: randomize initial rain positions within area
const computeInit = Fn( () => {

	const position = positionBuffer.element( instanceIndex );
	const velocity = velocityBuffer.element( instanceIndex );

	const randX = hash( instanceIndex );
	const randY = hash( instanceIndex.add( particleCount + 1 ) );
	const randZ = hash( instanceIndex.add( particleCount + 2 ) );

	position.x = randX.mul( area.width ).sub( area.width / 2 ).add( center.x );
	position.z = randZ.mul( area.depth ).sub( area.depth / 2 ).add( center.z );
	position.y = randY.mul( area.height ).add( center.y );

	velocity.y = randX.mul( - 5 ).add( - 20 );

} )().compute( particleCount );

// 3. Compute Update: move droplets down and detect collision using collisionHeight
const computeUpdate = Fn( () => {

	const position = positionBuffer.element( instanceIndex );
	const velocity = velocityBuffer.element( instanceIndex );

	position.addAssign( velocity.mul( deltaTime ) );

	// Sample surface height from collision map
	const coords = collisionHeight.getUV( position );
	const floorHeight = texture( collisionHeight.renderTarget.texture, coords ).y;
	const floorPosition = floorHeight.add( 0.05 );

	// Respawn when hitting the collision surface
	If( position.y.lessThan( floorPosition ), () => {

		const seed = instanceIndex.toFloat().add( time.mul( 1000 ) );

		const randX = hash( seed );
		const randY = hash( seed.add( particleCount + 1 ) );
		const randZ = hash( seed.add( particleCount + 2 ) );

		position.x = randX.mul( area.width ).sub( area.width / 2 ).add( center.x );
		position.z = randZ.mul( area.depth ).sub( area.depth / 2 ).add( center.z );
		position.y = randY.mul( 15 ).add( center.y.add( area.height ) );

		velocity.y = randX.mul( - 5 ).add( - 20 );

	} );

} )().compute( particleCount );

// Initial compute pass
renderer.compute( computeInit );

// 4. Streak shader: bright center with soft vertical fade
const streak = uv().distance( .5 ).oneMinus().pow( 5 );

// 5. Rain material with cylindrical billboarding
const rainMaterial = new THREE.NodeMaterial();
rainMaterial.colorNode = color( 0xdcf4ff );
rainMaterial.opacityNode = streak.mul( 0.35 );
rainMaterial.positionNode = positionGeometry.add( positionBuffer.element( instanceIndex ) );
rainMaterial.vertexNode = billboarding( { horizontal: true, horizontalRotation: true } );
rainMaterial.depthWrite = false;
rainMaterial.depthTest = true;
rainMaterial.transparent = true;

const rainGeometry = new THREE.PlaneGeometry( 0.04, 0.8 );
const rain = new THREE.Mesh( rainGeometry, rainMaterial );
rain.count = particleCount;
rain.frustumCulled = false;
rain.layers.set( 1 );

// Run compute update on every frame before rendering
rain.onBeforeRender = ( renderer ) => {

	renderer.compute( computeUpdate );

};

scene.add( rain );
camera.layers.enable( 1 );
```

</page>

<page name="Spritesheet">

Spritesheets pack multiple animation frames into a single texture atlas. Using the built-in `spritesheetUV` TSL node, we dynamically offset the UV coordinates across rows and columns over time to play flipbook animations with zero CPU overhead.

![Water Splash Spritesheet](/textures/water-splash.webp)

- **Texture Atlas**: Loads a spritesheet image `water-splash.webp` containing 5 horizontal animation frames of water droplets splashing.
- **spritesheetUV Node**: Calculates the current column/row UV offset automatically based on frame dimensions `vec2( 5, 1 )`, base UV coordinates `uv()`, and continuous time-driven frame progress `time.mul( 20 )`.
- **Billboarding**: Uses `billboarding()` to ensure the splash sprite always faces directly toward the camera regardless of viewpoint angle.

#### Related
- [Texture](?tour#texture)
- [UV](?tour#uv)
- [Timer](?tour#timer)

```tsl
import * as THREE from 'three';
import { billboarding, color, spritesheetUV, texture, time, uv, vec2 } from 'three/tsl';
import 'threejs-punk/scene';
import 'threejs-punk/ground';
import 'threejs-punk/fog';
import 'threejs-punk/smoke';

// 1. Load splash spritesheet (5 frames horizontal)
const splashSheet = new THREE.TextureLoader().load( '/textures/water-splash.webp' );

// 2. Spritesheet frame animation (5 columns, 1 row, 20 fps)
const frameUV = spritesheetUV( vec2( 5, 1 ), uv(), time.mul( 20 ) );
const splashSample = texture( splashSheet, frameUV );

// 3. Sprite material with billboarding
const splashMaterial = new THREE.MeshBasicNodeMaterial();
splashMaterial.colorNode = color( 0xdcf4ff );
splashMaterial.opacityNode = splashSample.r;
splashMaterial.vertexNode = billboarding( { horizontal: true, vertical: true } );
splashMaterial.depthWrite = false;
splashMaterial.depthTest = true;
splashMaterial.transparent = true;

const splashGeometry = new THREE.PlaneGeometry( 3, 3 );
const splash = new THREE.Mesh( splashGeometry, splashMaterial );
splash.position.set( - 128, - 2, 33 );

scene.add( splash );
```

</page>

<page name="Splash">

Animated water splash particles generated on scene surfaces around the camera using compute shaders, collision height sampling, and spritesheets.

- **Animation Cycles**: Advances splash frames and picks a new random position every cycle using `splashCycleBuffer`.
- **Collision Snapping**: Uses `collisionHeight.getUV()` to place splashes directly on top of floors, cars, and buildings.
- **Radial Spawning**: Spawns splashes in a circle in front of the camera with `cos()`, `sin()`, and `cameraDirection`.
- **Automatic Billboarding**: Uses `SpriteNodeMaterial` and `THREE.Sprite` for native camera-facing sprites without manual vertex transformations.

#### Related
- [Compute](?tour#compute)
- [Spritesheet](?tour#spritesheet)
- [Collision](?tour#collision)
- [Sprite Material](?tour#sprite-material)

```tsl
import * as THREE from 'three';
import { color, cos, Fn, hash, If, instancedArray, instanceIndex, objectDirection, sin, spritesheetUV, texture, time, uniform, uv, vec2 } from 'three/tsl';
import { collisionHeight } from 'threejs-punk/collisionHeight';
import 'threejs-punk/scene';
import 'threejs-punk/ground';
import 'threejs-punk/fog';
import 'threejs-punk/smoke';
import 'threejs-punk/rain';

const particleCount = 2000;
const radius = 40;
const cameraDirection = objectDirection( camera );
const center = uniform( camera.position ).add( cameraDirection.mul( radius / 2 ) );

// 1. Storage buffers for splash positions and animation cycle tracking
const splashPositionBuffer = instancedArray( particleCount, 'vec3' );
const splashCycleBuffer = instancedArray( particleCount, 'uint' );

// 2. Compute Update: place splashes at random surface heights using collisionHeight
const computeSplashUpdate = Fn( () => {

	const splashPos = splashPositionBuffer.element( instanceIndex );
	const lastCycle = splashCycleBuffer.element( instanceIndex );

	// Per-particle phase offset (advances cycle index every 1/4 second)
	const phase = hash( instanceIndex );
	const cycleIndex = time.mul( 4 ).add( phase ).floor().toUint();

	// When a splash cycle restarts, pick a new random position within circular area
	If( cycleIndex.notEqual( lastCycle ), () => {

		lastCycle.assign( cycleIndex );

		const seed = instanceIndex.add( cycleIndex.mul( particleCount ) );
		const randAngle = hash( seed );
		const randDist = hash( seed.add( particleCount ) );

		const angle = randAngle.mul( Math.PI * 2 );
		const dist = randDist.sqrt().mul( radius );

		splashPos.x = center.x.add( cos( angle ).mul( dist ) );
		splashPos.z = center.z.add( sin( angle ).mul( dist ) );

		// Sample exact surface height from collision map
		const coords = collisionHeight.getUV( splashPos );
		const floorY = texture( collisionHeight.renderTarget.texture, coords ).y;
		splashPos.y = floorY.add( 0.06 );

	} );

} )().compute( particleCount );

// 3. Load splash spritesheet (5 frames horizontal)
const splashSheet = new THREE.TextureLoader().load( '/textures/water-splash.webp' );

// 4. Spritesheet frame animation (5 columns, 1 row, 20 fps + per-particle phase)
const frameUV = spritesheetUV( vec2( 5, 1 ), uv(), time.mul( 20 ).add( hash( instanceIndex ).mul( 5 ) ) );
const splashSample = texture( splashSheet, frameUV );

// 5. Splash material using SpriteNodeMaterial (automatic billboarding)
const splashMaterial = new THREE.SpriteNodeMaterial();
splashMaterial.colorNode = color( 0xdcf4ff );
splashMaterial.opacityNode = splashSample.r.mul( 0.4 );
splashMaterial.positionNode = splashPositionBuffer.element( instanceIndex );
splashMaterial.scaleNode = vec2( 0.2, 0.2 );
splashMaterial.depthWrite = false;
splashMaterial.depthTest = true;
splashMaterial.transparent = true;

const splash = new THREE.Sprite( splashMaterial );
splash.count = particleCount;
splash.frustumCulled = false;
splash.layers.set( 1 );

// Run compute update on every frame before rendering
splash.onBeforeRender = ( renderer ) => {

	renderer.compute( computeSplashUpdate );

};

scene.add( splash );
camera.layers.enable( 1 );
```

</page>

</page>

<page name="Render Pipeline">

<page name="Pass + MRT">

Multiple Render Targets (MRT) allow a single render pass to output multiple shader channels simultaneously into separate texture buffers, such as full scene color and isolated emissive lighting.

- **Single Pass Capture**: Uses `pass()` with `setMRT()` and `mrt()` to render color `output` and neon glow `emissive` in one GPU pass.
- **Texture Extraction**: `getTextureNode()` extracts individual texture channels `output` and `emissive` for post-processing.
- **Split-Screen Comparison**: Compares the full scene render with the isolated emissive channel side-by-side using `select()` and `screenUV`.

#### Related
- [Pass](?tour#pass)
- [MRT](?tour#mrt)
- [Screen](?tour#screen)
- [Render Pipeline](?tour#render-pipeline)

```tsl
import * as THREE from 'three';
import { emissive, mrt, output, pass, select, screenUV, vec4 } from 'three/tsl';
import 'threejs-punk/scene';
import 'threejs-punk/ground';
import 'threejs-punk/fog';
import 'threejs-punk/smoke';
import 'threejs-punk/rain';
import 'threejs-punk/splash';

// 1. Render pass configured with Multiple Render Targets (Color + Emissive)
const mainPass = pass( scene, camera );
const mrtNode = mrt( {
	output: output,
	emissive: vec4( emissive, output.a )
} );
mrtNode.setBlendMode( 'emissive', new THREE.BlendMode( THREE.NormalBlending ) );

mainPass.setMRT( mrtNode );

// 2. Extract and display the isolated emissive channel directly
const outputPass = mainPass.getTextureNode( 'output' );
const emissivePass = mainPass.getTextureNode( 'emissive' );

renderPipeline.outputNode = select( screenUV.x.greaterThan( .5 ), emissivePass, outputPass ).xyz;
```

</page>

<page name="Post-Processing">

Assembles a complete cyberpunk post-processing pipeline combining selective neon bloom with depth attenuation, anamorphic lens flares, half-resolution Gaussian depth of field, color balance grading, chromatic aberration, anti-aliasing, and cinematic film grain.

- **Selective Depth-Faded Bloom**: Attenuates distant emissive materials using `getLinearDepthNode()` and applies `bloom()` exclusively to isolated neon glow without washing out diffuse surfaces.
- **Lens Flare**: Generates cinematic ghost flares and light streaks from glowing lights using `lensflare()`.
- **Depth of Field Blur**: Creates distance depth blur using `gaussianBlur()` at half resolution with `resolutionScale: 0.5` blended via `getLinearDepthNode()`.
- **Cyberpunk Grading**: Shifts the color balance towards magenta/cyan tones using `vec3()`, enhances vibrancy with `saturation()`, and focuses the viewpoint using a radial `screenUV` vignette.
- **Chromatic Aberration**: Adds radial lens color fringing using `chromaticAberration()` to separate RGB color channels towards the screen edges.
- **Anti-Aliasing & Film Grain**: Cleans specular edges with `smaa()` and adds cinematic film texture using `film()`.

#### Related
- [Pass](?tour#pass)
- [MRT](?tour#mrt)
- [Screen](?tour#screen)
- [Render Pipeline](?tour#render-pipeline)

```tsl
import * as THREE from 'three';
import { emissive, mix, mrt, output, pass, saturation, screenUV, vec2, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import 'threejs-punk/scene';
import 'threejs-punk/ground';
import 'threejs-punk/fog';
import 'threejs-punk/smoke';
import 'threejs-punk/rain';
import 'threejs-punk/splash';

// 1. Render pass with Multiple Render Targets (Color + Emissive)
const mainPass = pass( scene, camera );
const mrtNode = mrt( {
	output: output,
	emissive: vec4( emissive, output.a )
} );
mrtNode.setBlendMode( 'emissive', new THREE.BlendMode( THREE.NormalBlending ) );

mainPass.setMRT( mrtNode );

// 2. Neon Bloom applied to emissive channel with linear depth attenuation
const emissiveOutput = mainPass.getTextureNode( 'emissive' );
const depthFade = mainPass.getLinearDepthNode().mul( 17 ).oneMinus().clamp();
const bloomPass = bloom( emissiveOutput.mul( depthFade ), 0.1, 0.5 ).toInspector( 'bloom' );

// 3. Cinematic Lens Flare from the neon lights
const flarePass = lensflare( bloomPass, {
	threshold: 0.0,
	ghostSpacing: 0.7,
	ghostAttenuationFactor: 30
} ).toInspector( 'flare' );

// 4. Composite bloom and lens flare on top of the main scene color
const sceneComposite = mainPass.add( bloomPass ).add( flarePass.mul( 2 ) );

// 5. Depth of Field with half-resolution Gaussian Blur
const blurredScene = gaussianBlur( sceneComposite, .3, 4, { resolutionScale: 0.5 } );
const dofFactor = mainPass.getLinearDepthNode().mul( 14 ).clamp();
const dofComposite = mix( sceneComposite, blurredScene, dofFactor );

// 6. Cyberpunk Color Grading (Color Balance + Vignette + Saturation)
const colorBalance = vec3( 1.05, 0.9, 1.4 );
const vignette = screenUV.distance( .5 ).mul( 1.2 ).oneMinus().clamp();
const gradedColor = saturation( dofComposite.rgb.mul( colorBalance ), 1.25 ).mul( vignette );

// 7. Chromatic aberration, SMAA & subtle cinematic film grain
const chromaticPass = chromaticAberration( gradedColor, 0.5, vec2( .5 ) );
const smaaPass = smaa( chromaticPass );
const finalPass = film( smaaPass, 0.15 );

renderPipeline.outputNode = finalPass;
```

</page>

</page>
