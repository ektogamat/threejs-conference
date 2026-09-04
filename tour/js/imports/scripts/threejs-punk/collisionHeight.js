import * as THREE from 'three';
import { positionWorld, vec2, vec3, vec4, float, uniform } from 'three/tsl';
import { scene } from './scene.js';

class CollisionHeight {

	constructor( width, height, depth ) {

		this.width = width;
		this.height = height;
		this.depth = depth;
		this.position = new THREE.Vector3();

		const halfW = width / 2;
		const halfH = height / 2;

		this.camera = new THREE.OrthographicCamera( - halfW, halfW, halfH, - halfH, 0.1, depth );

		this.renderTarget = new THREE.RenderTarget( 512, 512 );
		this.renderTarget.texture.type = THREE.HalfFloatType;
		this.renderTarget.texture.magFilter = THREE.NearestFilter;
		this.renderTarget.texture.minFilter = THREE.NearestFilter;
		this.renderTarget.texture.generateMipmaps = false;

		// outputNode bypasses tone mapping entirely in WebGPU
		this.material = new THREE.MeshBasicNodeMaterial();
		this.material.outputNode = vec4( vec3( positionWorld.y ), 1 );

		// Single clean uniform tracking the Vector3 reference automatically
		this._positionNode = uniform( this.position );

	}

	update() {

		if ( ! scene ) return;

		this.camera.position.set( this.position.x, this.position.y, this.position.z );
		this.camera.lookAt( this.position.x, 0, this.position.z );
		this.camera.updateMatrixWorld( true );

		scene.overrideMaterial = this.material;
		renderer.setRenderTarget( this.renderTarget );
		renderer.render( scene, this.camera );

		renderer.setRenderTarget( null );
		scene.overrideMaterial = null;

	}

	// Maps a random [0,1] UV pair into a world XZ position within the collision area
	getPosition( uvNode ) {

		const w = float( this.width );
		const h = float( this.height );

		// rand [0,1] -> world range [center - half, center + half]
		const worldX = uvNode.x.mul( w ).add( this._positionNode.x.sub( w.div( 2 ) ) );
		const worldZ = uvNode.y.mul( h ).add( this._positionNode.z.sub( h.div( 2 ) ) );

		return vec2( worldX, worldZ );

	}

	// Maps a world XZ position into [0,1] UV coordinates matching the collision camera
	getUV( worldPos ) {

		const halfW = float( this.width / 2 );
		const halfH = float( this.height / 2 );

		// world -> [0, 1]: (pos - center + halfSize) / size
		const u = worldPos.x.sub( this._positionNode.x ).add( halfW ).div( float( this.width ) );
		const v = worldPos.z.sub( this._positionNode.z ).add( halfH ).div( float( this.height ) );

		return vec2( u, v );

	}

	dispose() {

		this.renderTarget.dispose();
		this.material.dispose();

	}

}

let collisionHeight;

function init() {

	collisionHeight = new CollisionHeight( 100, 100, 80 );
	collisionHeight.position.set( - 128, 50, 33 );
	collisionHeight.update();

}

function refresh() {

	collisionHeight.update();

}

function update() {

	collisionHeight.update();

}

function dispose() {

}

export { collisionHeight, init, refresh, update, dispose };
