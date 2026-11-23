# Raycasting

Faces pointing away from the ray origin are not hit; set `material.side = THREE.DoubleSide` to catch both sides. A ray that grazes an edge shared by two faces can produce two coincident hits. Invisible meshes are still raycast — the Raycaster tests layers, not visibility — so an invisible simple proxy can stand in for a complex model.

## What an intersection contains

```javascript
const raycaster = new THREE.Raycaster();
const clickables = [mesh]; // the smallest list you can: the meshes, not scene.children
const hits = raycaster.intersectObjects(clickables, false); // sorted, closest first
// Each hit:
// {
//   distance: number,                          // from the ray origin, world units
//   point: THREE.Vector3,                      // hit point in world space
//   face: { a, b, c, normal, materialIndex },  // plain object; a, b, c are vertex indices; normal in object space
//   faceIndex: number,
//   object: THREE.Object3D,
//   uv: THREE.Vector2,                         // undefined when the geometry has no uv
//   uv1: THREE.Vector2,                        // second UV set, when the geometry has one
//   normal: THREE.Vector3,                     // interpolated vertex normal in object space, flipped to face the ray
//   barycoord: THREE.Vector3,                  // barycentric coordinates of the hit point
//   instanceId: number,                        // set on InstancedMesh hits
//   batchId: number,                           // set on BatchedMesh hits
//   distanceToRay: number                      // set on Points hits
// }
```

## Raycaster configuration

```javascript
const raycaster = new THREE.Raycaster();

// From any origin and direction (normalize the direction first)
raycaster.set(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 0, 0).normalize());

// Range: hits closer than near or farther than far are discarded
raycaster.near = 0.1;
raycaster.far = 10;

// Precision for Points and Line, in world units (both default to 1)
raycaster.params.Points.threshold = 0.2;
raycaster.params.Line.threshold = 0.2;

// Restrict picking to layer 1. Objects join with enable; set would also remove
// them from layer 0, where the default camera looks, so use set only on a pick-only proxy.
mesh.layers.enable(1); // stays on layer 0 too, so the camera still renders the mesh
raycaster.layers.set(1); // tests layer 1 only; raycaster.layers.enable(1) would test layers 0 and 1
```

## Dragging on a plane

```javascript
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // normal, constant
const hit = new THREE.Vector3();

renderer.domElement.addEventListener("pointermove", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  // null when the ray is parallel to the plane or points away from it
  if (event.buttons !== 0 && raycaster.ray.intersectPlane(groundPlane, hit) !== null) {
    mesh.position.copy(hit); // while a button is held, drag the mesh along the ground
  }
});
```
