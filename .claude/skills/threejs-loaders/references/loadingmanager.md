# LoadingManager

One manager coordinates several loaders and reports combined progress. `loadAsync` still rejects on failure; `manager.onError` fires as well.

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const manager = new THREE.LoadingManager();

manager.onStart = (url, loaded, total) => {
  console.log(`Started loading: ${url}`);
};

manager.onProgress = (url, loaded, total) => {
  console.log(`Loading: ${((loaded / total) * 100).toFixed(1)}%`);
};

manager.onLoad = () => {
  console.log("All assets loaded");
};

manager.onError = (url) => {
  console.error(`Error loading: ${url}`);
};

const gltfLoader = new GLTFLoader(manager);
const textureLoader = new THREE.TextureLoader(manager);

// onLoad fires when every tracked item has finished
await Promise.all([
  gltfLoader.loadAsync("model.glb"),
  textureLoader.loadAsync("texture.jpg"),
  textureLoader.loadAsync("normal.jpg"),
]);
```

`manager.abort()` cancels in-flight requests for loaders that load through FileLoader (models, HDR, EXR, KTX2). Loaders that load through an HTML image element, such as TextureLoader, ignore it.

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const manager = new THREE.LoadingManager();
const timeoutId = setTimeout(() => manager.abort(), 30000);

try {
  const gltf = await new GLTFLoader(manager).loadAsync("model.glb");
  scene.add(gltf.scene);
} catch (error) {
  console.error(error);
} finally {
  clearTimeout(timeoutId);
}
```
