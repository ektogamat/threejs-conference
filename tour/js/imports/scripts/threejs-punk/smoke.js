import * as THREE from 'three';
import { color, mix, range, rotateUV, smoothstep, texture, time, uniform, uv } from 'three/tsl';
import { car } from 'threejs-punk/scene';

let smokeMaterial, exhaustRight, exhaustLeft, smokeMap;

function init() {

	const textureLoader = new THREE.TextureLoader();
	smokeMap = textureLoader.load( '/textures/smoke.png' );
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
	smokeMaterial = new THREE.SpriteNodeMaterial();
	smokeMaterial.colorNode = mix( color( 0x9a9890 ), color( 0x4a4845 ), life.mul( 0.85 ) );
	smokeMaterial.opacityNode = opacityNode;
	smokeMaterial.positionNode = offsetRange.mul( lifeTime );
	smokeMaterial.scaleNode = scaleRange.mul( lifeTime.max( 0.25 ) );
	smokeMaterial.depthWrite = false;
	smokeMaterial.depthTest = true;
	smokeMaterial.transparent = true;

	// 5. Multiple sprites sharing the exact same material
	exhaustRight = new THREE.Sprite( smokeMaterial );
	exhaustRight.scale.setScalar( 6 );
	exhaustRight.count = 60;
	exhaustRight.position.set( 0.47, 0.52, - 2.45 );

	exhaustLeft = new THREE.Sprite( smokeMaterial );
	exhaustLeft.scale.setScalar( 6 );
	exhaustLeft.count = 60;
	exhaustLeft.position.set( - 0.51, 0.55, - 2.42 );

	if ( car ) {

		car.add( exhaustRight );
		car.add( exhaustLeft );

	}

}

function refresh() {

	if ( car && exhaustRight && exhaustLeft ) {

		car.add( exhaustRight );
		car.add( exhaustLeft );

	}

}

function update() {}

function dispose() {

	if ( car ) {

		if ( exhaustRight ) car.remove( exhaustRight );
		if ( exhaustLeft ) car.remove( exhaustLeft );

	}

	if ( smokeMaterial ) {

		smokeMaterial.dispose();

	}

}

export { init, refresh, update, dispose, smokeMaterial, exhaustRight, exhaustLeft };
