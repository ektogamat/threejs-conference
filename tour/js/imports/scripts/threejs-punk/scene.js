import * as THREE from 'three';
import { pass, saturation } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, controls, city, collider, car, sunLight, fillLight, ambientLight, defaultPass, renderPipeline;

const UNCOMPRESSED_FORMATS = new Set( [
	THREE.RGBAFormat,
	THREE.RGBFormat,
	THREE.RGFormat,
	THREE.RedFormat,
] );

let patchApplied = false;
function patchKTX2UncompressedTextures() {

	if ( patchApplied ) return;

	const createTextureFrom = KTX2Loader.prototype._createTextureFrom;
	KTX2Loader.prototype._createTextureFrom = function ( transcodeResult, container ) {

		const texture = createTextureFrom.call( this, transcodeResult, container );

		if ( ! texture.isCompressedTexture || ! UNCOMPRESSED_FORMATS.has( texture.format ) ) {

			return texture;

		}

		const mip = texture.mipmaps[ 0 ];
		const dataTexture = new THREE.DataTexture(
			mip.data,
			mip.width,
			mip.height,
			texture.format,
			texture.type,
		);

		dataTexture.minFilter = THREE.LinearFilter;
		dataTexture.magFilter = THREE.LinearFilter;
		dataTexture.colorSpace = texture.colorSpace;
		dataTexture.premultiplyAlpha = texture.premultiplyAlpha;
		dataTexture.wrapS = texture.wrapS;
		dataTexture.wrapT = texture.wrapT;
		dataTexture.needsUpdate = true;

		return dataTexture;

	};

	patchApplied = true;

}

async function init() {

	console.log( 'init' );

	//renderer.toneMapping = THREE.AgXToneMapping;

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x0a0818 );
	//scene.fog = new THREE.FogExp2( 0x0a0818, 0.015 );

	const width = renderer.domElement.clientWidth;
	const height = renderer.domElement.clientHeight;

	camera = new THREE.PerspectiveCamera( 55, width / height, 0.1, 1000 );
	camera.position.set( - 138, 5, 34 );

	defaultPass = pass( scene, camera ).toInspector( 'pass' );

	renderPipeline = new THREE.RenderPipeline( renderer );
	renderPipeline.outputNode = defaultPass;
	//renderPipeline.outputNode = saturation( defaultPass, 0 );

	controls = new OrbitControls( camera, renderer.domElement );
	controls.target.set( - 128, - 4, 33 );
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.maxPolarAngle = Math.PI / 2 - 0.05;
	controls.minDistance = 2;
	controls.maxDistance = 150;
	controls.update();

	sunLight = new THREE.DirectionalLight( '#cfefff', 8.0 );
	sunLight.position.set( 23, 100, 3 );
	scene.add( sunLight );

	fillLight = new THREE.DirectionalLight( '#ffd6c8', 2.0 );
	fillLight.position.set( - 18, 22, - 12 );
	scene.add( fillLight );

	ambientLight = new THREE.AmbientLight( 0xffffff, 0.15 );
	scene.add( ambientLight );

	patchKTX2UncompressedTextures();
	const loader = new GLTFLoader();

	const dracoLoader = new DRACOLoader();
	dracoLoader.setDecoderPath( '/libs/draco/' );
	loader.setDRACOLoader( dracoLoader );

	const ktx2Loader = new KTX2Loader();
	ktx2Loader.setTranscoderPath( '/libs/basis/' );
	ktx2Loader.detectSupport( renderer );
	loader.setKTX2Loader( ktx2Loader );

	const cityGltf = await loader.loadAsync( '/models/cyberpunk_compressed.glb' );
	city = cityGltf.scene;
	city.position.y = - 20;
	scene.add( city );

	const carGltf = await loader.loadAsync( '/models/quadra.glb' );
	car = carGltf.scene;
	car.position.set( - 128, - 5.47, 33 );
	car.rotation.y = Math.PI / 2 + 0.6;
	car.scale.set( 1.1, 1.1, 1.1 );
	scene.add( car );

}

function refresh() {

	scene.clear();

	scene.add( sunLight );
	scene.add( fillLight );
	scene.add( ambientLight );
	scene.add( city );
	scene.add( car );

	scene.fog = null;
	scene.fogNode = null;

	if ( renderer.inspector?.parameters ) {

		const parameters = renderer.inspector.parameters;

		if ( parameters.paramList?.children ) {

			for ( const item of [ ...parameters.paramList.children ] ) {

				parameters.paramList.remove( item );

			}

		}

		if ( parameters.groups ) {

			parameters.groups.length = 0;

		}

	}

	renderPipeline.outputNode = defaultPass;
	renderPipeline.needsUpdate = true;

}

function update() {

	controls.update();

	renderPipeline.render();

}

function resize( width, height ) {

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

}

function dispose() {

	controls.dispose();

}

export { scene, camera, controls, city, collider, car, sunLight, fillLight, ambientLight, defaultPass, renderPipeline };
