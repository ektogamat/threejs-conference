import {
	Fn,
	Loop,
	dot,
	float,
	floor,
	fract,
	int,
	length,
	max,
	normalize,
	sin,
	smoothstep,
	sqrt,
	uniform,
	vec2,
	vec3,
	vec4,
} from 'three/tsl';

// Grid search radius & hash constants for procedural ripples
const MAX_RADIUS = 1;
const HASHSCALE1 = 0.1031;
const HASHSCALE3 = vec3( 0.1031, 0.103, 0.0973 );
const CELL_COUNT = ( MAX_RADIUS * 2 + 1 ) ** 2;

/**
 * 2D to 1D pseudo-random hash.
 */
const hash12 = /*@__PURE__*/ Fn( ( [ p ] ) => {

	const p3 = fract( vec3( p.x, p.yx ).mul( HASHSCALE1 ) );
	const p3Dot = p3.add( dot( p3, p3.yzx.add( 19.19 ) ) );
	return fract( p3Dot.x.add( p3Dot.y ).mul( p3Dot.z ) );

}, { p: 'vec2', return: 'float' } );

/**
 * 2D to 2D pseudo-random hash.
 */
const hash22 = /*@__PURE__*/ Fn( ( [ p ] ) => {

	const p3 = fract( vec3( p.x, p.yx ).mul( HASHSCALE3 ) );
	const p3Dot = p3.add( dot( p3, p3.yzx.add( 19.19 ) ) );
	return fract( p3Dot.xx.add( p3Dot.yz ).mul( p3Dot.zy ) );

}, { p: 'vec2', return: 'vec2' } );

/**
 * Blends two normal maps using Whiteout normal blending.
 */
export const blendNormalMaps = /*@__PURE__*/ Fn( ( [ n1, n2 ] ) => {

	// Unpack from [0, 1] to [-1, 1]
	const n1Unpacked = n1.xyz.mul( 2.0 ).sub( 1.0 );
	const n2Unpacked = n2.xyz.mul( 2.0 ).sub( 1.0 );

	// Whiteout blend
	const blended = normalize( vec3( n1Unpacked.xy.add( n2Unpacked.xy ), n1Unpacked.z.mul( n2Unpacked.z ) ) );

	// Pack back to [0, 1]
	return vec4( blended.mul( 0.5 ).add( 0.5 ), 1.0 );

}, { n1: 'vec4', n2: 'vec4', return: 'vec4' } );

/**
 * Generates procedural animated rain ripples and returns tangent-space normal perturbations (vec3).
 *
 * @param {Node<vec2>} uvCoord - Coordinate driving the ripple grid (e.g. positionWorld.xz * scale).
 * @param {Node<float>} uTime - Elapsed time driving propagation.
 * @param {Node<float>} uRippleSpeed - Ripple expansion speed multiplier.
 * @param {Node<float>} uRippleStep - Lifecycle spawn frequency multiplier.
 */
export const ripples = /*@__PURE__*/ Fn( ( [ uvCoord, uTime = uniform( 0 ), uRippleSpeed = float( 3 ), uRippleStep = float( 0.3 ) ] ) => {

	const p0 = floor( uvCoord );
	const time = uTime.mul( uRippleSpeed );
	const circles = vec2( 0 ).toVar();

	// Check neighboring grid cells for nearby raindrop centers
	Loop(
		{ start: int( - MAX_RADIUS ), end: int( MAX_RADIUS ), name: 'i', condition: '<=' },
		( { i: iNode } ) => {

			Loop(
				{ start: int( - MAX_RADIUS ), end: int( MAX_RADIUS ), name: 'j', condition: '<=' },
				( { j: jNode } ) => {

					const pi = p0.add( vec2( iNode, jNode ) );
					const hsh = pi;
					const p = pi.add( hash22( hsh ) );
					const t = fract( float( uRippleStep ).mul( time ).add( hash12( hsh ) ) );
					const v = p.sub( uvCoord );
					const d = length( v ).sub( float( MAX_RADIUS + 1 ).mul( t ) );
					const h = float( 0.001 );
					const d1 = d.sub( h );
					const d2 = d.add( h );

					// Circular wave profile with smooth edges
					const p1 = sin( float( 31 ).mul( d1 ) )
						.mul( smoothstep( float( - 0.6 ), float( - 0.3 ), d1 ) )
						.mul( smoothstep( float( 0 ), float( - 0.3 ), d1 ) );
					const p2 = sin( float( 31 ).mul( d2 ) )
						.mul( smoothstep( float( - 0.6 ), float( - 0.3 ), d2 ) )
						.mul( smoothstep( float( 0 ), float( - 0.3 ), d2 ) );

					// Quadratic fade out over ripple lifetime
					const fade = float( 1 ).sub( t ).mul( float( 1 ).sub( t ) );

					// Finite-difference derivative for normal slope
					const derivative = p2.sub( p1 ).div( h.mul( 2 ) ).mul( fade );
					circles.addAssign( normalize( v ).mul( derivative ).mul( 0.5 ) );

				}
			);

		}
	);

	// Average contributions and reconstruct Z normal component
	circles.divAssign( float( CELL_COUNT ) );
	const z = sqrt( max( float( 1 ).sub( dot( circles, circles ) ), float( 0 ) ) );
	return vec3( circles, z );

}, { uvCoord: 'vec2', uTime: 'float', uRippleSpeed: 'float', uRippleStep: 'float', return: 'vec3' } );
