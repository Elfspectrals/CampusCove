# Filtering, Mipmaps, Anisotropy

```javascript
const texture = new THREE.TextureLoader().load("diffuse.jpg");

// Minification (many texture pixels per screen pixel)
texture.minFilter = THREE.LinearMipmapLinearFilter; // default: trilinear blend between mip levels
texture.minFilter = THREE.NearestFilter; // hard pixel look, samples only the base level

// Magnification (texture magnified on screen)
texture.magFilter = THREE.LinearFilter; // default
texture.magFilter = THREE.NearestFilter; // pixelated

// Mipmaps are generated whenever generateMipmaps is true, whatever the filters.
// Turn generation off to save memory (UI sprites, data textures):
texture.generateMipmaps = false;
texture.minFilter = THREE.LinearFilter; // and do not request a mipmap filter

// Sharper at grazing angles; clamp to what the hardware supports
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
```
