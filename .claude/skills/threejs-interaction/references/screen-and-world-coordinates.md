# Screen and World Coordinates

```javascript
// World to screen: project, then map NDC (-1..1) to CSS pixels
const ndc = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
const screenX = ((ndc.x + 1) / 2) * window.innerWidth;
const screenY = ((-ndc.y + 1) / 2) * window.innerHeight;
// ndc.z outside [-1, 1] means the point is outside the near-to-far range
```

```javascript
// Screen to world: unproject into a ray, then walk it to the plane z = 0
const worldPoint = new THREE.Vector3(0.1, 0.2, 0.5).unproject(camera);
const direction = worldPoint.sub(camera.position).normalize();
const distance = -camera.position.z / direction.z; // the ray misses the plane when direction.z is 0
const world = camera.position.clone().addScaledVector(direction, distance);
// The same result comes from a Raycaster built with setFromCamera and intersectPlane
```
