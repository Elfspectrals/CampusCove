# WebGPU and TSL

```javascript
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init(); // before any other use of the renderer
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827); // the WebGPU canvas is transparent by default
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2, 1.5, 3);
camera.lookAt(0, 0, 0);
const gltf = await new GLTFLoader().loadAsync("model.glb"); // loaded materials become node materials automatically
scene.add(gltf.scene);
function animate() { renderer.render(scene, camera); } renderer.setAnimationLoop(animate);
```

- `ktx2Loader.detectSupport(renderer)` and the `PMREMGenerator` methods (`fromScene`, `fromEquirectangular`, `fromCubemap`) throw before `await renderer.init()`. Max anisotropy is `renderer.getMaxAnisotropy()`; `renderer.capabilities` does not exist under WebGPURenderer.
- Gaussian splats: `SPLATLoader`, `SPZLoader`, `KSPLATLoader` and `GaussianSplatPLYLoader` load data for `new GaussianSplat(data)` from `three/addons/objects/GaussianSplat.js`, which requires WebGPURenderer.
