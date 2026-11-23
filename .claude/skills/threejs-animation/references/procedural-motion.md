# Procedural Motion

```javascript
const timer = new THREE.Timer();
timer.connect(document);

// Exponential approach; a higher lambda snaps faster. Frame-rate independent.
// The same shape drives positions, rotations or any scalar each frame.
let scale = 0;

function animate() {
  timer.update();
  scale = THREE.MathUtils.damp(scale, 1, 4, timer.getDelta());
  mesh.scale.setScalar(0.5 + scale * 0.5);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
```
