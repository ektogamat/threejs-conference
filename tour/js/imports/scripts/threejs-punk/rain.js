import * as THREE from 'three';
import { Fn, texture, uv, uint, instancedArray, positionWorld, cameraPosition, hash, vec2,
	instanceIndex, float, positionGeometry, time, fract, If, floor, mix, color, uniform } from 'three/tsl';
import { collisionHeight } from './collisionHeight.js';
import { billboarding } from 'three/tsl';

const uCameraPos = uniform( new THREE.Vector3() );
const uCameraDir = uniform( new THREE.Vector3() );

const maxParticleCount = 5000;
const instanceCount = maxParticleCount;
const SPLASH_FRAMES = 5;
const SPLASH_SPEED = 4;

let rainParticles, splashParticles;
let computeParticles, computeSplash;

async function init() {

	console.log( 'rain init' );

	// Rain spawn area (smaller than collision area for concentrated rain)
	const rainArea = { width: 60, height: 60 };
	const rainHalfW = rainArea.width / 2;
	const rainHalfH = rainArea.height / 2;

	// Particle storage buffers
	const positionBuffer = instancedArray( maxParticleCount, 'vec3' );
	const velocityBuffer = instancedArray( maxParticleCount, 'vec3' );
	const splashPositionBuffer = instancedArray( maxParticleCount, 'vec3' );
	const splashCycleBuffer = instancedArray( maxParticleCount, 'uint' );

	const randUint = () => uint( Math.random() * 0xFFFFFF );

	// --- Compute Init: spawn particles relative to camera position ---
	const computeInit = Fn( () => {

		const position = positionBuffer.element( instanceIndex );
		const velocity = velocityBuffer.element( instanceIndex );

		const randX = hash( instanceIndex );
		const randY = hash( instanceIndex.add( randUint() ) );
		const randZ = hash( instanceIndex.add( randUint() ) );

		const centerPos = uCameraPos.add( uCameraDir.mul( float( 15 ) ) );

		// Random XZ within rain spawn area relative to shifted centerPos
		position.x = randX.mul( float( rainArea.width ) ).sub( float( rainHalfW ) ).add( centerPos.x );
		position.z = randZ.mul( float( rainArea.height ) ).sub( float( rainHalfH ) ).add( centerPos.z );

		// Random Y height: spread particles across the fall range
		position.y = randY.mul( 25 );

		// Initial fall velocity (slightly varied per particle)
		velocity.y = randX.mul( - 0.04 ).add( - 0.2 );

	} )().compute( maxParticleCount );

	// --- Compute Update: fall, collide, wrap infinitely around camera ---
	const computeUpdate = Fn( () => {

		const position = positionBuffer.element( instanceIndex );
		const velocity = velocityBuffer.element( instanceIndex );

		// Apply velocity (falling)
		position.addAssign( velocity );

		const centerPos = uCameraPos.add( uCameraDir.mul( float( 15 ) ) );

		// Wrap rain horizontally around centerPos (infinite rain logic)
		const dx = position.x.sub( centerPos.x );
		const dz = position.z.sub( centerPos.z );

		// Wrap dx to [-rainHalfW, rainHalfW]
		const wrappedDx = fract( dx.add( float( rainHalfW ) ).div( float( rainArea.width ) ) )
			.mul( float( rainArea.width ) ).sub( float( rainHalfW ) );
		position.x = centerPos.x.add( wrappedDx );

		// Wrap dz to [-rainHalfH, rainHalfH]
		const wrappedDz = fract( dz.add( float( rainHalfH ) ).div( float( rainArea.height ) ) )
			.mul( float( rainArea.height ) ).sub( float( rainHalfH ) );
		position.z = centerPos.z.add( wrappedDz );

		// Map XZ position to [0,1] texture UV matching the collision camera
		const coords = collisionHeight.getUV( position );

		// Sample positionWorld from the collision map
		const collisionData = texture( collisionHeight.renderTarget.texture, coords );
		const floorHeight = collisionData.y;

		const surfaceOffset = float( 0.05 );
		const floorPosition = floorHeight.add( surfaceOffset );

		// Collision: when particle falls below floor, respawn at the top
		If( position.y.lessThan( floorPosition ), () => {

			// Generate a dynamic seed for the respawning particle
			const seed = float( instanceIndex ).add( time.mul( 1000 ) );

			// Respawn at random height above to distribute them vertically (prevents clumping/waves)
			position.y = hash( seed.add( 77.7 ) ).mul( 15 ).add( 20 );

			// New random XZ within rain spawn area relative to centerPos
			position.x = hash( seed.add( 11.1 ) ).mul( float( rainArea.width ) ).sub( float( rainHalfW ) ).add( centerPos.x );
			position.z = hash( seed.add( 44.4 ) ).mul( float( rainArea.height ) ).sub( float( rainHalfH ) ).add( centerPos.z );

			// Vary fall velocity on respawn as well
			velocity.y = hash( seed.add( 99.9 ) ).mul( - 0.04 ).add( - 0.2 );

		} );

	} );

	computeParticles = computeUpdate().compute( maxParticleCount );

	// Init particles and run first compute
	renderer.compute( computeInit );
	renderer.compute( computeParticles );

	// --- Compute Splash: place splashes at random floor positions centered on camera ---
	const computeSplashUpdate = Fn( () => {

		const splashPos = splashPositionBuffer.element( instanceIndex );
		const lastCycle = splashCycleBuffer.element( instanceIndex );

		const centerPos = uCameraPos.add( uCameraDir.mul( float( 15 ) ) );

		// Per-particle phase (same as material shader)
		const phase = hash( instanceIndex ).mul( 6.28 );

		// Cycle index increments each time the animation loops (floor of continuous cycle)
		const cycleIndex = floor( time.mul( SPLASH_SPEED ).add( phase ) ).toUint();

		// Detect if cycle reset/changed
		If( cycleIndex.notEqual( lastCycle ), () => {

			lastCycle.assign( cycleIndex );

			// Use cycle index * large prime as seed for truly different position each cycle
			const seed = instanceIndex.add( cycleIndex.mul( uint( 196613 ) ) );
			const randX = hash( seed );
			const randZ = hash( seed.add( uint( 77777 ) ) );

			// Random XZ within rain area relative to camera
			const offsetX = randX.mul( float( rainArea.width ) ).sub( float( rainHalfW ) );
			const offsetZ = randZ.mul( float( rainArea.height ) ).sub( float( rainHalfH ) );

			splashPos.x = centerPos.x.add( offsetX );
			splashPos.z = centerPos.z.add( offsetZ );

			// Sample floor Y height
			const coords = collisionHeight.getUV( splashPos );
			const floorY = texture( collisionHeight.renderTarget.texture, coords ).y;
			splashPos.y = floorY.add( 0.06 );

		} );

		// Wrap splashPos horizontally around centerPos every frame (infinite splash logic)
		const dx = splashPos.x.sub( centerPos.x );
		const dz = splashPos.z.sub( centerPos.z );

		const wrappedDx = fract( dx.add( float( rainHalfW ) ).div( float( rainArea.width ) ) )
			.mul( float( rainArea.width ) ).sub( float( rainHalfW ) );
		const newX = centerPos.x.add( wrappedDx );

		const wrappedDz = fract( dz.add( float( rainHalfH ) ).div( float( rainArea.height ) ) )
			.mul( float( rainArea.height ) ).sub( float( rainHalfH ) );
		const newZ = centerPos.z.add( wrappedDz );

		// If it wrapped to a new position, recalculate the ground height
		If( newX.notEqual( splashPos.x ).or( newZ.notEqual( splashPos.z ) ), () => {

			splashPos.x = newX;
			splashPos.z = newZ;

			const coords = collisionHeight.getUV( splashPos );
			const floorY = texture( collisionHeight.renderTarget.texture, coords ).y;
			splashPos.y = floorY.add( 0.06 );

		} );

	} );

	computeSplash = computeSplashUpdate().compute( maxParticleCount );

	// Rain particles material — cylindrical billboarding (horizontal only, vertical stays world-up)
	const rainMaterial = new THREE.NodeMaterial();

	// Streak shader: bright center line with soft vertical fade at top/bottom
	const rainUV = uv();
	const centerLine = rainUV.x.sub( 0.5 ).abs().mul( 2 ).oneMinus().pow( 2 ); // bright center
	const verticalFade = rainUV.y.smoothstep( 0, 0.08 ).mul( rainUV.y.oneMinus().smoothstep( 0, 0.15 ) ); // soft ends
	const streak = centerLine.mul( verticalFade );

	const rainDistance = positionWorld.sub( cameraPosition ).length();
	const rainDistanceFactor = rainDistance.div( 60 ).clamp( 0, 1 ).oneMinus();

	rainMaterial.colorNode = color( 0xdcf4ff );
	rainMaterial.opacityNode = streak.mul( 0.3 ).mul( rainDistanceFactor );
	rainMaterial.positionNode = positionGeometry.add( positionBuffer.toAttribute() );
	rainMaterial.vertexNode = billboarding( { horizontal: true, horizontalRotation: true } );
	rainMaterial.depthWrite = false;
	rainMaterial.depthTest = true;
	rainMaterial.transparent = true;

	const rainGeometry = new THREE.PlaneGeometry( 0.03, 1.0 );
	rainGeometry.translate( 0, 0.75, 0 ); // pivot at bottom (floor contact point)
	rainParticles = new THREE.Mesh( rainGeometry, rainMaterial );
	rainParticles.count = instanceCount;
	rainParticles.frustumCulled = false;
	rainParticles.layers.set( 1 );
	scene.add( rainParticles );

	// Enable layer 1 on the main camera so it renders the rain
	camera.layers.enable( 1 );

	// --- Splash / Splatter layer (spritesheet animation) ---

	// Load splash spritesheet (6 frames horizontal, 1 row)
	const splashSheet = new THREE.TextureLoader().load( '/textures/water-splash.webp' );

	// Per-particle cyclic time with random phase offset
	const splashPhase = hash( instanceIndex ).mul( 6.28 );
	const splashCycleTime = fract( time.mul( SPLASH_SPEED ).add( splashPhase ) ); // 0→1 cycle

	// Continuous frame position (e.g. 2.7 = between frame 2 and 3)
	const framePos = splashCycleTime.mul( float( SPLASH_FRAMES ) );
	const frameA = floor( framePos ).toFloat(); // current frame (2)
	const frameB = frameA.add( 1 ).min( float( SPLASH_FRAMES - 1 ) ); // clamp to last frame, no wrap
	const frameMix = fract( framePos ); // blend factor (0.7)

	// Sample two adjacent frames and interpolate
	const splashUV = uv();
	const uvA = vec2(
		splashUV.x.div( float( SPLASH_FRAMES ) ).add( frameA.div( float( SPLASH_FRAMES ) ) ),
		splashUV.y
	);
	const uvB = vec2(
		splashUV.x.div( float( SPLASH_FRAMES ) ).add( frameB.div( float( SPLASH_FRAMES ) ) ),
		splashUV.y
	);

	const sampleA = texture( splashSheet, uvA );
	const sampleB = texture( splashSheet, uvB );
	const splashSample = mix( sampleA, sampleB, frameMix );

	// Per-instance random scale that grows from start to end size during the animation
	const SPLASH_START_SCALE = 0.1;
	const SPLASH_END_SCALE = 2.0;
	const splashBaseScale = hash( instanceIndex.add( uint( 12345 ) ) ).mul( 0.7 ).add( 0.3 );
	const splashScale = splashBaseScale.mul( mix( SPLASH_START_SCALE, SPLASH_END_SCALE, splashCycleTime ) );

	const splashMaterial = new THREE.MeshBasicNodeMaterial();
	splashMaterial.colorNode = color( 0xdcf4ff );
	// Progressive fade out in the second half of the animation
	const splashFade = splashCycleTime.oneMinus().smoothstep( 0, 0.5 );
	splashMaterial.opacityNode = splashSample.r.mul( .2 ).mul( splashFade );
	splashMaterial.positionNode = positionGeometry.mul( splashScale );
	splashMaterial.vertexNode = billboarding( { position: splashPositionBuffer.toAttribute(), horizontal: true, vertical: true } );
	splashMaterial.depthWrite = false;
	splashMaterial.depthTest = true;
	splashMaterial.transparent = true;
	//splashMaterial.blending = THREE.AdditiveBlending;

	const splashGeometry = new THREE.PlaneGeometry( 0.2, 0.2 );
	splashParticles = new THREE.Mesh( splashGeometry, splashMaterial );
	splashParticles.count = instanceCount;
	splashParticles.frustumCulled = false;
	splashParticles.layers.set( 1 );
	scene.add( splashParticles );

}

const cameraDir = new THREE.Vector3();

function refresh() {

	scene.add( rainParticles );
	scene.add( splashParticles );

}

function update() {

	uCameraPos.value.copy( camera.position );
	camera.getWorldDirection( cameraDir );
	cameraDir.y = 0;
	cameraDir.normalize();
	uCameraDir.value.copy( cameraDir );

	// Run compute shaders to update positions
	renderer.compute( computeParticles );
	renderer.compute( computeSplash );

}

function dispose() {

	console.log( 'dispose rain' );

	scene.remove( rainParticles );
	rainParticles.geometry.dispose();
	rainParticles.material.dispose();

	scene.remove( splashParticles );
	splashParticles.geometry.dispose();
	splashParticles.material.dispose();


	collisionHeight.dispose();

}

export { init, refresh, update, dispose };
