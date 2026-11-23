# AnimationMixer

```javascript
const track = new THREE.NumberKeyframeTrack(".rotation[y]", [0, 2], [0, Math.PI * 2]);
const clip = new THREE.AnimationClip("spin", 2, [track]);

// One mixer per animated root; it reaches the root and all descendants
const mixer = new THREE.AnimationMixer(mesh);
const action = mixer.clipAction(clip); // cached: calling it again for this clip and root returns the same action
action.play();

const timer = new THREE.Timer();
timer.connect(document);

function animate() {
  timer.update();
  mixer.update(timer.getDelta()); // required: advances every active action
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// Events fire on the mixer while it updates; "finished" needs LoopOnce or finite repetitions
mixer.addEventListener("finished", (e) => console.log("finished:", e.action.getClip().name));
mixer.addEventListener("loop", (e) => console.log("looped:", e.action.getClip().name));
```
