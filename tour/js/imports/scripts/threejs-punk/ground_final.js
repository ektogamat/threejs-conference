import * as THREE from 'three';
import { Fn, Loop, uv, texture, reflector, screenUV, normalView, normalViewGeometry, positionWorld, vec2, vec3, vec4, float, dot, floor, fract, int, length, max, normalize, sin, smoothstep, sqrt, uniform, normalMap, textureBicubic } from 'three/tsl';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';
import { collisionHeight } from './collisionHeight.js';

// --- Rain Ripples TSL (based on src/tsl/rainRipples.js) ---

const MAX_RADIUS = 1;
const HASHSCALE1 = 0.1031;
const HASHSCALE3 = vec3( 0.1031, 0.103, 0.0973 );
const CELL_COUNT = ( MAX_RADIUS * 2 + 1 ) ** 2;

export const blendNormalMaps = /*@__PURE__*/ Fn( ( [ n1, n2 ] ) => {

	// Unpack normal map values from [0, 1] to [-1, 1] range
	const n1Unpacked = n1.xyz.mul( 2.0 ).sub( 1.0 );
	const n2Unpacked = n2.xyz.mul( 2.0 ).sub( 1.0 );

	// Perform Whiteout normal blending on the unpacked values
	const blended = normalize( vec3( n1Unpacked.xy.add( n2Unpacked.xy ), n1Unpacked.z.mul( n2Unpacked.z ) ) );

	// Pack the blended normal back to [0, 1] range and return as vec4
	return vec4( blended.mul( 0.5 ).add( 0.5 ), 1.0 );

}, { n1: 'vec4', n2: 'vec4', return: 'vec4' } );


const hash12 = Fn( ( [ p ] ) => {

	const p3 = fract( vec3( p.x, p.yx ).mul( HASHSCALE1 ) );
	const p3Dot = p3.add( dot( p3, p3.yzx.add( 19.19 ) ) );
	return fract( p3Dot.x.add( p3Dot.y ).mul( p3Dot.z ) );

} );

const hash22 = Fn( ( [ p ] ) => {

	const p3 = fract( vec3( p.x, p.yx ).mul( HASHSCALE3 ) );
	const p3Dot = p3.add( dot( p3, p3.yzx.add( 19.19 ) ) );
	return fract( p3Dot.xx.add( p3Dot.yz ).mul( p3Dot.zy ) );

} );

function createRainRipples( { uTime, uRippleSpeed = uniform( 3 ) } ) {

	const getRipples = Fn( ( [ uvCoord ] ) => {

		const p0 = floor( uvCoord );
		const time = uTime.mul( uRippleSpeed );
		const circles = vec2( 0 ).toVar();

		Loop(
			{ start: int( - MAX_RADIUS ), end: int( MAX_RADIUS ), name: 'i', condition: '<=' },
			( { i: iNode } ) => {

				Loop(
					{ start: int( - MAX_RADIUS ), end: int( MAX_RADIUS ), name: 'j', condition: '<=' },
					( { j: jNode } ) => {

						const pi = p0.add( vec2( iNode, jNode ) );
						const hsh = pi;
						const p = pi.add( hash22( hsh ) );
						const t = fract( float( 0.3 ).mul( time ).add( hash12( hsh ) ) );
						const v = p.sub( uvCoord );
						const d = length( v ).sub( float( MAX_RADIUS + 1 ).mul( t ) );
						const h = float( 0.001 );
						const d1 = d.sub( h );
						const d2 = d.add( h );
						const p1 = sin( float( 31 ).mul( d1 ) )
							.mul( smoothstep( float( - 0.6 ), float( - 0.3 ), d1 ) )
							.mul( smoothstep( float( 0 ), float( - 0.3 ), d1 ) );
						const p2 = sin( float( 31 ).mul( d2 ) )
							.mul( smoothstep( float( - 0.6 ), float( - 0.3 ), d2 ) )
							.mul( smoothstep( float( 0 ), float( - 0.3 ), d2 ) );
						const fade = float( 1 ).sub( t ).mul( float( 1 ).sub( t ) );
						const derivative = p2.sub( p1 ).div( h.mul( 2 ) ).mul( fade );
						circles.addAssign( normalize( v ).mul( derivative ).mul( 0.5 ) );

					}
				);

			}
		);

		circles.divAssign( float( CELL_COUNT ) );
		const z = sqrt( max( float( 1 ).sub( dot( circles, circles ) ), float( 0 ) ) );
		return vec3( circles, z );

	} );

	return getRipples;

}

// --- Ground ---

let ground, albedoMap, roughnessMap, normalMapTex, reflection;

const uTime = uniform( 0 );
const uRippleScale = uniform( 4.83 );
const uRippleSpeed = uniform( 3 );
const uRippleStrength = uniform( 0.5 );

async function init() {

	console.log( 'init ground' );
	console.log( 'testing', collisionHeight );

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

	const material = new THREE.MeshStandardNodeMaterial( {
		metalness: 0.0
	} );

	// TSL tiled UV for ground textures
	const tiledUV = uv().mul( 25 ).add( .13 );
	const albedo = texture( albedoMap, tiledUV ).mul( texture( albedoMap, tiledUV.mul( 2.5 ) ) );
	const roughness = texture( roughnessMap, tiledUV ).min( texture( roughnessMap, tiledUV.mul( 2.5 ) ) ).r.pow( .7 ).min( .6 ).saturate();
	const normalSample = blendNormalMaps( texture( normalMapTex, tiledUV ), texture( normalMapTex, tiledUV.mul( 2.5 ) ) );

	// color
	material.colorNode = albedo;

	// Rain ripples driven by positionWorld.xz (factory pattern from createRainRipples)
	const getRipples = createRainRipples( { uTime, uRippleSpeed } );
	const rippleSample = getRipples( positionWorld.xz.mul( uRippleScale ) );

	// Mask ripples using collisionHeight: only show where Y is close to ground level (-5.4)
	const collisionUV = collisionHeight.getUV( positionWorld );
	const heightVal = texture( collisionHeight.renderTarget.texture, collisionUV ).y;
	const inBounds = collisionUV.x.greaterThan( 0 ).and( collisionUV.x.lessThan( 1 ) )
		.and( collisionUV.y.greaterThan( 0 ) ).and( collisionUV.y.lessThan( 1 ) );
	// If height is less than -5.3, it means the ground is the highest surface (nothing blocking rain)
	const rippleMask = inBounds.select( heightVal.lessThan( - 5.3 ), float( 0 ) );

	const wetness = roughness.oneMinus().pow( 2.0 );
	const rippleNormalOffset = rippleSample.xy.mul( uRippleStrength ).mul( rippleMask ).mul( wetness );

	// Perturb the normal map with rain ripple displacement
	const perturbedNormal = vec4( normalSample.xy.add( rippleNormalOffset ), normalSample.zw );
	material.normalNode = normalMap( perturbedNormal );

	// Planar Reflector similar to webgpu_reflection_roughness
	reflection = reflector( { resolutionScale: 0.5, bounces: false, generateMipmaps: true } ).toInspector( 'reflector' );
	reflection.target.rotation.x = - Math.PI / 2;
	reflection.target.position.y = - 5.4;
	scene.add( reflection.target );

	// Disable rain and splash layers (layer 1) on the reflector camera so they don't appear in reflections
	const virtualCamera = reflection.reflector.getVirtualCamera( camera );
	virtualCamera.layers.disable( 1 );

	// Bind physical configuration: roughness to blur the reflection
	material.roughnessNode = roughness;

	// Map blurred reflection to emissive based on physical configuration (wetness)
	material.emissiveNode = Fn( () => {

		// Warp reflection UV using the perturbed view-space normal for realistic surface ripples/bumps
		const normalOffset = normalView.sub( normalViewGeometry ).xy.mul( 0.035 );
		const reflectionUV = screenUV.flipX().add( normalOffset );

		// blur reflection using hashBlur() with custom UV (exponential curve for smoother transition)
		//const dirtyReflection = hashBlur( texture( reflection, reflectionUV ), roughness.pow( 3.0 ).mul( 0.25 ) );
		const dirtyReflection = textureBicubic( texture( reflection, reflectionUV ), roughness ); // .pow( 3.0 ).mul( 0.25 )

		// wetness determines reflection intensity (sharp non-linear drop-off for dry areas)
		const wetness = roughness.oneMinus().pow( 4.0 );

		// base reflection strength of 0.5
		return dirtyReflection.rgb.mul( wetness ).mul( 0.5 );

	} )();

	const geometry = new THREE.PlaneGeometry( 400, 400 );
	ground = new THREE.Mesh( geometry, material );
	ground.rotation.x = - Math.PI / 2;
	ground.position.y = - 5.4;
	ground.receiveShadow = true;

	scene.add( ground );

}

let lastTime = 0;

function refresh() {

	scene.add( reflection.target );
	scene.add( ground );

}

function update() {

	//console.log( 'init ground' );

	const now = performance.now() / 1000;
	const delta = lastTime === 0 ? 0.016 : now - lastTime;
	lastTime = now;

	uTime.value += delta;

}

function dispose() {

	console.log( 'dispose ground' );

	scene.remove( ground );
	ground.geometry.dispose();
	ground.material.dispose();

	albedoMap.dispose();
	roughnessMap.dispose();
	normalMapTex.dispose();

	scene.remove( reflection.target );
	reflection.dispose();

}

export { init, refresh, update, dispose, ground };
