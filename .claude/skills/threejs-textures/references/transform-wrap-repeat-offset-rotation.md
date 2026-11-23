# Transform: Wrap, Repeat, Offset, Rotation

```javascript
const texture = new THREE.TextureLoader().load("diffuse.jpg");

// Tiling requires repeat wrapping; the default clamps edge pixels
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;
texture.repeat.set(4, 4); // tile 4x4

texture.offset.set(0.5, 0.5); // shift in UV units
texture.center.set(0.5, 0.5); // pivot for rotation
texture.rotation = Math.PI / 4; // radians
```

`MirroredRepeatWrapping` tiles with a mirror flip on each repeat.
