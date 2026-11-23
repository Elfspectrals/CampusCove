# AnimationClip and Keyframe Tracks

```javascript
// One track per animated property. values.length must be times.length * valueSize.
const times = [0, 1, 2]; // keyframe times in seconds
const values = [0, 1, 0]; // one scalar per keyframe for a Number track

const track = new THREE.NumberKeyframeTrack(".position[y]", times, values); // the root's position.y

const clip = new THREE.AnimationClip("bounce", 2, [track]); // duration in seconds
// pass -1 as the duration to derive it from the tracks
```

Track names follow `nodeName.objectName[objectIndex].propertyName[propertyIndex]`; all parts except the property are optional. `.position` binds the root's position, `.material.opacity` a material property, `.position[y]` one component, `.morphTargetInfluences[smile]` one morph target, `Hips.position` a named descendant — that is how bones are addressed in a skinned model. Object names may be `material`, `materials`, `bones` or `map`.

```javascript
// Number track (value size 1); create the material with transparent: true, or opacity is ignored
new THREE.NumberKeyframeTrack(".material.opacity", [0, 1], [1, 0]);

// Vector track (value size 3: x, y, z per keyframe)
new THREE.VectorKeyframeTrack(".position", [0, 1, 2], [0, 0, 0, 1, 2, 0, 0, 0, 0]);

// Rotation track (value size 4): quaternion x, y, z, w per keyframe, not Euler angles
const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
new THREE.QuaternionKeyframeTrack(
  ".quaternion",
  [0, 1],
  [0, 0, 0, 1, q2.x, q2.y, q2.z, q2.w], // identity, then q2
);

// Color track (value size 3)
new THREE.ColorKeyframeTrack(".material.color", [0, 1], [1, 0, 0, 0, 1, 0]);

// Boolean track (always discrete)
new THREE.BooleanKeyframeTrack(".visible", [0, 1], [true, false]);
```

## Interpolation

```javascript
const track = new THREE.VectorKeyframeTrack(
  ".position",
  [0, 1, 2],
  [0, 0, 0, 1, 2, 0, 0, 0, 0],
);

track.setInterpolation(THREE.InterpolateLinear); // default
track.setInterpolation(THREE.InterpolateSmooth); // cubic through the keyframes
track.setInterpolation(THREE.InterpolateDiscrete); // step, no in-between values

// Bezier takes absolute (time, value) control points, two numbers per keyframe per
// component: a stride-1 two-keyframe track needs four entries per array
const morphTrack = new THREE.NumberKeyframeTrack(
  ".morphTargetInfluences[smile]",
  [0, 1],
  [0, 1],
);
morphTrack.setInterpolation(THREE.InterpolateBezier);
morphTrack.settings = { inTangents: [0, 0, 1, 1], outTangents: [0, 1, 1, 0] };
```
