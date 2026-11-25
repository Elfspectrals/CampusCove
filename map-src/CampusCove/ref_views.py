import argparse
import os
import subprocess
import sys
import time

from huggingface_hub import hf_hub_download, snapshot_download
from PIL import Image

SIZE = 1024
MARGIN = 1.1
STEPS = 8
EDIT_MODEL = 'AbstractFramework/qwen-image-edit-2511-4bit'
SPEED_LORA = ('lightx2v/Qwen-Image-Edit-2511-Lightning', 'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors', 1.0)
ANGLE_LORA = ('fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA', 'qwen-image-edit-2511-multiple-angles-lora.safetensors', 0.9)
ANGLES = {
    'back': 'back view',
    'side': 'front-right quarter view',
}
SHOT = 'eye-level shot medium shot'

parser = argparse.ArgumentParser(description='Square the reference image and generate its missing views (Qwen-Image-Edit-2511 with the multiple-angles LoRA, local MLX)')
parser.add_argument('ref_path')
parser.add_argument('views', nargs='*', choices=sorted(ANGLES))
parser.add_argument('--normalise', action='store_true', help='pad the reference to a square with a margin and resize it to 1024 px')
parser.add_argument('--seed', type=int, default=42)
args = parser.parse_args()

reference = Image.open(args.ref_path).convert('RGB')
if args.normalise:
    side = round(max(reference.size) * MARGIN)
    canvas = Image.new('RGB', (side, side), reference.getpixel((0, 0)))
    canvas.paste(reference, ((side - reference.width) // 2, (side - reference.height) // 2))
    reference = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    reference.save(args.ref_path)

if args.views:
    generator = os.path.join(os.path.dirname(sys.executable), 'mflux-generate-qwen-edit')
    model = snapshot_download(EDIT_MODEL, local_files_only=True)
    loras = [hf_hub_download(repo, name, local_files_only=True) for repo, name, _ in (SPEED_LORA, ANGLE_LORA)]
    scales = [str(scale) for _, _, scale in (SPEED_LORA, ANGLE_LORA)]
for view in args.views:
    t = time.time()
    output = os.path.join(os.path.dirname(args.ref_path), f'ref_{view}.png')
    subprocess.run([generator, '--model', model, '--base-model', 'qwen-image-edit-2511', '--lora-paths', *loras, '--lora-scales', *scales,
                    '--steps', str(STEPS), '--guidance', '1.0', '--seed', str(args.seed), '--width', str(SIZE), '--height', str(SIZE),
                    '--image-paths', args.ref_path, '--prompt', f'<sks> {ANGLES[view]} {SHOT}', '--output', output, '--no-progress'], check=True)
    print(f'{view} generated {time.time()-t:.0f}s', flush=True)
