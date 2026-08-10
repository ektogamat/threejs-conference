import { fog, positionWorld, cameraPosition, float, color } from 'three/tsl';

// Simple height fog rising from the floor
const fogColor = color( 0xb6c5cb );
const fogDensity = float( 0.002 );
const fogHeight = float( 0.5 ); // fog fades out above this height
const fogFloor = float( - 5.4 ); // ground level Y

function init() {

	const distance = positionWorld.sub( cameraPosition ).length();

	// Height factor: dense at floor, fades exponentially above fogHeight
	const heightAboveFloor = positionWorld.y.sub( fogFloor ).max( 0 );
	const heightFade = heightAboveFloor.div( fogHeight ).negate().exp(); // 1 at floor → 0 above

	const fogFactor = fogDensity.mul( distance ).mul( heightFade ).clamp( 0, 1 );

	scene.fogNode = fog( fogColor, fogFactor );

}

function update() {}

function dispose() {

	scene.fogNode = null;

}

export { init, update, dispose };
