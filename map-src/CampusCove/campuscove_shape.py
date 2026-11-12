import argparse
import os
import sys
import time

import torch
from PIL import Image

sys.path.insert(0, os.getcwd())
from hy3dgen.rembg import BackgroundRemover
from hy3dgen.shapegen import DegenerateFaceRemover, FloaterRemover, Hunyuan3DDiTFlowMatchingPipeline

parser = argparse.ArgumentParser(description='Concept image -> raw mesh with Hunyuan3D-2 (run from the Hunyuan3D-2 checkout)')
parser.add_argument('image_path')
parser.add_argument('out_path')
parser.add_argument('--model', default='hunyuan3d-dit-v2-0-turbo', choices=['hunyuan3d-dit-v2-0-turbo', 'hunyuan3d-dit-v2-0'])
parser.add_argument('--steps', type=int, default=5)
parser.add_argument('--octree', type=int, default=256)
args = parser.parse_args()

t = time.time()
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2', subfolder=args.model, device='mps', dtype=torch.float16, use_safetensors=True)
print(f'loaded {time.time()-t:.0f}s', flush=True)
image = BackgroundRemover()(Image.open(args.image_path).convert('RGB'))
t = time.time()
mesh = pipe(image=image, num_inference_steps=args.steps, octree_resolution=args.octree, num_chunks=8000, generator=torch.manual_seed(1234), output_type='trimesh')[0]
mesh = DegenerateFaceRemover()(FloaterRemover()(mesh))
mesh.export(args.out_path)
print(f'generated {time.time()-t:.0f}s faces {len(mesh.faces)}', flush=True)
