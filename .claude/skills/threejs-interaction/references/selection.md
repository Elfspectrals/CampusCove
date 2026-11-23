# Selection

```javascript
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectable = [mesh];
let selected = null;

function setPointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(selectable, false)[0];
  if (selected) selected.material.emissive.set(0x000000); // deselect the previous mesh
  selected = hit ? hit.object : null;
  if (selected) selected.material.emissive.set(0x444444);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(selectable, false)[0];
  document.body.style.cursor = hit ? "pointer" : "default"; // hover feedback
});
```

For teardown, keep named handler references so you can `removeEventListener` them, and call `controls.dispose()` for every control and `timer.dispose()` for the timer.

## Box selection

`SelectionBox` selects the objects whose bounding-sphere center falls inside a screen-space rectangle; `SelectionHelper` draws the rectangle and tracks the drag.

```javascript
import { SelectionBox } from "three/addons/interactive/SelectionBox.js";
import { SelectionHelper } from "three/addons/interactive/SelectionHelper.js";

const selectionBox = new SelectionBox(camera, scene);
const helper = new SelectionHelper(renderer, "selectBox"); // a div with this class: give .selectBox position: fixed, a border and a background in CSS, or nothing shows

function ndc(event) {
  return new THREE.Vector3(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
    0.5,
  );
}

document.addEventListener("pointerdown", (event) => {
  selectionBox.startPoint.copy(ndc(event));
});

document.addEventListener("pointermove", (event) => {
  if (helper.isDown) selectionBox.endPoint.copy(ndc(event));
});

document.addEventListener("pointerup", (event) => {
  selectionBox.endPoint.copy(ndc(event));
  const selected = selectionBox.select(); // InstancedMesh and BatchedMesh hits go to selectionBox.instances and .batches
  console.log(selected);
});

// on teardown: helper.dispose() removes the helper's listeners and its rectangle element
```
