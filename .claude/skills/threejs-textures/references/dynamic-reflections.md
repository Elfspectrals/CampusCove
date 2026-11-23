# Dynamic Reflections

```javascript
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
scene.add(cubeCamera);

mesh.material.envMap = cubeRenderTarget.texture;

// each frame: hide the reflective mesh so it does not see itself
mesh.visible = false;
cubeCamera.position.copy(mesh.position);
cubeCamera.update(renderer, scene);
mesh.visible = true;
```
