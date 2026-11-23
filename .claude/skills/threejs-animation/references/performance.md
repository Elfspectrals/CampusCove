# Performance

- The same AnimationClip can feed any number of mixers — share one clip set across characters instead of copying it.
- Call `mixer.update()` only for characters that are visible or about to be; an un-updated mixer simply leaves the last pose in place.
- A SkinnedMesh computes its bounding sphere once, the first time culling or raycasting needs it, so a clip that moves it far from that pose can get it culled at the screen edge: after `mixer.update()` call `mixer.getRoot().updateMatrixWorld()` then `skinnedMesh.computeBoundingSphere()` (a CPU pass over every vertex) or set `skinnedMesh.frustumCulled = false`.

```javascript
// Free a mixer and its cached bindings when its model leaves for good
const mixer = new THREE.AnimationMixer(mesh);
mixer.stopAllAction();
mixer.uncacheRoot(mesh); // releases the property bindings created for the model
```
