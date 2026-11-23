---
name: threejs-animation
description: "Keyframe, skeletal and morph-target animation, procedural motion and clip blending, on WebGL or with WebGPU and TSL. Use when animating objects, playing glTF animations, posing bones, driving morph targets, or mixing and crossfading clips."
---

> **CampusCove note.** Vendored from [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) @ 0e18186, MIT (`_third-party/LICENSE-CloudAI-X.txt`); this note was added and the large sections were moved unchanged to `references/` (headings lowered one level, a contents list added).
>
> **Version gap:** written for three r186; CampusCove runs **r170** with `WebGLRenderer` only. In r170: `Timer` is `import { Timer } from 'three/addons/misc/Timer.js'` (not `THREE.Timer`, `Clock` is not deprecated); `HDRLoader` is `RGBELoader`; `PCFSoftShadowMap` is not deprecated; `SunLight`, `LightProbeGridWebGL`, `USDLoader`, `HTMLTexture`, `VideoFrameTexture` do not exist. Skip every WebGPU/TSL and React section. Keep the project's import style `three/examples/jsm/...`: the "use `three/addons/`" mistake listed below is about browser import maps and does not apply under Vite. Check `front/node_modules/three` before using an API named here, and do not migrate the existing `requestAnimationFrame` loop (`useGameMovement.ts`) unless asked.
>
> Here: avatar clips are `Idle`/`Walk`/`Run` chosen by `avatar/avatarAnimationLogic.ts` (unit-tested, keep it pure); first-person arms clips are `Idle`, `Walk`, `Equip`, `UseDoor`, `UseKey` (`game/firstPersonArms.ts`). Clips are authored in Blender, not keyframed in code.
>
> Advisory reference: CampusCove's own skills (`game-feature`, `blender-asset`, `playtest-game`, ...) win on any conflict.

# Three.js Animation

Targets three.js r186. Examples use WebGLRenderer; the WebGPU and TSL section uses WebGPURenderer.

## Quick Start

```javascript
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 3);

const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());
scene.add(mesh);

const timer = new THREE.Timer();
timer.connect(document); // also keeps deltas small after the tab was hidden

function animate() {
  timer.update(); // first thing each frame: fixes getDelta()/getElapsed() for this frame
  const delta = timer.getDelta();
  const elapsed = timer.getElapsed();

  mesh.rotation.y += delta; // frame-rate-independent spin
  mesh.position.y = Math.sin(elapsed * 2) * 0.25; // bob on absolute time

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
```

## How the System Fits Together

- **AnimationClip**: keyframe data — tracks of times and values, no playback state.
- **AnimationMixer**: plays clips on one root object and all its descendants.
- **AnimationAction**: playback control for one clip on one mixer.

Each frame, `mixer.update(delta)` samples the active clips and writes the values into ordinary object properties. The system runs on the CPU and never touches the renderer, so it drives models the same way under either renderer.

## Reference files

Open the file that matches the task. Each is one level deep from this file.

- [AnimationClip and Keyframe Tracks](references/animationclip-and-keyframe-tracks.md)
- [AnimationMixer](references/animationmixer.md)
- [AnimationAction](references/animationaction.md)
- [Playing glTF Animations](references/playing-gltf-animations.md)
- [Skeletal Animation](references/skeletal-animation.md)
- [Morph Targets](references/morph-targets.md)
- [Blending Clips by Weight](references/blending-clips-by-weight.md)
- [Clip Utilities](references/clip-utilities.md)
- [Procedural Motion](references/procedural-motion.md)
- [Performance](references/performance.md)
- [WebGPU and TSL](references/webgpu-and-tsl.md)

## Common Mistakes

- `const clock = new THREE.Clock();` → `const timer = new THREE.Timer(); timer.connect(document);`: the Clock class is deprecated in r183 and Timer is its replacement.
- `const elapsed = clock.getElapsedTime(); const delta = clock.getDelta();` → `timer.update(); const delta = timer.getDelta(); const elapsed = timer.getElapsed();`: getElapsedTime() calls getDelta() internally, so the following delta read is about zero and the mixer stalls.
- `requestAnimationFrame(animate);` → `renderer.setAnimationLoop(animate);`: both renderers' docs advise it over a manual loop, and it hands frames to the WebXR session when one starts.
- `import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";` → `import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";`: the examples/jsm specifier does not resolve under the standard import map.
- `new THREE.NumberKeyframeTrack(".material.opacity", [0, 1, 2], [1, 0])` → `new THREE.NumberKeyframeTrack(".material.opacity", [0, 1], [1, 0])`: values must hold times.length × valueSize entries; with a fractional ratio play() never returns, and any other mismatch samples wrong values.
- `new THREE.StringKeyframeTrack(".morphTargetInfluences[smile]", [0, 1], ["0", "1"])` → `new THREE.NumberKeyframeTrack(".morphTargetInfluences[smile]", [0, 1], [0, 1])`: morph influences are numbers, and a string track writes "0"/"1" strings into the array.
- `headBone.rotation.y = Math.sin(t) * 0.3; mixer.update(delta);` → `mixer.update(delta); headBone.rotation.y = Math.sin(t) * 0.3;`: update() writes the clip's pose over any value set before it.
- `clip.resetDuration()` → `action.reset()`: resetDuration() only recomputes the clip's duration from its longest track, while reset() rewinds the action to time 0 and re-enables it after a one-shot finished.
- `material.positionNode = positionGeometry.add(offset)` → `material.positionNode = positionLocal.add(offset)`: positionGeometry is the raw attribute, so building on it drops skinning, morph targets, batching and instancing.
- `const uTime = uniform(0); uTime.value = timer.getElapsed(); const wave = uTime.mul(2).sin();` → `const wave = time.mul(2).sin();`: the renderer already advances the TSL time node every frame, so a Timer-fed uniform is redundant per-frame JavaScript.
- `const model2 = model.clone();` → `const model2 = SkeletonUtils.clone(model);`: cloning a skinned model shares its skeleton between the copies; each copy needs its own.
- `import { clone } from "three/addons/utils/SkeletonUtils.js";` → `import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";`: the namespace keeps the call as SkeletonUtils.clone(model), which cannot be mistaken for the skeleton-sharing model.clone().
- `new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject))` → `await loader.loadAsync(url)`: loaders already expose the promise form, and loadAsync takes the progress callback as its second argument.

## See Also

- `threejs-fundamentals` — render loop, Timer, renderer and scene setup
- `threejs-loaders` — loading glTF models and their animation clips
- `threejs-shaders` — GPU vertex displacement with TSL or ShaderMaterial
