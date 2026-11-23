# Morph Targets

```javascript
// mesh carries morph targets (loaded, or added by hand below)
const names = Object.keys(mesh.morphTargetDictionary); // name -> index
console.log(names, mesh.morphTargetInfluences); // one weight per target

// Blend a target by index or by name; 0 = base shape, 1 = full target
mesh.morphTargetInfluences[0] = 0.5;
const smileIndex = mesh.morphTargetDictionary["Mouth_Smile"];
if (smileIndex !== undefined) mesh.morphTargetInfluences[smileIndex] = 1;
```

Adding a morph target by hand:

```javascript
const geometry = mesh.geometry;

// A morph target is a full-size position (or normal) attribute beside the base one
const raised = geometry.attributes.position.array.slice(); // same vertex count
for (let i = 1; i < raised.length; i += 3) {
  raised[i] += 0.5; // y is every third component: lift every vertex
}

const target = new THREE.Float32BufferAttribute(raised, 3);
target.name = "raised"; // named targets stay addressable from tracks

geometry.morphAttributes.position = [target];
mesh.updateMorphTargets(); // rebuilds morphTargetInfluences and the dictionary
```

Driving morph targets:

```javascript
// Procedural, inside the render loop after timer.update():
// mesh.morphTargetInfluences[0] = (Math.sin(timer.getElapsed() * 2) + 1) / 2;

// Keyframed: a Number track drives one target by name — never a String track
const track = new THREE.NumberKeyframeTrack(
  ".morphTargetInfluences[raised]",
  [0, 0.5, 1],
  [0, 1, 0],
);
const clip = new THREE.AnimationClip("pulse", 1, [track]);
const mixer = new THREE.AnimationMixer(mesh);
mixer.clipAction(clip).play();
```
