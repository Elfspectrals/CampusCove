# Skeletal Animation

```javascript
// mesh is the loaded model root; find its first SkinnedMesh
const skinnedMesh = mesh.getObjectByProperty("type", "SkinnedMesh");
const skeleton = skinnedMesh.skeleton;
console.log(skeleton.bones.map((b) => b.name));

// Grab a bone to pose or attach to
const handBone = skeleton.bones.find((b) => b.name === "RightHand");

// Visualize the rig
const helper = new THREE.SkeletonHelper(mesh);
scene.add(helper);
```

Procedural bone control runs **after** `mixer.update()`, or a clip that animates the same bone overwrites it:

```javascript
const skinnedMesh = mesh.getObjectByProperty("type", "SkinnedMesh");
const headBone = skinnedMesh.skeleton.bones.find((b) => b.name === "Head");
const mixer = new THREE.AnimationMixer(mesh); // play the model's clips on it (see Playing glTF Animations)

const timer = new THREE.Timer();
timer.connect(document);

function animate() {
  timer.update();
  mixer.update(timer.getDelta()); // clips write their bone pose here

  // Override afterwards: update() overwrites every property the playing clips animate
  if (headBone) headBone.rotation.y = Math.sin(timer.getElapsed()) * 0.3;
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
```

Bones are Object3Ds, so attaching means parenting:

```javascript
const skinnedMesh = mesh.getObjectByProperty("type", "SkinnedMesh");
const handBone = skinnedMesh.skeleton.bones.find((b) => b.name === "RightHand");

const weapon = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.08, 0.5),
  new THREE.MeshNormalMaterial(),
);
if (handBone) {
  handBone.add(weapon); // weapon now follows the hand's bone transform
  weapon.position.set(0, 0, 0.25); // offset within the bone's space
  weapon.rotation.set(0, Math.PI / 2, 0);
}
```
