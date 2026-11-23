# WebGPU and TSL
Controls and Raycaster are renderer-neutral: the picking and camera-control code above runs unchanged under WebGPURenderer. Raycaster tests CPU-side geometry, so it never sees `positionNode` displacement — pick against an undisplaced proxy mesh instead.
```javascript
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const renderer = new THREE.WebGPURenderer({ antialias: true }); await renderer.init(); // required before any other use
renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x111318); // WebGPU canvas is transparent by default
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100); camera.position.set(0, 1.5, 5);
scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x3a86ff }))); // unlit: no light needed
const controls = new OrbitControls(camera, renderer.domElement);
const timer = new THREE.Timer(); timer.connect(document);
renderer.setAnimationLoop(function animate() {
  timer.update();
  controls.update(timer.getDelta());
  renderer.render(scene, camera);
});
```
