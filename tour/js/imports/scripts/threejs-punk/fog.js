import { color, float, fog, positionView, positionWorld } from 'three/tsl';
import { scene } from 'threejs-punk/scene';

let fogNode;

function init() {

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

	fogNode = fog( fogColor.pow( 3 ), fogFactor );
	scene.fogNode = fogNode;

}

function refresh() {

	if ( fogNode ) {

		scene.fogNode = fogNode;

	}

}

function update() {}

function dispose() {

	scene.fogNode = null;

}

export { init, refresh, update, dispose, fogNode };
