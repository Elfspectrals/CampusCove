import json, os, re, sys

import numpy as np
from PIL import Image

STYLE = ('seamless tileable flat texture, orthographic front view filling the frame, stylized hand-painted game texture, '
         'soft pastel colors, even lighting, no shadows, no perspective, no objects, no text')
TEXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../front/public/assets/textures")
GENERATED_SIZE = 1024
LATENT_PIXELS = 16
WRAP_BAND = 32
PREVIEW_SIZE = 256
ID_PATTERN = re.compile(r"^[a-z0-9_]+$")


def generate_tileable(prompt, seed=42):
    import torch
    from diffusers import Flux2KleinPipeline
    pipe = Flux2KleinPipeline.from_pretrained('black-forest-labs/FLUX.2-klein-4B', torch_dtype=torch.bfloat16).to('mps')
    for layer in pipe.vae.decoder.modules():
        if isinstance(layer, torch.nn.Conv2d) and layer.padding != (0, 0):
            layer.padding_mode = 'circular'
    side = GENERATED_SIZE // LATENT_PIXELS

    def shift_half(pipeline, step, timestep, tensors):
        grid = tensors['latents'].reshape(1, side, side, -1)
        tensors['latents'] = torch.roll(grid, (side // 2, side // 2), dims=(1, 2)).reshape(tensors['latents'].shape)
        return tensors

    return pipe(prompt=f'{prompt}, {STYLE}', height=GENERATED_SIZE, width=GENERATED_SIZE, num_inference_steps=4,
                guidance_scale=1.0, generator=torch.Generator('mps').manual_seed(seed),
                callback_on_step_end=shift_half).images[0]


def close_wrap_columns(pixels):
    gap = pixels[:, :1] - pixels[:, -1:]
    ramp = (1 - np.arange(WRAP_BAND) / WRAP_BAND)[None, :, None] / 2
    closed = pixels.copy()
    closed[:, :WRAP_BAND] -= gap * ramp
    closed[:, -WRAP_BAND:] += gap * ramp[:, ::-1]
    return closed


def make_seamless(image):
    pixels = np.asarray(image.convert("RGB"), dtype=np.float64)
    closed = close_wrap_columns(close_wrap_columns(pixels).transpose(1, 0, 2)).transpose(1, 0, 2)
    return Image.fromarray(np.round(np.clip(closed, 0, 255)).astype(np.uint8))


def label_of(text):
    text = text.strip().replace("_", " ")
    return text[:1].upper() + text[1:]


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def add_to_library(textures_dir, key, label, tile_meters, category, color):
    for name, value in (("texture key", key), ("category", category)):
        if not ID_PATTERN.match(value):
            raise ValueError(f"{name} {value!r} must match {ID_PATTERN.pattern}")
    if not tile_meters > 0:
        raise ValueError(f"tileMeters must be positive, got {tile_meters}")
    folder = os.path.join(textures_dir, key)
    os.makedirs(folder, exist_ok=True)
    color.save(os.path.join(folder, "color.png"))
    color.resize((PREVIEW_SIZE, PREVIEW_SIZE), Image.LANCZOS).save(os.path.join(folder, "preview.png"))
    write_json(os.path.join(folder, "texture.json"),
               {"version": 1, "key": key, "label": label, "tileMeters": tile_meters, "maps": {"color": "color.png"}})
    categories_path = os.path.join(textures_dir, "categories.json")
    library = {"version": 1, "categories": []}
    if os.path.exists(categories_path):
        with open(categories_path) as f:
            library = json.load(f)
    for entry in library["categories"]:
        if key in entry["keys"]:
            entry["keys"].remove(key)
    target = next((entry for entry in library["categories"] if entry["id"] == category), None)
    if target is None:
        target = {"id": category, "label": label_of(category), "keys": []}
        library["categories"].append(target)
    target["keys"].append(key)
    write_json(categories_path, library)


def main(prompt, key, tile_meters, size, category, work_dir):
    os.makedirs(work_dir, exist_ok=True)
    raw = generate_tileable(prompt)
    raw.save(os.path.join(work_dir, "raw.png"))
    color = make_seamless(raw).resize((size, size), Image.LANCZOS)
    tiled = Image.new("RGB", (size * 2, size * 2))
    for offset in ((0, 0), (size, 0), (0, size), (size, size)):
        tiled.paste(color, offset)
    tiled.save(os.path.join(work_dir, "tiled.png"))
    add_to_library(TEXTURES_DIR, key, label_of(prompt), tile_meters, category, color)
    print(f"{key}: {size}px, {tile_meters} m per tile, category {category} -> {os.path.join(TEXTURES_DIR, key)}")


if __name__ == "__main__":
    prompt, key, tile_meters, size, category, work_dir = sys.argv[1:]
    main(prompt, key, float(tile_meters), int(size), category, work_dir)
