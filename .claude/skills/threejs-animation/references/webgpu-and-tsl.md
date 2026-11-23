# WebGPU and TSL

Everything above — mixer, actions, bone transforms, morph weights — is computed on the CPU and drives a model under WebGPURenderer unchanged. TSL adds animation on the GPU: `time` (elapsed seconds) and `deltaTime` (seconds since the previous frame) are float uniforms the renderer refreshes every frame, and the oscillators `oscSine`, `oscSquare`, `oscTriangle` and `oscSawtooth` return 0-to-1 waves with a one-second period from a time node, defaulting to `time` (`oscSine(time.mul(0.5))` takes two seconds). Per-vertex motion needs a node material and a subdivided mesh.

```javascript
import * as THREE from "three/webgpu";
import { positionLocal, time, vec3 } from "three/tsl";

const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init(); // before any other use of the renderer
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111418); // the WebGPU canvas is transparent by default

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 3);
camera.lookAt(0, 0, 0);

// Ripple a subdivided plane along its normal (local z) on the GPU; time drives it, no per-frame JS
const material = new THREE.MeshBasicNodeMaterial({ wireframe: true });
material.positionNode = positionLocal.add(
  vec3(0, 0, positionLocal.x.mul(2).sin().mul(time.mul(2).cos()).mul(0.2)),
);
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3, 32, 32), material);
mesh.rotation.x = -Math.PI / 2;
scene.add(mesh);

function animate() {
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
```

On a skinned mesh, build displacement on `positionLocal`: skinning, morph targets, batching and instancing are applied to it before `positionNode` runs, so the mixer-driven pose survives. `positionGeometry` is the raw rest-pose attribute — never the base for displacement on an animated mesh.

```javascript
import * as THREE from "three/webgpu";
import { color, mix, oscSine, positionLocal, vec3 } from "three/tsl";

// The pulse rides on top of the skinned pose: positionLocal already carries it
const material = new THREE.MeshBasicNodeMaterial();
material.positionNode = positionLocal.add(vec3(0, oscSine().mul(0.05), 0));

// Oscillators animate any node slot, not just positions
material.colorNode = mix(color(0x202030), color(0xffd24a), oscSine());

const skinnedMesh = scene.getObjectByProperty("type", "SkinnedMesh"); // a loaded animated model
if (skinnedMesh) skinnedMesh.material = material;
```
