# WebGPU and TSL

```javascript
import * as THREE from "three/webgpu";
import { texture, uv } from "three/tsl";

const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init(); // before any other use of the renderer
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // the WebGPU canvas starts transparent

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 2);

const map = new THREE.TextureLoader().load("diffuse.jpg");
map.colorSpace = THREE.SRGBColorSpace;
map.anisotropy = renderer.getMaxAnisotropy(); // no capabilities object under WebGPU

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicNodeMaterial());
mesh.material.colorNode = texture(map, uv().mul(0.5).add(0.25)); // custom UV transform in TSL: the center half, zoomed 2x
scene.add(mesh);

renderer.setAnimationLoop(animate);

function animate() {
  mesh.rotation.z += 0.01;
  renderer.render(scene, camera);
}
```

TSL sampling: `texture(map)` uses `uv()` plus the texture's own offset/repeat/rotation; an explicit node takes over the coordinates entirely. The classic slots (`map`, `normalMap`, `roughnessMap`, `aoMap`) work unchanged on node materials; `colorNode` is for custom sampling.

```javascript
import * as THREE from "three/webgpu";
import { texture, uv } from "three/tsl";
const map = new THREE.TextureLoader().load("diffuse.jpg");
map.colorSpace = THREE.SRGBColorSpace;
mesh.material.colorNode = texture(map); // uv() plus the texture's offset/repeat/rotation
mesh.material.colorNode = texture(map, uv(1)); // explicit node: samples the "uv1" attribute
```

`KTX2Loader.detectSupport(renderer)` queries device features, so call it after `await renderer.init()`. For dynamic reflections use `CubeRenderTarget` (not `WebGLCubeRenderTarget`) with the same hide-update-show CubeCamera pattern.

```javascript
import * as THREE from "three/webgpu";

const cubeRenderTarget = new THREE.CubeRenderTarget(256); // replaces WebGLCubeRenderTarget
const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
scene.add(cubeCamera);
mesh.material.envMap = cubeRenderTarget.texture;
mesh.visible = false; // hide so the mesh does not reflect itself
cubeCamera.position.copy(mesh.position);
cubeCamera.update(renderer, scene);
mesh.visible = true;
```
