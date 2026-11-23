# Playing glTF Animations

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const gltf = await new GLTFLoader().loadAsync("model.glb");
const model = gltf.scene;
scene.add(model);

// GLTFLoader's default material (MeshStandardMaterial) is lit: without lights the model renders black
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 2);
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));

// gltf.animations is an array of parsed AnimationClips
const clips = gltf.animations;

const mixer = new THREE.AnimationMixer(model);
const walkClip = THREE.AnimationClip.findByName(clips, "Walk");
if (walkClip) mixer.clipAction(walkClip).play();

// A second character: clone the skinned model, give the copy its own mixer
const model2 = SkeletonUtils.clone(model);
model2.position.x = 1.5; // beside the first one
scene.add(model2);
const mixer2 = new THREE.AnimationMixer(model2);
if (walkClip) mixer2.clipAction(walkClip).play(); // same clip, two mixers

const timer = new THREE.Timer();
timer.connect(document);

function animate() {
  timer.update();
  const delta = timer.getDelta();
  mixer.update(delta);
  mixer2.update(delta);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
```
