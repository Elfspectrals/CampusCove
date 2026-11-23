---
name: threejs-loaders
description: "Loading three.js assets: glTF with Draco, meshopt and KTX2 compression, other model formats, textures, HDR and EXR environments, progress, caching, cloning and disposal. Use when loading 3D models, textures or environment maps, or managing loading progress, on WebGL or with WebGPU and TSL."
---

> **CampusCove note.** Vendored from [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) @ 0e18186, MIT (`_third-party/LICENSE-CloudAI-X.txt`); this note was added and the large sections were moved unchanged to `references/` (headings lowered one level, a contents list added).
>
> **Version gap:** written for three r186; CampusCove runs **r170** with `WebGLRenderer` only. In r170: `Timer` is `import { Timer } from 'three/addons/misc/Timer.js'` (not `THREE.Timer`, `Clock` is not deprecated); `HDRLoader` is `RGBELoader`; `PCFSoftShadowMap` is not deprecated; `SunLight`, `LightProbeGridWebGL`, `USDLoader`, `HTMLTexture`, `VideoFrameTexture` do not exist. Skip every WebGPU/TSL and React section. Keep the project's import style `three/examples/jsm/...`: the "use `three/addons/`" mistake listed below is about browser import maps and does not apply under Vite. Check `front/node_modules/three` before using an API named here, and do not migrate the existing `requestAnimationFrame` loop (`useGameMovement.ts`) unless asked.
>
> Here: every GLTF goes through `front/src/game/gltfLoaderFactory.ts` (one shared `DRACOLoader`, decoder **self-hosted** at `/draco-decoder/` on purpose: when upgrading three, refresh those decoder files to the same release instead of removing `setDecoderPath`) and URLs come from `game/assets/catalog.ts`; add loader wiring there, never a second loader per file.
>
> Advisory reference: CampusCove's own skills (`game-feature`, `blender-asset`, `playtest-game`, ...) win on any conflict.

# Three.js Loaders

Targets three.js r186. Examples use WebGLRenderer; the WebGPU and TSL section uses WebGPURenderer.

## Quick Start

```javascript
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // glTF PBR materials render black without lights or an environment

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2, 1.5, 3);
camera.lookAt(0, 0, 0);

const gltf = await new GLTFLoader().loadAsync("model.glb");
scene.add(gltf.scene);

function animate() {
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
```

## Reference files

Open the file that matches the task. Each is one level deep from this file.

- [LoadingManager](references/loadingmanager.md)
- [Texture Loading](references/texture-loading.md)
- [HDR Environments](references/hdr-environments.md)
- [glTF and GLB](references/gltf-and-glb.md)
- [Other Model Formats](references/other-model-formats.md)
- [Async Patterns and Custom Sources](references/async-patterns-and-custom-sources.md)
- [Cloning and Disposal](references/cloning-and-disposal.md)
- [WebGPU and TSL](references/webgpu-and-tsl.md)

## Common Mistakes

- `import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"` → `import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"`: the `three/examples/jsm/` specifier does not resolve under the import map three.js documents.
- `import { RGBELoader } from "three/addons/loaders/RGBELoader.js"` → `import { HDRLoader } from "three/addons/loaders/HDRLoader.js"`: renamed from RGBELoader in r180; the old class warns on every construction.
- `new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject))` → `loader.loadAsync(url)`: every loader already implements loadAsync, which rejects on error.
- `material.map = new THREE.TextureLoader().load("color.jpg")` → `const map = new THREE.TextureLoader().load("color.jpg"); map.colorSpace = THREE.SRGBColorSpace; material.map = map;`: a loaded color map defaults to NoColorSpace and renders washed out.
- `normalMap.colorSpace = THREE.LinearSRGBColorSpace` → `normalMap.colorSpace = THREE.NoColorSpace`: scalar maps (normal, bump, roughness, metalness, ao, alpha) keep NoColorSpace; LinearSRGBColorSpace is for linear color data.
- `texture.encoding = THREE.sRGBEncoding` → `texture.colorSpace = THREE.SRGBColorSpace`: encoding and sRGBEncoding no longer exist, so the old line leaves the map at NoColorSpace and it renders washed out.
- `child.material.envMapIntensity = 0.5` → `scene.environmentIntensity = 0.5`: envMapIntensity scales only material.envMap, which stays null when the model is lit by scene.environment.
- `scene.environment = pmremGenerator.fromEquirectangular(hdrTexture).texture` → `hdrTexture.mapping = THREE.EquirectangularReflectionMapping; scene.environment = hdrTexture;`: both renderers run that PMREM step themselves for an equirectangular texture, so the manual pass only adds code and a render target to dispose.
- `scene.background = hdrTexture` → `hdrTexture.mapping = THREE.EquirectangularReflectionMapping; scene.background = hdrTexture;`: without the mapping, a background texture draws as a flat screen quad.
- `ktx2Loader.setTranscoderPath(pathFromAnotherRelease)` → `const ktx2Loader = new KTX2Loader().detectSupport(renderer)`: the Basis transcoder and the Draco decoder load from the three package by default; a path pinned to another release mismatches the loader.
- `ktx2Loader.detectSupportAsync(renderer)` → `await renderer.init(); ktx2Loader.detectSupport(renderer);`: detectSupportAsync is deprecated in r181; call detectSupport once the renderer is initialized.
- `renderer.capabilities.getMaxAnisotropy()` → `renderer.getMaxAnisotropy()`: capabilities exists on WebGLRenderer only; under WebGPURenderer use the renderer method.
- `scene.add(new THREE.Mesh(await new PLYLoader().loadAsync("scan.ply"), material))` → `const geometry = await new PLYLoader().loadAsync("scan.ply"); for (const [name, a] of Object.entries(geometry.attributes)) if (a.array instanceof Float64Array) geometry.setAttribute(name, new THREE.Float32BufferAttribute(a.array, a.itemSize)); scene.add(new THREE.Mesh(geometry, material));`: PLYLoader keeps double properties as Float64 attributes, which WebGLRenderer cannot upload (it throws Unsupported buffer data format).
- `gltf.scene.clone()` → `SkeletonUtils.clone(gltf.scene)`: Object3D.clone() shares the skeleton, so every copy stays bound to the original's bones and follows its animation.
- `gltf.scene.dispose()` → `gltf.scene.traverse((child) => { child.geometry?.dispose(); for (const material of [child.material ?? []].flat()) { for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); } child.dispose(); })`: Object3D.dispose() frees renderer state for that object only, never its geometry, materials or textures, and material.dispose() does not free the material's textures.
- `fetch(url, { signal: controller.signal })` → `setTimeout(() => manager.abort(), 30000)`: loaders are cancelled through their LoadingManager, which aborts in-flight FileLoader requests.
- `new USDZLoader()` → `new USDLoader()`: deprecated in r179; USDLoader reads USD, USDA, USDC and USDZ.

## See Also

- `threejs-fundamentals` - renderer setup, resize handling and the app scaffold around loaded assets
- `threejs-textures` and `threejs-materials` - texture properties and color spaces, and adjusting the materials loaded models come with
- `threejs-asset-pipeline` - compressing and optimizing glTF files before they reach these loaders
- `threejs-animation` - AnimationMixer, clips and skinned-mesh playback
