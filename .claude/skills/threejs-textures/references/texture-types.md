# Texture Types

Base class from any image element:

```javascript
const image = new Image();
image.src = "sprite.png";

const imageTexture = new THREE.Texture(image);
imageTexture.colorSpace = THREE.SRGBColorSpace;
image.onload = () => (imageTexture.needsUpdate = true); // upload once the pixels exist
```

`DataTexture` from raw typed-array pixels. Its defaults differ from `Texture`: `NearestFilter` for both filters, `flipY` false, mipmaps off:

```javascript
const size = 256;
const data = new Uint8Array(size * size * 4); // RGBA, one byte per channel
for (let i = 0; i < size; i++) {
  for (let j = 0; j < size; j++) {
    const index = (i * size + j) * 4;
    data[index] = i;
    data[index + 1] = j;
    data[index + 2] = 128;
    data[index + 3] = 255;
  }
}
const dataTexture = new THREE.DataTexture(data, size, size);
dataTexture.needsUpdate = true;
```

`CanvasTexture` for dynamically drawn textures (sets `needsUpdate` on construction):

```javascript
const canvas = document.createElement("canvas");
canvas.width = 256;
canvas.height = 256;
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#404040";
ctx.fillRect(0, 0, 256, 256);
ctx.fillStyle = "#ffffff";
ctx.font = "48px sans-serif";
ctx.fillText("Hello", 40, 150);

const canvasTexture = new THREE.CanvasTexture(canvas);
canvasTexture.colorSpace = THREE.SRGBColorSpace; // canvas colors are sRGB

// after each redraw of the canvas:
canvasTexture.needsUpdate = true;
```

`VideoTexture` for a playing `HTMLVideoElement` (re-uploads every frame, mipmaps off):

```javascript
const video = document.createElement("video");
video.src = "video.mp4";
video.loop = true;
video.muted = true;
video.play();

const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;
```

`VideoFrameTexture` for WebCodecs: each decoded frame is pushed by hand:

```javascript
const frameTexture = new THREE.VideoFrameTexture();
frameTexture.colorSpace = THREE.SRGBColorSpace;
const decoder = new VideoDecoder({
  output(frame) {
    if (frameTexture.image instanceof VideoFrame) frameTexture.image.close(); // free the replaced frame, or decoding stalls
    frameTexture.setFrame(frame);
  },
  error: (e) => console.error(e),
});
```

`HTMLTexture` draws an HTML element through the browser's HTML-in-Canvas API: the renderer moves the element into its own canvas and re-uploads it on paint events; where the browser lacks that API the texture stays empty.
