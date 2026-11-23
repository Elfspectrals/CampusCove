# Camera Controls

## Contents

- [OrbitControls](#orbitcontrols)
- [FlyControls](#flycontrols)
- [FirstPersonControls](#firstpersoncontrols)
- [PointerLockControls](#pointerlockcontrols)
- [TrackballControls](#trackballcontrols)


Every controls class extends `Controls` and shares one base API: construct with the camera and the DOM element (DragControls takes its array of objects first), and the constructor wires its own listeners; `enabled = false` to ignore input, `disconnect()` / `connect(element)` to detach or move, `dispose()` on teardown. `update()` takes a delta in seconds for OrbitControls, FlyControls and FirstPersonControls — pass `timer.getDelta()`; call it without arguments for the others.

## OrbitControls

```javascript
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true; // requires update() every frame
controls.dampingFactor = 0.05;

controls.minDistance = 2;
controls.maxDistance = 50;
controls.minPolarAngle = 0.1;          // vertical limits, radians
controls.maxPolarAngle = Math.PI / 2;  // stop at the horizon
controls.minAzimuthAngle = -Math.PI / 4;
controls.maxAzimuthAngle = Math.PI / 4;

controls.target.set(0, 1, 0);  // the point orbited around
controls.zoomToCursor = true; // wheel zooms toward the pointer

controls.autoRotate = true;      // requires update() every frame; stops at an azimuth limit
controls.autoRotateSpeed = 2.0;

const timer = new THREE.Timer();
timer.connect(document);

function animate() {
  timer.update();
  controls.update(timer.getDelta()); // the delta makes autoRotate frame-rate independent
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
```

OrbitControls fires `change`, `start` and `end` events. `MapControls` is an OrbitControls subclass tuned for map navigation:

```javascript
import { MapControls } from "three/addons/controls/MapControls.js";

// Left-drag pans, right-drag (or left-drag with ctrl/meta/shift) orbits,
// middle button or wheel zooms. screenSpacePanning is false, so panning
// stays parallel to the ground. Every OrbitControls option applies.
const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
```

## FlyControls

```javascript
import { FlyControls } from "three/addons/controls/FlyControls.js";

const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 10;
controls.rollSpeed = Math.PI / 24;
controls.dragToLook = true; // steer only while a mouse button is held

const timer = new THREE.Timer();
timer.connect(document);

function animate() {
  timer.update();
  controls.update(timer.getDelta()); // movement scales by the delta
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
```

## FirstPersonControls

FirstPersonControls has a drag-based look model: press and drag to look (look speed grows with the drag distance and eases through `dampingFactor`, default 0.1, where 1 disables the easing), WASD or arrows to move, R and F for up and down, hold the left button to fly forward and the right button to fly backward. Touch works through pointer events: one finger moves forward, two fingers move backward.

```javascript
import { FirstPersonControls } from "three/addons/controls/FirstPersonControls.js";

const controls = new FirstPersonControls(camera, renderer.domElement);
controls.movementSpeed = 10;
controls.lookSpeed = 0.005;   // default
controls.dampingFactor = 0.1; // default; 1 disables the easing
controls.constrainVertical = true;
controls.verticalMin = Math.PI / 4;
controls.verticalMax = (Math.PI * 3) / 4;

const timer = new THREE.Timer();
timer.connect(document);

function animate() {
  timer.update();
  controls.update(timer.getDelta()); // the delta is required; without it the position becomes NaN
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
```

## PointerLockControls

```javascript
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 1.0; // mouse sensitivity

controls.addEventListener("lock", () => console.log("locked"));
controls.addEventListener("unlock", () => console.log("unlocked"));
document.body.addEventListener("click", () => controls.lock()); // needs a user gesture

const velocity = new THREE.Vector3();
let moveForward = false; // let: the key handlers reassign these
let moveBackward = false;

document.addEventListener("keydown", (event) => {
  if (event.code === "KeyW") moveForward = true;
  if (event.code === "KeyS") moveBackward = true;
});
document.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") moveForward = false;
  if (event.code === "KeyS") moveBackward = false;
});

const timer = new THREE.Timer();
timer.connect(document);

function animate() {
  timer.update();
  const delta = timer.getDelta();
  if (controls.isLocked) {
    // ease toward the target speed, then move the camera forward parallel to the ground (xz-plane)
    velocity.z = THREE.MathUtils.damp(
      velocity.z,
      10 * (Number(moveForward) - Number(moveBackward)),
      10,
      delta,
    );
    controls.moveForward(velocity.z * delta);
    // controls.moveRight(distance) does the same along the camera's right axis
  }
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
```

The controls move the camera passed to the constructor (`controls.object`); it renders without being added to the scene, so `scene.add(controls.object)` is needed only when the camera has children.

## TrackballControls

```javascript
import { TrackballControls } from "three/addons/controls/TrackballControls.js";

const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 2.0;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;
controls.staticMoving = true; // no inertia; otherwise dynamicDampingFactor (default 0.2)

function animate() {
  controls.update(); // no delta argument; call controls.handleResize() after the canvas resizes
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
```
