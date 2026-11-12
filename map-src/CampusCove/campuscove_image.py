import argparse
import time

import torch
from diffusers import Flux2KleinPipeline
from PIL import Image

STYLE = ('stylized low-poly pastel game asset, simple clean chunky shapes, smooth rounded edges, soft flat colors, '
         '{view}, centered, full object visible, plain white background, no shadow, no text')
VIEWS = {
    'quarter': 'three-quarter view',
    'side': '3D rendered toy model with soft studio lighting and visible volume, strict side profile facing right, camera level with the body, all legs visible and apart',
}

parser = argparse.ArgumentParser(description='Concept image for make model (FLUX.2 klein, local MPS)')
parser.add_argument('subject')
parser.add_argument('out_path')
parser.add_argument('--seed', type=int, default=42)
parser.add_argument('--view', choices=sorted(VIEWS), default='quarter')
parser.add_argument('--ref', action='append', default=[], help='reference image guiding shape and anatomy, repeatable')
args = parser.parse_args()

t = time.time()
pipe = Flux2KleinPipeline.from_pretrained('black-forest-labs/FLUX.2-klein-4B', torch_dtype=torch.bfloat16).to('mps')
print(f'loaded {time.time()-t:.0f}s', flush=True)
t = time.time()
references = [Image.open(path).convert('RGB') for path in args.ref] or None
image = pipe(image=references, prompt=f'{args.subject}, {STYLE.format(view=VIEWS[args.view])}', height=1024, width=1024,
             num_inference_steps=4, guidance_scale=1.0, generator=torch.Generator('mps').manual_seed(args.seed)).images[0]
image.save(args.out_path)
print(f'generated {time.time()-t:.0f}s', flush=True)
