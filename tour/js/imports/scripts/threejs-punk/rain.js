import * as THREE from 'three';
import { Fn, texture, uv, uint, instancedArray, positionWorld, billboarding, hash, vec2, vec4, instanceIndex, float, vec3 } from 'three/tsl';

class CollisionArea {

	constructor( width, height, depth ) {

		this.width = width;
		this.height = height;
		this.depth = depth;
		this.position = new THREE.Vector3();
		this.camera = null;
		this.renderTarget = null;
		this.material = null;

	}

	update() {

		const halfW = this.width / 2;
		const halfH = this.height / 2;

		if ( ! this.camera ) {

			this.camera = new THREE.OrthographicCamera( - halfW, halfW, halfH, - halfH, 0.1, this.depth );

		} else {

			this.camera.left = - halfW;
			this.camera.right = halfW;
			this.camera.top = halfH;
			this.camera.bottom = - halfH;
			this.camera.far = this.depth;
			this.camera.updateProjectionMatrix();

		}

		this.camera.position.set( this.position.x, this.position.y, this.position.z );
		this.camera.lookAt( this.position.x, 0, this.position.z );
		this.camera.updateMatrixWorld( true );

		// Create RenderTarget and override material on first update
		if ( ! this.renderTarget ) {

			this.renderTarget = new THREE.RenderTarget( 1024, 1024 );
			this.renderTarget.texture.type = THREE.HalfFloatType;
			this.renderTarget.texture.magFilter = THREE.NearestFilter;
			this.renderTarget.texture.minFilter = THREE.NearestFilter;
			this.renderTarget.texture.generateMipmaps = false;

			// outputNode bypasses tone mapping entirely in WebGPU
			this.material = new THREE.MeshBasicNodeMaterial();
			this.material.outputNode = vec4( positionWorld, 1 );

		}

	}

	// Maps a random [0,1] UV pair into a world XZ position within the collision area
	getPosition( uvNode ) {

		const w = float( this.width );
		const h = float( this.height );
		const cx = float( this.position.x );
		const cz = float( this.position.z );

		// rand [0,1] -> world range [center - half, center + half]
		const worldX = uvNode.x.mul( w ).add( cx.sub( w.div( 2 ) ) );
		const worldZ = uvNode.y.mul( h ).add( cz.sub( h.div( 2 ) ) );

		return vec3( worldX, float( 0 ), worldZ );

	}

	// Maps a world XZ position into [0,1] UV coordinates matching the collision camera
	getUV( worldPos ) {

		const halfW = float( this.width / 2 );
		const halfH = float( this.height / 2 );
		const cx = float( this.position.x );
		const cz = float( this.position.z );

		// world -> [0, 1]: (pos - center + halfSize) / size
		const u = worldPos.x.sub( cx ).add( halfW ).div( float( this.width ) );
		const v = worldPos.z.sub( cz ).add( halfH ).div( float( this.height ) );

		return vec2( u, v );

	}

	dispose() {

		if ( this.renderTarget ) {

			this.renderTarget.dispose();

		}

		if ( this.material ) {

			this.material.dispose();

		}

	}

}

const maxParticleCount = 5000;
const instanceCount = maxParticleCount;

let rainParticles, debugPlane;
let computeParticles, collisionArea;

async function init() {

	// Instantiate and configure CollisionArea around the street focus (x = -128, z = 33)
	collisionArea = new CollisionArea( 100, 100, 80 );
	collisionArea.position.set( - 128, 50, 33 );
	collisionArea.update();

	// Particle storage buffers
	const positionBuffer = instancedArray( maxParticleCount, 'vec3' );
	const velocityBuffer = instancedArray( maxParticleCount, 'vec3' );

	const randUint = () => uint( Math.random() * 0xFFFFFF );

	// Single compute shader to position particles on the floor
	const computeUpdate = Fn( () => {

		const position = positionBuffer.element( instanceIndex );
		const velocity = velocityBuffer.element( instanceIndex );

		const randX = hash( instanceIndex );
		const randZ = hash( instanceIndex.add( randUint() ) );

		// Spawn area using the collision area mapping
		const spawnPosition = collisionArea.getPosition( vec2( randX, randZ ) );
		position.x = spawnPosition.x;
		position.z = spawnPosition.z;

		// Map XZ position to [0,1] texture UV matching the collision camera
		const coords = collisionArea.getUV( position );

		// Sample positionWorld from the collision map
		// .y (green channel) contains the world Y height
		const collisionData = texture( collisionArea.renderTarget.texture, coords );
		const floorHeight = collisionData.y;

		position.y = floorHeight;

		velocity.y = float( 0 );
		velocity.x = float( 0 );
		velocity.z = float( 0 );

	} );

	computeParticles = computeUpdate().compute( maxParticleCount );

	// Run compute once to position particles on the floor
	renderer.compute( computeParticles );

	// Rain particles material
	const rainMaterial = new THREE.MeshBasicNodeMaterial();
	rainMaterial.colorNode = uv().distance( vec2( .5, 0 ) ).oneMinus().mul( 3 ).exp().mul( .15 );
	rainMaterial.vertexNode = billboarding( { position: positionBuffer.toAttribute() } );
	rainMaterial.opacity = .45;
	rainMaterial.side = THREE.DoubleSide;
	rainMaterial.forceSinglePass = true;
	rainMaterial.depthWrite = false;
	rainMaterial.depthTest = true;
	rainMaterial.transparent = true;

	const rainGeometry = new THREE.PlaneGeometry( .05, 1.2 );
	rainGeometry.translate( 0, 0.6, 0 );
	rainParticles = new THREE.Mesh( rainGeometry, rainMaterial );
	rainParticles.count = instanceCount;
	rainParticles.frustumCulled = false;
	scene.add( rainParticles );

	// Create a debug plane to inspect the heightmap (Green channel = Y height)
	const debugGeometry = new THREE.PlaneGeometry( 20, 20 );
	const debugMaterial = new THREE.MeshBasicNodeMaterial();
	debugMaterial.colorNode = texture( collisionArea.renderTarget.texture ).g.add( 50 ).div( 100 ).toInspector( 'Heightmap' );
	debugMaterial.side = THREE.DoubleSide;

	debugPlane = new THREE.Mesh( debugGeometry, debugMaterial );
	debugPlane.position.set( - 128, 5, 25 );
	debugPlane.rotation.y = - Math.PI / 2;
	scene.add( debugPlane );

}

function update() {

	if ( ! renderer || ! scene || ! rainParticles ) return;

	// Hide rain particles and debug plane from collision map
	rainParticles.visible = false;
	if ( debugPlane ) debugPlane.visible = false;

	scene.overrideMaterial = collisionArea.material;
	renderer.setRenderTarget( collisionArea.renderTarget );
	renderer.render( scene, collisionArea.camera );

	renderer.setRenderTarget( null );
	scene.overrideMaterial = null;

	// Make rain and debug plane visible again
	rainParticles.visible = true;
	if ( debugPlane ) debugPlane.visible = true;

	// Run compute shader to update particle positions
	renderer.compute( computeParticles );

}

function dispose() {

	if ( rainParticles ) {

		scene.remove( rainParticles );
		rainParticles.geometry.dispose();
		rainParticles.material.dispose();

	}

	if ( debugPlane ) {

		scene.remove( debugPlane );
		debugPlane.geometry.dispose();
		debugPlane.material.dispose();

	}

	if ( collisionArea ) {

		collisionArea.dispose();

	}

}

export { init, update, dispose };
