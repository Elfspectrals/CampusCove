# Texture Atlas

One image, many sprites, each selected with offset and repeat:

```javascript
const atlas = await new THREE.TextureLoader().loadAsync("atlas.png");
atlas.colorSpace = THREE.SRGBColorSpace;
// filtering and mipmaps sample across sprite borders: leave padding around each sprite

// one clone per sprite: clones share the image source, so WebGLRenderer uploads it once
function spriteTexture(row, col, gridSize = 2) {
  const sprite = atlas.clone();
  sprite.offset.set(col / gridSize, 1 - (row + 1) / gridSize);
  sprite.repeat.set(1 / gridSize, 1 / gridSize);
  return sprite;
}

mesh.material.map = spriteTexture(0, 0); // top-left sprite of a 2x2 sheet
```
