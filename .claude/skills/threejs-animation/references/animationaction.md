# AnimationAction

```javascript
const mixer = new THREE.AnimationMixer(mesh);
const clip = new THREE.AnimationClip("spin", 2, [
  new THREE.NumberKeyframeTrack(".rotation[y]", [0, 2], [0, Math.PI * 2]),
]);
const action = mixer.clipAction(clip);

action.play(); // schedule and start
action.reset(); // rewind to time 0 and cancel fades
action.stop(); // unschedule; properties no other scheduled action animates return to their original values
action.halt(0.3); // decelerate to a stop within 0.3 s

action.time = 0.5; // scrub within the clip
action.timeScale = -1; // negative plays backward
action.paused = true; // freeze in place

action.setLoop(THREE.LoopOnce, 1); // stop (or hold) after one pass
action.setLoop(THREE.LoopRepeat, Infinity); // the default
action.setLoop(THREE.LoopPingPong, 4); // alternate direction each pass
action.clampWhenFinished = true; // hold the final pose instead of resetting
```

## Fades and Crossfades

```javascript
const mixer = new THREE.AnimationMixer(mesh);
const idleClip = new THREE.AnimationClip("idle", 2, [
  new THREE.NumberKeyframeTrack(".position[y]", [0, 1, 2], [0, 0.05, 0]),
]);
const walkClip = new THREE.AnimationClip("walk", 1, [
  new THREE.NumberKeyframeTrack(".rotation[y]", [0, 1], [0, Math.PI]),
]);

const idle = mixer.clipAction(idleClip).play();
const walk = mixer.clipAction(walkClip).play();

// Hand over from idle to walk over 0.4 s; true as the third argument also warps
// both time scales so their cycle lengths match during the fade
idle.crossFadeTo(walk, 0.4, false);

// The same hand-over from the one-sided calls (use one form, not both)
walk.reset().fadeIn(0.4).play(); // ramp weight up from 0
idle.fadeOut(0.4); // ramp weight down to 0
```
