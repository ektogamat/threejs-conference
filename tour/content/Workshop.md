<page name="Three.js Punk">

<page name="The Cyberpunk Scene">

We import the `threejs-punk/scene` script, which configures:
- **WebGPU Renderer & Scene**: A night sky backdrop and directional neon lighting.
- **Mesh Loading**: Streams the city mesh (`cyberpunk_compressed.glb`), the player bounds collider (`colider.glb`), and the sports car (`quadra.glb`).
- **OrbitControls**: Lets you drag to orbit the camera, scroll to zoom, and right-click drag to pan.

Run the code to view the scene:

```tsl
import 'threejs-punk/scene';
import 'threejs-punk/ground';
import 'threejs-punk/rain';
```

> [!TIP]
> - Click and drag the left mouse button to rotate around the city street.
> - Use the scroll wheel to zoom in and out.
> - Click and drag the right mouse button to pan.

</page>

<page name="Ground">

<page name="Creating the Ground">

Explain about ripple

```tsl ripple
import * as THREE from 'three';
import 'threejs-punk/scene';

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

const geometry = new THREE.PlaneGeometry( 400, 400 );
const ground = new THREE.Mesh( geometry, material );
ground.rotation.x = - Math.PI / 2;
ground.position.y = - 5.4;
ground.receiveShadow = true;

scene.add( ground );
```

</page>

<page name="Rain ripples">

```tsl
import 'threejs-punk/scene';
import 'threejs-punk/ground';
```

</page>

</page>

</page>
