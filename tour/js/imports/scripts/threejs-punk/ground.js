import * as THREE from 'three';
import { Fn, Loop, uv, texture, reflector, screenUV, normalView, normalViewGeometry, positionWorld, vec2, vec3, vec4, float, dot, floor, fract, int, length, max, normalize, sin, smoothstep, sqrt, uniform, normalMap } from 'three/tsl';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';

// --- Rain Ripples TSL (based on src/tsl/rainRipples.js) ---

const MAX_RADIUS = 1;
const HASHSCALE1 = 0.1031;
const HASHSCALE3 = vec3( 0.1031, 0.103, 0.0973 );
const CELL_COUNT = ( MAX_RADIUS * 2 + 1 ) ** 2;

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
const uRippleStrength = uniform( 0.00 );
const uRippleNormalStrength = uniform( 0.2 );

async function init() {

	console.log( 'init ground' );

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

	// TSL tiled UV for ground textures
	const tiledUV = uv().mul( 15 );
	const roughness = texture( roughnessMap, tiledUV ).r;
	const normalSample = texture( normalMapTex, tiledUV );

	// Rain ripples driven by positionWorld.xz (factory pattern from createRainRipples)
	const getRipples = createRainRipples( { uTime, uRippleSpeed } );
	const rippleSample = getRipples( positionWorld.xz.mul( uRippleScale ) );
	const rippleReflectionOffset = rippleSample.xy.mul( uRippleStrength );
	const rippleNormalOffset = rippleSample.xy.mul( uRippleNormalStrength );

	// Perturb the normal map with rain ripple displacement
	const perturbedNormal = vec4( normalSample.xy.add( rippleNormalOffset ), normalSample.zw );
	material.normalNode = normalMap( perturbedNormal );

	// Planar Reflector similar to webgpu_reflection_roughness
	reflection = reflector( { resolutionScale: 1.0, bounces: false, generateMipmaps: false } );
	reflection.target.rotation.x = - Math.PI / 2;
	reflection.target.position.y = - 5.4;
	scene.add( reflection.target );

	// Bind physical configuration: roughness to blur the reflection
	material.roughnessNode = roughness.mul( 0.95 ).saturate();

	// Map blurred reflection to emissive based on physical configuration (wetness)
	material.emissiveNode = Fn( () => {

		// Warp reflection UV using the perturbed view-space normal for realistic surface ripples/bumps
		const normalOffset = normalView.sub( normalViewGeometry ).xy.mul( 0.035 );
		const reflectionUV = screenUV.flipX().add( normalOffset ).add( rippleReflectionOffset );

		// blur reflection using hashBlur() with custom UV (exponential curve for smoother transition)
		const dirtyReflection = hashBlur( texture( reflection, reflectionUV ), roughness.pow( 3.0 ).mul( 0.1 ) );

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

	console.log( 'refresh' );

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

export { init, update, dispose, ground };
