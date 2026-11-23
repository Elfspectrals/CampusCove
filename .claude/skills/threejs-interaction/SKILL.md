---
name: threejs-interaction
description: "Picking with raycasting, camera controls, transform gizmos, drag, hover and box selection for three.js, identical under WebGL and WebGPU. Use when handling mouse, touch or keyboard input, detecting clicks on 3D objects, adding camera controls, or making scene objects interactive."
---

> **CampusCove note.** Vendored from [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) @ 0e18186, MIT (`_third-party/LICENSE-CloudAI-X.txt`); this note was added and the large sections were moved unchanged to `references/` (headings lowered one level, a contents list added).
>
> **Version gap:** written for three r186; CampusCove runs **r170** with `WebGLRenderer`. `Timer` is `three/addons/misc/Timer.js` in r170; keep the project's `three/examples/jsm/...` imports (the import-map "mistake" below does not apply under Vite); skip WebGPU/TSL.
>
> Here: `/game` does **not** use the controls classes: it is first-person with its own pointer lock (`composables/game/useGameMovement.ts`), and picking casts from the screen centre (`raycaster.setFromCamera` on NDC 0,0 in `useApartmentPlacement.ts`, `useHouseKeys.ts`), not from the mouse position. Door / work / fishing prompts are distance-based (`useInteractionTargets.ts`), not raycast. Mouse-position picking is used in `/NewNation` (`NewNationShowroom.ts`). Furniture moves with the placement ghost (`game/placement/`), not TransformControls or DragControls. Raycast against a short explicit list (or a layer), never `scene.children` recursively.
>
> Advisory reference: CampusCove's own skills (`game-feature`, `socket-message`, `playtest-game`, ...) win on any conflict.

# Three.js Interaction

Targets three.js r186. Examples use WebGLRenderer; the WebGPU and TSL section uses WebGPURenderer.

## Quick Start

```javascript
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 5);

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x3a86ff }),
);
scene.add(mesh);
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(3, 5, 4);
scene.add(light, new THREE.AmbientLight(0xffffff, 0.4));

const controls = new OrbitControls(camera, renderer.domElement); // connects itself
controls.enableDamping = true; // requires controls.update() every frame

const timer = new THREE.Timer();
timer.connect(document); // freezes the delta while the tab is hidden

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setPointer(event) {
  // NDC coordinates relative to the canvas, so the page can scroll or embed it
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(mesh); // also tests children (recursive by default), as a loaded model needs
  if (hits.length > 0) console.log("clicked", hits[0].object);
});

function animate() {
  timer.update();
  controls.update(timer.getDelta());
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
```

Pointer events (`pointerdown`, `pointermove`, `pointerup`) cover mouse, touch and pen in one listener set, so no separate touch handlers are needed.

## Reference files

Open the file that matches the task. Each is one level deep from this file.

- [Raycasting](references/raycasting.md)
- [Camera Controls](references/camera-controls.md)
- [TransformControls](references/transformcontrols.md)
- [DragControls](references/dragcontrols.md)
- [Selection](references/selection.md)
- [Screen and World Coordinates](references/screen-and-world-coordinates.md)
- [WebGPU and TSL](references/webgpu-and-tsl.md)

## Common Mistakes

- `scene.add(transformControls)` → `scene.add(transformControls.getHelper())`: TransformControls extends Controls, an EventDispatcher rather than an Object3D, so this logs an error and the gizmo never appears.
- `new OrbitControls(camera)` → `new OrbitControls(camera, renderer.domElement)`: the constructor wires its listeners to the element; without one the controls never receive input.
- `controls.update(clock.getDelta())` → `timer.update(); controls.update(timer.getDelta())`: Clock is deprecated in r183; create a Timer, connect it, and update it first thing each frame.
- `import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"` → `import { OrbitControls } from "three/addons/controls/OrbitControls.js"`: the documented import maps point `three/addons/` at examples/jsm/ and define no `three/examples/` key, so this specifier does not resolve in the browser.
- `requestAnimationFrame(animate)` → `renderer.setAnimationLoop(animate)`: both renderers' docs advise it over a manual loop, and it hands frames to the WebXR session when one starts.
- `flyControls.update()` → `flyControls.update(timer.getDelta())`: FlyControls and FirstPersonControls scale movement by the delta, so without it the position becomes NaN.
- `orbitControls.update()` → `orbitControls.update(timer.getDelta())`: without a delta, autoRotate speed depends on the display refresh rate.
- `mesh.layers.set(1)` → `mesh.layers.enable(1)`: `set` replaces the mask, removing the mesh from layer 0, so the default camera stops rendering it.
- `hit.face instanceof THREE.Face3` → `hit.face.normal`: the intersection's face is a plain `{ a, b, c, normal, materialIndex }` object; Face3 does not exist.
- `const moveForward = false` → `let moveForward = false`: the keydown handler reassigns the flag, and assigning to a const throws a TypeError.
- `controls.getObject()` → `controls.object`: PointerLockControls.getObject() was removed in r168; the controls manage the camera passed to the constructor.
- `dragControls.getObjects()` → `dragControls.objects`: removed in r168; getRaycaster() became the raycaster property the same way.
- `dragControls.activate()` → `dragControls.connect(renderer.domElement)`: renamed from activate() in r168 (deactivate() became disconnect()), and connect() needs the element: without one it throws a TypeError, as the old names do.
- `firstPersonControls.activeLook = false` → `firstPersonControls.lookSpeed = 0`: FirstPersonControls has no activeLook property, so assigning it does nothing and drag look stays on.

## See Also

- `threejs-fundamentals` - scenes, cameras, renderer setup and the animation loop
- `threejs-animation` - animating objects in response to interaction
- `threejs-postprocessing` - outline and bloom effects for selection highlights
- `threejs-loaders` - loading the glTF models you make interactive
- `threejs-react-three-fiber` - pointer-event props and drei controls when the scene is written in React
