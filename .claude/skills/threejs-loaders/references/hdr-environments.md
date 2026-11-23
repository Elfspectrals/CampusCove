# HDR Environments

`HDRLoader` (Radiance `.hdr`) and `EXRLoader` return floating-point equirectangular textures. Both renderers prefilter an equirectangular environment themselves, so no PMREM step is needed for a file — set `mapping` and assign it.

```javascript
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

const env = await new HDRLoader().loadAsync("environment.hdr");
env.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = env;
scene.background = env; // without mapping, a background texture draws as a flat screen quad

const exr = await new EXRLoader().loadAsync("environment.exr");
exr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = exr;
```

Dim the environment with `scene.environmentIntensity` (and rotate it with `scene.environmentRotation`); `material.envMapIntensity` scales only a material's own `envMap`, which stays null on models lit by `scene.environment`.

`UltraHDRLoader` reads gain-map JPEGs — HDR dynamic range at JPEG file sizes — the same way:

```javascript
import { UltraHDRLoader } from "three/addons/loaders/UltraHDRLoader.js";

const env = await new UltraHDRLoader().loadAsync("environment.jpg");
env.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = env;
```

Use `PMREMGenerator` for generated environments, not files:

```javascript
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(room, 0.04).texture;
room.dispose(); pmremGenerator.dispose(); // the room's geometries and materials, then the generator
```
