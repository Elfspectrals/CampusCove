# Async Patterns and Custom Sources

Load independent assets in parallel:

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const [model, environment, colorMap] = await Promise.all([
  new GLTFLoader().loadAsync("model.glb"),
  new HDRLoader().loadAsync("environment.hdr"),
  new THREE.TextureLoader().loadAsync("color.jpg"),
]);

environment.mapping = THREE.EquirectangularReflectionMapping;
colorMap.colorSpace = THREE.SRGBColorSpace;

scene.add(model.scene);
scene.environment = environment;
```

Parse data you already hold (a downloaded file, a file input, a database record):

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const response = await fetch("model.glb");
const buffer = await response.arrayBuffer();

const gltf = await new GLTFLoader().parseAsync(buffer, "");
scene.add(gltf.scene);
```

Blob URLs and data URLs work as loader URLs:

```javascript
async function loadTextureFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  const texture = await new THREE.TextureLoader().loadAsync(url);
  URL.revokeObjectURL(url);
  return texture;
}
```

Prefix paths and rewrite URLs through the manager:

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
loader.setPath("assets/models/"); // prefix for the URL you pass to load
loader.setResourcePath("assets/textures/"); // where the file's own references resolve
const gltf = await loader.loadAsync("model.glb"); // loads assets/models/model.glb

const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => url.replace("assets/", "https://cdn.example.com/assets/"));
const cdnGltf = await new GLTFLoader(manager).loadAsync("assets/models/model.glb"); // fetched from https://cdn.example.com/assets/models/model.glb
```

Enable the shared cache to serve repeated URLs from memory:

```javascript
THREE.Cache.enabled = true;
THREE.Cache.clear(); // empty it when you need to force reloads
```

Keep payloads small — Draco or meshopt for geometry, KTX2 for textures, produced as in threejs-asset-pipeline — and show a placeholder mesh while the real model loads, swapping it in once loading resolves.
