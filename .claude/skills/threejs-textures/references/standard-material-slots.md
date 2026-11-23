# Standard Material Slots

Channel conventions worth knowing: `aoMap` reads red, `roughnessMap` reads green, `metalnessMap` reads blue (so one packed occlusion-roughness-metalness image works); `alphaMap` reads green.

```javascript
const colorMap = new THREE.TextureLoader().load("color.jpg");
const emissiveMap = new THREE.TextureLoader().load("emissive.jpg");
const normalMap = new THREE.TextureLoader().load("normal.jpg");
colorMap.colorSpace = THREE.SRGBColorSpace;
emissiveMap.colorSpace = THREE.SRGBColorSpace;
// normalMap keeps NoColorSpace, as do roughness, metalness, ao, alpha and displacement maps

const material = new THREE.MeshStandardMaterial({
  map: colorMap,
  normalMap: normalMap,
  normalScale: new THREE.Vector2(1, 1),
  emissiveMap: emissiveMap,
  emissive: 0xffffff, // non-black, so the emissive map contributes
  roughness: 1, // scalar multipliers for the matching maps
  metalness: 0,
});

material.aoMap = new THREE.TextureLoader().load("ao.jpg");
material.aoMapIntensity = 1;
```

`alphaMap` takes effect with `transparent: true` (blended) or `alphaTest` (cut out); `displacementMap` scales with `displacementScale` and `displacementBias` and wants a subdivided mesh; `normalMapType` defaults to `TangentSpaceNormalMap`, set `ObjectSpaceNormalMap` for object-space normal maps.
