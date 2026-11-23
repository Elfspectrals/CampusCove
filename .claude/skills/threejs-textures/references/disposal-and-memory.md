# Disposal and Memory

`texture.dispose()` frees the GPU upload once no other undisposed texture shares it (the atlas clones above share one); the image object remains. Dispose only textures that no other material still uses:

```javascript
function disposeMaterial(material) {
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && value.isTexture) {
      value.dispose();
    }
  }
  material.dispose();
}
```

```javascript
console.log(renderer.info.memory.textures); // texture count currently on the GPU
console.log(renderer.capabilities.maxTextureSize); // largest supported dimension
```

Share one texture instance across materials rather than loading per mesh. Non-power-of-two sizes are fine: WebGL 2 supports mipmaps and repeat wrapping on them.
