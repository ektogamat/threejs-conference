import * as THREE from 'three';
import { float, normalMap, normalView, normalViewGeometry, positionWorld, reflector, screenUV, texture, textureBicubic, time, uv, vec4 } from 'three/tsl';
import { pcfSoft, ripples } from 'threejs-punk/utils';
import { collisionHeight } from 'threejs-punk/collisionHeight';
import { ground, camera } from 'threejs-punk/scene';

let material, reflection, albedoMap, roughnessMap, normalMapTex;

function init() {

	// ===========================================================================
	// 1. Ground Details (PBR Textures)
	// ===========================================================================

	const textureLoader = new THREE.TextureLoader();

	albedoMap = textureLoader.load( '/textures/wet-puddles-albedo.jpg' );
	albedoMap.wrapS = THREE.RepeatWrapping;
	albedoMap.wrapT = THREE.RepeatWrapping;
	albedoMap.colorSpace = THREE.SRGBColorSpace;

	roughnessMap = textureLoader.load( '/textures/wet-puddles-roughness.jpg' );
	roughnessMap.wrapS = THREE.RepeatWrapping;
	roughnessMap.wrapT = THREE.RepeatWrapping;

	normalMapTex = textureLoader.load( '/textures/wet-puddles-normal.jpg' );
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

	reflection = reflector( { resolutionScale: 0.5, generateMipmaps: true } );
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

	material = new THREE.MeshStandardNodeMaterial();
	material.colorNode = albedo.pow( 2 );
	material.roughnessNode = roughness;
	material.metalness = 0;
	material.normalNode = normalMap( perturbedNormal );
	material.emissiveNode = blurredReflection.rgb.mul( reflectionWetness );

	ground.material = material;

}

function refresh() {

	if ( reflection?.target ) {

		ground.add( reflection.target );

	}

	if ( material ) {

		ground.material = material;

	}

}

function update() {}

function dispose() {

	if ( reflection?.target ) {

		ground.remove( reflection.target );

	}

	if ( material ) {

		material.dispose();

	}

}

export { init, refresh, update, dispose, material, reflection };
