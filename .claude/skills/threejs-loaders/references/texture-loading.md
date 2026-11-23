# Texture Loading

`TextureLoader.load()` returns the texture immediately and fills it in when the image decodes; assign it right away and the first render picks it up. Adding a map to a material that has already rendered without one needs `material.needsUpdate = true`. `onProgress` is never called for image loading.

```javascript
new THREE.TextureLoader().load(
  "texture.jpg",
  (map) => {
    map.colorSpace = THREE.SRGBColorSpace; // a color map; scalar maps keep NoColorSpace
    mesh.material.map = map;
    mesh.material.needsUpdate = true; // the material rendered without a map before
  },
  undefined, // onProgress: not supported for image loading
  (error) => {
    console.error("Could not load texture", error);
  },
);
```

## Texture configuration

```javascript
const map = new THREE.TextureLoader().load("color.jpg");
map.colorSpace = THREE.SRGBColorSpace; // LDR color images; scalar maps keep NoColorSpace

map.wrapS = THREE.RepeatWrapping; // ClampToEdgeWrapping (default), RepeatWrapping, MirroredRepeatWrapping
map.wrapT = THREE.RepeatWrapping;
map.repeat.set(2, 2);
map.offset.set(0.5, 0.5);
map.rotation = Math.PI / 4;
map.center.set(0.5, 0.5);

map.minFilter = THREE.LinearMipmapLinearFilter; // default
map.magFilter = THREE.LinearFilter; // default; NearestFilter for a pixelated look
map.anisotropy = renderer.capabilities.getMaxAnisotropy(); // sharper textures at grazing angles

mesh.material.map = map;
// wrap, filters, anisotropy, colorSpace and flipY (true by default) apply at upload: set them before the first render or set map.needsUpdate = true; repeat, offset, rotation and center apply every frame
```

Color spaces: LDR color images (albedo, emissive) are `SRGBColorSpace`; scalar maps (normal, bump, roughness, metalness, ao, alpha) keep the default `NoColorSpace`. GLTFLoader sets the correct color spaces for the textures it loads, and the HDR loaders below set `LinearSRGBColorSpace` themselves. A texture you load yourself for a glTF model's material needs `map.flipY = false` to match the textures GLTFLoader loads.

## CubeTextureLoader

For skyboxes and cube environments, six faces in +X, -X, +Y, -Y, +Z, -Z order; the loader sets sRGB itself.

```javascript
const cubeTexture = await new THREE.CubeTextureLoader().loadAsync([
  "px.jpg",
  "nx.jpg",
  "py.jpg",
  "ny.jpg",
  "pz.jpg",
  "nz.jpg",
]);

scene.background = cubeTexture;
scene.environment = cubeTexture;
```
