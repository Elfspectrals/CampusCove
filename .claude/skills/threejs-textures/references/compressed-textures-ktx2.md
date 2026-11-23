# Compressed Textures (KTX2)

```javascript
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

const ktx2Loader = new KTX2Loader();
// No setTranscoderPath call: the transcoder loads from the three package.
// Set one only when self-hosting the decoders, pinned to this release.
ktx2Loader.detectSupport(renderer); // required before loading; works with both renderers

const compressedMap = await ktx2Loader.loadAsync("diffuse.ktx2");
// colorSpace comes from the file's transfer function; nothing to set by hand
```

Basis Universal KTX2 transcodes to a compressed format the GPU supports: smaller uploads and less memory than PNG or JPEG, which upload uncompressed (where the GPU supports none of the targets, KTX2Loader also falls back to uncompressed RGBA). Compressed textures cannot be flipped or mipmapped at upload: `flipY` stays false, so author the file in the orientation your UVs expect, and mipmaps must be embedded in the file.
