# UV Channels

Every UV-mapped material texture samples the UV attribute chosen by `texture.channel`: `0` reads `uv` (the default), `1` reads `uv1`, `2` reads `uv2`, `3` reads `uv3`. So `aoMap` and `lightMap` work on the default `uv` set; a separately unwrapped set goes in `uv1` with the texture pointed at it:

```javascript
const aoTexture = new THREE.TextureLoader().load("ao.jpg");

const geometry = new THREE.BoxGeometry(1, 1, 1);
const uvAttribute = geometry.attributes.uv;
const aoUvs = new Float32Array(uvAttribute.count * 2); // fill with the second unwrap
geometry.setAttribute("uv1", new THREE.BufferAttribute(aoUvs, 2));

const material = new THREE.MeshStandardMaterial({ aoMap: aoTexture });
material.aoMap.channel = 1; // sample "uv1" instead of "uv"
const aoMesh = new THREE.Mesh(geometry, material);
scene.add(aoMesh);
```
