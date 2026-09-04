import * as THREE from 'three';
import { billboarding, color, deltaTime, Fn, hash, If, instancedArray, instanceIndex, positionGeometry, texture, time, uniform, uv } from 'three/tsl';
import { collisionHeight } from 'threejs-punk/collisionHeight';
import { scene, camera } from 'threejs-punk/scene';

const particleCount = 4000;
const area = { width: 60, height: 25, depth: 60 };

let rain, rainMaterial, rainGeometry;
let positionBuffer, velocityBuffer, computeInit, computeUpdate;

function init() {

	const center = uniform( camera.position );

	// 1. Storage buffers for particle positions and velocities
	positionBuffer = instancedArray( particleCount, 'vec3' );
	velocityBuffer = instancedArray( particleCount, 'vec3' );

	// 2. Compute Init: randomize initial rain positions within area
	computeInit = Fn( () => {

		const position = positionBuffer.element( instanceIndex );
		const velocity = velocityBuffer.element( instanceIndex );

		const randX = hash( instanceIndex );
		const randY = hash( instanceIndex.add( particleCount + 1 ) );
		const randZ = hash( instanceIndex.add( particleCount + 2 ) );

		position.x = randX.mul( area.width ).sub( area.width / 2 ).add( center.x );
		position.z = randZ.mul( area.depth ).sub( area.depth / 2 ).add( center.z );
		position.y = randY.mul( area.height ).add( center.y );

		velocity.y = randX.mul( - 5 ).add( - 30 );

	} )().compute( particleCount );

	// 3. Compute Update: move droplets down and detect collision using collisionHeight
	computeUpdate = Fn( () => {

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

			velocity.y = randX.mul( - 5 ).add( - 30 );

		} );

	} )().compute( particleCount );

	// Initial compute pass
	renderer.compute( computeInit );

	// 4. Streak shader: bright center with soft vertical fade
	const streak = uv().distance( .5 ).oneMinus().pow( 5 );

	// 5. Rain material with cylindrical billboarding
	rainMaterial = new THREE.NodeMaterial();
	rainMaterial.colorNode = color( 0xdcf4ff );
	rainMaterial.opacityNode = streak.mul( 0.35 );
	rainMaterial.positionNode = positionGeometry.add( positionBuffer.element( instanceIndex ) );
	rainMaterial.vertexNode = billboarding( { horizontal: true, horizontalRotation: true } );
	rainMaterial.depthWrite = false;
	rainMaterial.depthTest = true;
	rainMaterial.transparent = true;

	rainGeometry = new THREE.PlaneGeometry( 0.04, 0.8 );
	rain = new THREE.Mesh( rainGeometry, rainMaterial );
	rain.count = particleCount;
	rain.frustumCulled = false;
	rain.layers.set( 1 );

	// Run compute update on every frame before rendering
	rain.onBeforeRender = ( renderer ) => {

		renderer.compute( computeUpdate );

	};

	scene.add( rain );
	camera.layers.enable( 1 );

}

function refresh() {

	if ( rain ) {

		scene.add( rain );
		camera.layers.enable( 1 );

	}

}

function update() {}

function dispose() {

	if ( rain ) {

		scene.remove( rain );

	}

	if ( rainMaterial ) {

		rainMaterial.dispose();

	}

}

export { init, refresh, update, dispose, rain, computeUpdate, computeInit, rainMaterial, positionBuffer, velocityBuffer };
