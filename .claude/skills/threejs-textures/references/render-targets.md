# Render Targets

```javascript
const renderTarget = new THREE.WebGLRenderTarget(512, 512);
const rtScene = new THREE.Scene(); // must not contain the mesh that samples the target
rtScene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial())); // unlit, visible without lights

renderer.setRenderTarget(renderTarget);
renderer.render(rtScene, camera);
renderer.setRenderTarget(null); // back to the canvas

// the output is a texture like any other
mesh.material.map = renderTarget.texture;
```

Depth buffer as a texture:

```javascript
const depthTarget = new THREE.WebGLRenderTarget(512, 512);
depthTarget.depthTexture = new THREE.DepthTexture(512, 512); // default type UnsignedIntType
```

MSAA and multiple attachments:

```javascript
// MSAA: resolved into .texture automatically after rendering
const msaaTarget = new THREE.WebGLRenderTarget(512, 512, { samples: 4 });

// MRT: N color attachments, read back through .textures
const mrtTarget = new THREE.WebGLRenderTarget(512, 512, { count: 2 });
const firstAttachment = mrtTarget.textures[0];
const secondAttachment = mrtTarget.textures[1];
```
