import io
import json
import os
import re
import struct
import sys

import numpy as np
from PIL import Image

MAX_PARTS = 3
MIN_SHARE = 0.06
MIN_DISTANCE = 0.12
ITERATIONS = 12
DEFAULT_LABELS = ("Main", "Accent", "Detail")
TILES = ("Tiles", "Grout")
PLANKS = ("Planks", "Gaps")
LIBRARY_LABELS = {
    "brick": ("Bricks", "Mortar"),
    "a_red_brick_wall": ("Bricks", "Mortar", "Dark bricks"),
    "a_wooden_wall_stained_with_blood": ("Wood", "Blood", "Stains"),
    "backsplash": TILES, "bath_tile": TILES, "floor_tile": TILES, "kitchen_floor": TILES, "bathroom_floor": TILES,
    "mall_floor": TILES, "mall_floor_upper": TILES,
    "living_floor": PLANKS, "wood": PLANKS, "wood_floor": PLANKS, "pallet": PLANKS, "plywood": PLANKS,
    "paving": ("Stones", "Joints"), "stone": ("Stones", "Joints"),
    "shutter": ("Slats", "Grooves"),
    "soft_checker": ("Checks A", "Checks B", "Checks C"),
}
NAME = re.compile(r"[^A-Za-z0-9_.-]")


def kmeans(colors, k):
    centers = [colors.mean(axis=0)]
    for _ in range(k - 1):
        distance = np.min([np.linalg.norm(colors - c, axis=1) for c in centers], axis=0)
        centers.append(colors[int(np.argmax(distance))])
    centers = np.array(centers)
    for _ in range(ITERATIONS):
        labels = np.argmin(np.stack([np.linalg.norm(colors - c, axis=1) for c in centers]), axis=0)
        centers = np.array([colors[labels == i].mean(axis=0) if np.any(labels == i) else centers[i] for i in range(k)])
    return labels, centers


TRANSPARENT = 255
PALETTE = re.compile(r"^PaletteMaterial")


def split(pixels, opaque):
    colors = pixels.reshape(-1, 3)[opaque.reshape(-1)]
    best = None
    for k in range(2, MAX_PARTS + 1):
        labels, centers = kmeans(colors, k)
        shares = np.bincount(labels, minlength=k) / len(labels)
        gaps = [np.linalg.norm(centers[i] - centers[j]) for i in range(k) for j in range(i + 1, k)]
        if shares.min() < MIN_SHARE or min(gaps) < MIN_DISTANCE:
            break
        best = (labels, centers, shares)
    if best is None:
        return None
    labels, centers, shares = best
    order = np.argsort(-shares)
    remap = np.empty_like(order)
    remap[order] = np.arange(len(order))
    mask = np.full(opaque.shape, TRANSPARENT, dtype=np.uint8).reshape(-1)
    mask[opaque.reshape(-1)] = remap[labels]
    return mask.reshape(opaque.shape), centers[order]


def hex_of(rgb):
    return "#" + "".join(f"{int(round(max(0, min(1, v)) * 255)):02x}" for v in rgb)


def part_list(centers, labels):
    names = list(labels) + list(DEFAULT_LABELS[len(labels):])
    parts = []
    for i, center in enumerate(centers):
        label = names[i] if i < len(names) else f"Part {i + 1}"
        base = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or f"part_{i + 1}"
        part_id, n = base, 2
        while any(p["id"] == part_id for p in parts):
            part_id, n = f"{base}_{n}", n + 1
        parts.append({"id": part_id, "label": label[:1].upper() + label[1:], "color": hex_of(center)})
    return parts


def write_mask(mask, path):
    rgb = np.zeros((*mask.shape, 3), dtype=np.uint8)
    rgb[..., 0] = mask
    Image.fromarray(rgb, "RGB").save(path)


def image_pixels(image):
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32) / 255.0
    return rgba[..., :3], rgba[..., 3] > 0


def texture(folder, labels=()):
    meta_path = os.path.join(folder, "texture.json")
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    labels = labels or [p["label"] for p in meta.get("parts", [])]
    result = split(*image_pixels(Image.open(os.path.join(folder, meta["maps"]["color"]))))
    meta.pop("parts", None)
    meta["maps"].pop("mask", None)
    if result:
        mask, centers = result
        write_mask(mask, os.path.join(folder, "mask.png"))
        meta["maps"]["mask"] = "mask.png"
        meta["parts"] = part_list(centers, labels)
    elif os.path.exists(os.path.join(folder, "mask.png")):
        os.remove(os.path.join(folder, "mask.png"))
    with open(meta_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(meta, indent=2) + "\n")
    return meta.get("parts", [])


def glb_images(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"glTF":
        raise RuntimeError(f"{path} is not a GLB")
    json_length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_length])
    binary = data[20 + json_length + 8:]
    images = {}
    for material in gltf.get("materials", []):
        info = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if info is None:
            continue
        texture_def = gltf["textures"][info["index"]]
        source = texture_def.get("source")
        if source is None:
            source = next(iter(texture_def.get("extensions", {}).values()))["source"]
        view = gltf["bufferViews"][gltf["images"][source]["bufferView"]]
        start = view.get("byteOffset", 0)
        images[material["name"]] = Image.open(io.BytesIO(binary[start:start + view["byteLength"]]))
    return images


def model(folder, labels=()):
    path = os.path.join(folder, "parts.json")
    previous = json.load(open(path, encoding="utf-8"))["materials"] if os.path.exists(path) else {}
    out = {"version": 1, "materials": {}}
    for old in os.listdir(folder):
        if old.startswith("parts_") and old.endswith(".png"):
            os.remove(os.path.join(folder, old))
    for name, image in sorted(glb_images(os.path.join(folder, "model.glb")).items()):
        if PALETTE.match(name):
            continue
        result = split(*image_pixels(image))
        if not result:
            continue
        mask, centers = result
        file = f"parts_{NAME.sub('_', name)}.png"
        write_mask(mask, os.path.join(folder, file))
        names = labels or [p["label"] for p in previous.get(name, {}).get("parts", [])]
        out["materials"][name] = {"mask": file, "parts": part_list(centers, names)}
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(out, indent=2) + "\n")
    return out["materials"]


def everything(assets):
    textures = os.path.join(assets, "textures")
    for key in sorted(os.listdir(textures)):
        if os.path.isdir(os.path.join(textures, key)):
            print(f"texture  {key}: {[p['label'] for p in texture(os.path.join(textures, key), LIBRARY_LABELS.get(key, ()))]}")
    decor = os.path.join(assets, "decor")
    for key in sorted(os.listdir(decor)):
        if os.path.exists(os.path.join(decor, key, "model.glb")):
            print(f"model    {key}: {len(model(os.path.join(decor, key)))} material(s) with parts")


if __name__ == "__main__":
    command, target = sys.argv[1], sys.argv[2]
    names = [n.strip() for n in sys.argv[3].split(",") if n.strip()] if len(sys.argv) > 3 else []
    if command == "texture":
        print(texture(target, names))
    elif command == "model":
        print(model(target, names))
    elif command == "all":
        everything(target)
    else:
        raise SystemExit(f"unknown command {command}: texture | model | all")
