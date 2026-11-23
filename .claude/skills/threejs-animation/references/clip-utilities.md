# Clip Utilities

```javascript
const clip = new THREE.AnimationClip("walk", 2, [
  new THREE.NumberKeyframeTrack(".rotation[y]", [0, 1, 2], [0, Math.PI, Math.PI * 2]),
]);

const walk = THREE.AnimationClip.findByName([clip], "walk"); // name lookup
// Keeps the existing keyframes in frames [0, 31) at 30 fps (times 0 and 1); it never resamples
const cut = THREE.AnimationUtils.subclip(clip, "half", 0, 31, 30);
const copy = clip.clone(); // independent deep copy

clip.optimize(); // drops duplicate-time keys, and keys equal to both neighbours on any non-smooth track (Bezier tangents are not compacted)
clip.resetDuration(); // recomputes duration from the longest track — it does not seek
console.log(clip.validate()); // false for a fractional values-to-times ratio, an empty track, unsorted times or NaN
```
