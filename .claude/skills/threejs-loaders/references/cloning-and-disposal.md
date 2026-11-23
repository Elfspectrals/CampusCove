# Cloning and Disposal

`Object3D.clone()` on a skinned model shares the skeleton: every copy stays bound to the original's bones, so copies follow the original and ignore their own animation. Use `SkeletonUtils.clone()` for instances.

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const gltf = await new GLTFLoader().loadAsync("character.glb");
scene.add(gltf.scene);

const copy = SkeletonUtils.clone(gltf.scene);
scene.add(copy);
```

`object.dispose()` frees renderer-side state for that object only (WebGPU bindings, InstancedMesh buffers) and does not visit children or dispose geometry, materials or textures — traverse the subtree:

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltf = await new GLTFLoader().loadAsync("model.glb");
const model = gltf.scene;
scene.add(model);

// ... later
scene.remove(model);
model.traverse((child) => {
  child.dispose(); // per-object renderer state: InstancedMesh buffers, WebGPU bindings
  if (child.geometry) { // meshes, lines and points
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    }
  }
});
```
