# Other Model Formats

## OBJ + MTL

```javascript
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const materials = await new MTLLoader().loadAsync("model.mtl");
materials.preload();

const object = await new OBJLoader().setMaterials(materials).loadAsync("model.obj");
scene.add(object);
```

## FBX

```javascript
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const object = await new FBXLoader().loadAsync("model.fbx");
object.scale.setScalar(0.01); // FBX files are often exported in centimeters

const mixer = new THREE.AnimationMixer(object); // call mixer.update(timer.getDelta()) every frame, as in the glTF example
if (object.animations.length > 0) mixer.clipAction(object.animations[0]).play();

scene.add(object);
```

## STL

```javascript
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const geometry = await new STLLoader().loadAsync("model.stl");
scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x888888 })));
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
scene.add(new THREE.DirectionalLight(0xffffff, 2)); // lit materials render black without lights; this one shines down from (0, 1, 0)
```

## PLY

The loader honors the file's data types, so `double` properties arrive as attributes backed by a `Float64Array`, which WebGLRenderer cannot upload; convert them to `Float32BufferAttribute` before rendering.

```javascript
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

const geometry = await new PLYLoader().loadAsync("model.ply");

for (const name of Object.keys(geometry.attributes)) {
  const attribute = geometry.getAttribute(name);
  if (attribute.array instanceof Float64Array) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(attribute.array, attribute.itemSize));
  }
}

if (!geometry.hasAttribute("normal")) geometry.computeVertexNormals(); // keep the file's own normals
const material = new THREE.MeshStandardMaterial({ vertexColors: geometry.hasAttribute("color") }); // vertexColors without a color attribute renders black
scene.add(new THREE.Mesh(geometry, material));
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
scene.add(new THREE.DirectionalLight(0xffffff, 2)); // lit materials render black without lights; this one shines down from (0, 1, 0)
```

## USD

```javascript
import { USDLoader } from "three/addons/loaders/USDLoader.js";

const model = await new USDLoader().loadAsync("model.usdz"); // USD, USDA, USDC and USDZ archives
scene.add(model);
```
