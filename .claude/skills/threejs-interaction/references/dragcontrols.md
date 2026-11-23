# DragControls

Drags objects directly: left or middle drag moves the object in a plane parallel to the screen, right drag rotates it around the camera's up and right axes.

```javascript
import { DragControls } from "three/addons/controls/DragControls.js";

const dragControls = new DragControls([mesh], camera, renderer.domElement);
dragControls.rotateSpeed = 1; // default
dragControls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }; // the default map
// transformGroup = true drags the outermost Group above the hit instead (pass objects = [group]); event.object is then that Group, which has no material, so use event.object.material?.emissive in the handlers

dragControls.addEventListener("dragstart", (event) => {
  event.object.material.emissive?.set(0x333333);
});
dragControls.addEventListener("drag", (event) => {
  event.object.position.y = 0; // clamp to the ground mid-drag
});
dragControls.addEventListener("dragend", (event) => {
  event.object.material.emissive?.set(0x000000);
});

// The built-in picker: dragControls.raycaster. The dragged objects: dragControls.objects.
```
