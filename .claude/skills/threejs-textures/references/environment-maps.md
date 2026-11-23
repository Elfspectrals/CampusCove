# Environment Maps

Cube maps (the loader tags the result sRGB itself):

```javascript
const cubeTexture = new THREE.CubeTextureLoader().load([
  "px.jpg", "nx.jpg", // +X, -X
  "py.jpg", "ny.jpg", // +Y, -Y
  "pz.jpg", "nz.jpg", // +Z, -Z
]);

scene.background = cubeTexture;
scene.environment = cubeTexture; // lights Standard and Physical materials (WebGLRenderer also Lambert and Phong)
```

HDR equirectangular files — set `mapping`, then assign; both renderers prefilter the environment themselves:

```javascript
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const env = await new HDRLoader().loadAsync("environment.hdr");
env.mapping = THREE.EquirectangularReflectionMapping; // without it the background draws as a flat screen quad
scene.environment = env;
scene.background = env;
```

`EXRLoader` (`three/addons/loaders/EXRLoader.js`) loads `.exr` files the same way and `UltraHDRLoader` loads Ultra HDR JPEGs; both set their own linear color space.

Scene-level controls:

```javascript
scene.environmentIntensity = 0.5; // dim the image-based lighting
scene.environmentRotation.y = Math.PI / 4;

scene.backgroundBlurriness = 0.5; // 0-1
scene.backgroundIntensity = 1.0;
scene.backgroundRotation.y = Math.PI;
```

Both renderers convert an equirectangular environment into a cube map with a larger texture internally (better sampling, more memory); when memory matters, ship a lower-resolution equirect file.

`PMREMGenerator` is for generated environments — a scene such as `RoomEnvironment` captured with `fromScene`:

```javascript
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
room.dispose(); // frees the room's geometries and materials
pmrem.dispose();
```

Do not run a loaded equirect file through PMREMGenerator "for better reflections" — direct assignment with `mapping` set produces the same prefiltering.
