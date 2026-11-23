# glTF and GLB

The primary format for web delivery. The result carries `scene`, `animations`, `cameras`, `asset` (version, generator) and `userData` (authoring custom data).

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltf = await new GLTFLoader().loadAsync("model.glb");
scene.add(gltf.scene);

if (gltf.animations.length > 0) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(gltf.animations[0]).play();
  const timer = new THREE.Timer();
  timer.connect(document);

  function animate() {
    timer.update();
    mixer.update(timer.getDelta());
    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(animate);
}
```

## Draco, meshopt and KTX2 compression

The Draco decoder and the Basis transcoder load from the three package by default; call `setDecoderPath` / `setTranscoderPath` only when you host them yourself, and then pin the path to the three release you ship. A file that requires `EXT_meshopt_compression` or `KHR_meshopt_compression` fails to load unless `setMeshoptDecoder` is set.

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const gltfLoader = new GLTFLoader()
  .setDRACOLoader(new DRACOLoader())
  .setMeshoptDecoder(MeshoptDecoder)
  .setKTX2Loader(new KTX2Loader().detectSupport(renderer));

const gltf = await gltfLoader.loadAsync("compressed-model.glb");
scene.add(gltf.scene);
```

## Processing loaded content

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltf = await new GLTFLoader().loadAsync("model.glb");
const model = gltf.scene;

model.traverse((child) => {
  if (child.isMesh) {
    child.castShadow = true; // shadows also need renderer.shadowMap.enabled = true and a light with castShadow
    child.receiveShadow = true;
  }
});

model.getObjectByName("Head"); // look up named nodes

scene.environmentIntensity = 0.5; // dim scene.environment for this scene

// Center the model and scale it into a unit box
const box = new THREE.Box3().setFromObject(model);
const center = box.getCenter(new THREE.Vector3());
const size = box.getSize(new THREE.Vector3());
const scale = 1 / Math.max(size.x, size.y, size.z);
model.scale.setScalar(scale);
model.position.copy(center).multiplyScalar(-scale); // the offset is scaled too

scene.add(model);
```
