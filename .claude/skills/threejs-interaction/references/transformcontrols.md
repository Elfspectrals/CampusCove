# TransformControls

A gizmo for moving, rotating and scaling objects. The controls object is not an Object3D; the gizmo it renders must be added to the scene separately.

```javascript
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const orbitControls = new OrbitControls(camera, renderer.domElement);

const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls.getHelper()); // the gizmo; adding the controls themselves only logs an error

transformControls.attach(mesh); // show the gizmo on this object
transformControls.setMode("translate"); // "translate" | "rotate" | "scale"
transformControls.setSpace("local");    // "local" | "world"; scale always acts locally
transformControls.setSize(0.8);
transformControls.setTranslationSnap(0.5);
transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
transformControls.setScaleSnap(0.25);

transformControls.addEventListener("dragging-changed", (event) => {
  orbitControls.enabled = !event.value; // pause orbiting while the gizmo is dragged
});
transformControls.addEventListener("objectChange", () => {
  console.log(mesh.position); // fires as the gizmo moves the object
});

window.addEventListener("keydown", (event) => {
  if (event.key === "g") transformControls.setMode("translate");
  if (event.key === "r") transformControls.setMode("rotate");
  if (event.key === "s") transformControls.setMode("scale");
  if (event.key === "Escape") transformControls.detach(); // hide the gizmo
});
```
