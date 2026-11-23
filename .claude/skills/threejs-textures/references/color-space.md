# Color Space

Color management is on by default and every texture starts at `NoColorSpace`:

- LDR color images get `SRGBColorSpace`: `map`, `emissiveMap`, `specularMap`, sheen color and specular color maps, LDR matcaps, and canvas or video used as color.
- Scalar data keeps `NoColorSpace`: normal, bump, displacement, roughness, metalness, ambient-occlusion and alpha maps.
- HDR environments are `LinearSRGBColorSpace`; the HDR loaders set that themselves. GLTFLoader sets the color spaces of the textures it loads.

```javascript
const colorMap = new THREE.TextureLoader().load("color.jpg");
colorMap.colorSpace = THREE.SRGBColorSpace; // authored color image

const normalMap = new THREE.TextureLoader().load("normal.jpg");
// normalMap stays at NoColorSpace: it is data, not color
```
