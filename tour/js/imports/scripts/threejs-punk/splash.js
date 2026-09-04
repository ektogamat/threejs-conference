import * as THREE from 'three';
import { color, cos, Fn, hash, If, instancedArray, instanceIndex, objectDirection, sin, spritesheetUV, texture, time, uniform, uv, vec2 } from 'three/tsl';
import { collisionHeight } from 'threejs-punk/collisionHeight';
import { scene, camera } from 'threejs-punk/scene';

const particleCount = 2000;
const radius = 40;

let splash, splashMaterial, splashSheet;
let splashPositionBuffer, splashCycleBuffer, computeSplashUpdate;

function init() {

	const cameraDirection = objectDirection( camera );
	const center = uniform( camera.position ).add( cameraDirection.mul( radius / 2 ) );

	// 1. Storage buffers for splash positions and animation cycle tracking
	splashPositionBuffer = instancedArray( particleCount, 'vec3' );
	splashCycleBuffer = instancedArray( particleCount, 'uint' );

	// 2. Compute Update: place splashes at random surface heights using collisionHeight
	computeSplashUpdate = Fn( () => {

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
	splashSheet = new THREE.TextureLoader().load( '/textures/water-splash.webp' );

	// 4. Spritesheet frame animation (5 columns, 1 row, 20 fps + per-particle phase)
	const frameUV = spritesheetUV( vec2( 5, 1 ), uv(), time.mul( 20 ).add( hash( instanceIndex ).mul( 5 ) ) );
	const splashSample = texture( splashSheet, frameUV );

	// 5. Splash material using SpriteNodeMaterial (automatic billboarding)
	splashMaterial = new THREE.SpriteNodeMaterial();
	splashMaterial.colorNode = color( 0xdcf4ff );
	splashMaterial.opacityNode = splashSample.r.mul( 0.4 );
	splashMaterial.positionNode = splashPositionBuffer.element( instanceIndex );
	splashMaterial.scaleNode = vec2( 0.2, 0.2 );
	splashMaterial.depthWrite = false;
	splashMaterial.depthTest = true;
	splashMaterial.transparent = true;

	splash = new THREE.Sprite( splashMaterial );
	splash.count = particleCount;
	splash.frustumCulled = false;
	splash.layers.set( 1 );

	// Run compute update on every frame before rendering
	splash.onBeforeRender = ( renderer ) => {

		renderer.compute( computeSplashUpdate );

	};

	scene.add( splash );
	camera.layers.enable( 1 );

}

function refresh() {

	if ( splash ) {

		scene.add( splash );
		camera.layers.enable( 1 );

	}

}

function update() {}

function dispose() {

	if ( splash ) {

		scene.remove( splash );

	}

	if ( splashMaterial ) {

		splashMaterial.dispose();

	}

}

export { init, refresh, update, dispose, splash, computeSplashUpdate, splashMaterial, splashPositionBuffer, splashCycleBuffer };
