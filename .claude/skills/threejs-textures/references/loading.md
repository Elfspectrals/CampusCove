# Loading

```javascript
// load() returns the texture at once; its image arrives asynchronously
const texture = new THREE.TextureLoader().load("diffuse.jpg");
texture.colorSpace = THREE.SRGBColorSpace;
mesh.material.map = texture; // before the first render; afterwards also set mesh.material.needsUpdate = true

// When the next step needs the loaded image, await it
const colorMap = await new THREE.TextureLoader().loadAsync("diffuse.jpg");
colorMap.colorSpace = THREE.SRGBColorSpace;
```

TextureLoader's `onProgress` parameter is unsupported and never fires; a `LoadingManager` reports progress as each file finishes:

```javascript
const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => console.log(`${loaded}/${total}: ${url}`);
const loader = new THREE.TextureLoader(manager);
```
