---
name: threejs-textures
description: "Three.js textures: image loading, color spaces, UV channels and transforms, texture types from canvas to HDR and KTX2, render targets, texture memory. Use when working with images on materials, UV coordinates, cubemaps, render targets or texture optimization; on WebGL or with WebGPU and TSL."
---

> **CampusCove note.** Vendored from [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) @ 0e18186, MIT (`_third-party/LICENSE-CloudAI-X.txt`); this note was added and the large sections were moved unchanged to `references/` (headings lowered one level, a contents list added).
>
> **Version gap:** written for three r186; CampusCove runs **r170** with `WebGLRenderer` only. In r170: `Timer` is `import { Timer } from 'three/addons/misc/Timer.js'` (not `THREE.Timer`, `Clock` is not deprecated); `HDRLoader` is `RGBELoader`; `PCFSoftShadowMap` is not deprecated; `SunLight`, `LightProbeGridWebGL`, `USDLoader`, `HTMLTexture`, `VideoFrameTexture` do not exist. Skip every WebGPU/TSL and React section. Keep the project's import style `three/examples/jsm/...`: the "use `three/addons/`" mistake listed below is about browser import maps and does not apply under Vite. Check `front/node_modules/three` before using an API named here, and do not migrate the existing `requestAnimationFrame` loop (`useGameMovement.ts`) unless asked.
>
> Here: textures are painted procedurally in Blender and shipped as WebP inside the GLB (512 px props, 1024 px buildings); `front/src/game/sharedTextures.ts` dedupes identical GLB textures by content hash (the VRAM fix from `docs/OPEN_WORLD.md` phase 0). Lightmaps sample `uv1` (`channel = 1`).
>
> Advisory reference: CampusCove's own skills (`game-feature`, `blender-asset`, `playtest-game`, ...) win on any conflict.

# Three.js Textures

Targets three.js r186. Examples use WebGLRenderer; the WebGPU and TSL section uses WebGPURenderer.

## Quick Start

```javascript
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 2);

// Color images must be tagged sRGB or they render too bright and washed out
const texture = new THREE.TextureLoader().load("diffuse.jpg");
texture.colorSpace = THREE.SRGBColorSpace;

const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ map: texture }),
);
scene.add(mesh);

renderer.setAnimationLoop(animate);

function animate() {
  mesh.rotation.z += 0.01;
  renderer.render(scene, camera);
}
```

## Reference files

Open the file that matches the task. Each is one level deep from this file.

- [Loading](references/loading.md)
- [Color Space](references/color-space.md)
- [Transform: Wrap, Repeat, Offset, Rotation](references/transform-wrap-repeat-offset-rotation.md)
- [Filtering, Mipmaps, Anisotropy](references/filtering-mipmaps-anisotropy.md)
- [Texture Types](references/texture-types.md)
- [Compressed Textures (KTX2)](references/compressed-textures-ktx2.md)
- [Environment Maps](references/environment-maps.md)
- [Render Targets](references/render-targets.md)
- [Dynamic Reflections](references/dynamic-reflections.md)
- [UV Channels](references/uv-channels.md)
- [Texture Atlas](references/texture-atlas.md)
- [Standard Material Slots](references/standard-material-slots.md)
- [Disposal and Memory](references/disposal-and-memory.md)
- [WebGPU and TSL](references/webgpu-and-tsl.md)

## Common Mistakes

- `geometry.setAttribute("uv2", geometry.attributes.uv)` → `material.aoMap = aoTexture;`: aoMap samples the attribute picked by `texture.channel` (default 0, `uv`), so it needs no extra attribute and `uv2` is read only by textures whose `channel` is 2; only a separate baked unwrap goes in `uv1`, with `aoTexture.channel = 1`.
- `new RGBELoader()` → `new HDRLoader()`: renamed from RGBELoader to HDRLoader in r180; the old class still runs but logs a deprecation warning.
- `import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js"` → `import { EXRLoader } from "three/addons/loaders/EXRLoader.js"`: the browser import maps map `three/addons/` to examples/jsm/ and define no `three/examples/` key, so the examples path fails to resolve there.
- `texture.encoding = THREE.sRGBEncoding` → `texture.colorSpace = THREE.SRGBColorSpace`: `encoding` and the `sRGBEncoding` constant were removed; `colorSpace` replaced them.
- `const texture = loader.load("color.jpg")` → `const texture = loader.load("color.jpg"); texture.colorSpace = THREE.SRGBColorSpace;`: an LDR color image left at `NoColorSpace` renders too bright and washed out.
- `texture.minFilter = THREE.LinearFilter; // no mipmaps` → `texture.generateMipmaps = false;`: mipmaps are generated whenever `generateMipmaps` is true, whatever the filter, so LinearFilter alone still uploads them.
- `texture.generateMipmaps = false; texture.wrapS = THREE.ClampToEdgeWrapping; // non-power-of-two size` → `texture.wrapS = THREE.RepeatWrapping;`: WebGL 2 supports mipmaps and repeat wrapping on non-power-of-two textures, so nothing has to be disabled for them.
- `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` → `texture.anisotropy = renderer.getMaxAnisotropy()`: WebGPURenderer has no `capabilities` object; this is the call under WebGPU.
- `material.envMapIntensity = 0.5` → `scene.environmentIntensity = 0.5`: `envMapIntensity` scales only the material's own `envMap`, not `scene.environment`.
- `scene.environment = pmrem.fromEquirectangular(hdr).texture` → `hdr.mapping = THREE.EquirectangularReflectionMapping; scene.environment = hdr;`: the renderer prefilters an equirectangular environment itself, so manual PMREM of a loaded file adds nothing.
- `scene.background = hdr` → `hdr.mapping = THREE.EquirectangularReflectionMapping; scene.background = hdr;`: without `mapping`, an equirectangular texture draws as a flat screen-space quad instead of a surround.
- `ktx2Loader.detectSupportAsync(renderer)` → `await renderer.init(); ktx2Loader.detectSupport(renderer);`: the async variant was deprecated in r181, and support detection needs the initialized device.
- `ktx2Loader.setTranscoderPath("libs/basis/")` → `const ktx2Loader = new KTX2Loader(); ktx2Loader.detectSupport(renderer);`: the transcoder loads from the package, so a path is only needed when self-hosting, pinned to three@0.186.0.
- `new THREE.WebGLMultipleRenderTargets(width, height, 2)` → `new THREE.WebGLRenderTarget(width, height, { count: 2 })`: removed in r162; the attachments are `renderTarget.textures[0..count-1]`.
- `new THREE.WebGLCubeRenderTarget(256)` → `new THREE.CubeRenderTarget(256)`: under WebGPURenderer use `CubeRenderTarget` imported from `three/webgpu`; `WebGLCubeRenderTarget` is WebGL-only.
- `loader.load(url, onLoad, onProgress, onError)` → `manager.onProgress = (url, loaded, total) => console.log(url, loaded, total)`: TextureLoader's `onProgress` parameter is unsupported and never fires.
- `mesh.material.map = texture; // after the mesh has rendered` → `mesh.material.map = texture; mesh.material.needsUpdate = true;`: WebGLRenderer builds a material's shader for the maps it has at its first render, so a `map` added later stays invisible until the shader is rebuilt, which `needsUpdate` forces.
- `normalMap.colorSpace = THREE.LinearSRGBColorSpace` → `normalMap.colorSpace = THREE.NoColorSpace`: normal, roughness, metalness, ao, alpha and displacement maps hold data, not color, so they keep the default `NoColorSpace`.
- `const texture = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject))` → `const texture = await loader.loadAsync(url)`: `loadAsync` is that promise, built into the `Loader` base class.
- `cubeCamera.update(renderer, scene)` → `mesh.visible = false; cubeCamera.update(renderer, scene); mesh.visible = true;`: while visible, the reflective mesh is drawn into the cube map that its own `envMap` reads.

## See Also

- `threejs-materials` — material properties, blending, and physical materials beyond texture slots.
- `threejs-loaders` — loading managers, glTF models, and the loader family generally.
- `threejs-shaders` — custom GLSL texture sampling under WebGLRenderer.
- `threejs-lighting` — environment lighting and light units.
- `threejs-asset-pipeline` — encoding a model's textures to KTX2, WebP or AVIF with gltf-transform.
