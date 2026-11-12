import os
import sys

import numpy as np
from PIL import Image
from rembg import new_session, remove

ref_path = sys.argv[1]
cut = remove(Image.open(ref_path).convert("RGB"), session=new_session())
alpha = np.asarray(cut)[:, :, 3]
if not (alpha > 127).any():
    sys.exit(f"{ref_path}: rembg found no subject")
out = os.path.join(os.path.dirname(ref_path), "mask.png")
Image.fromarray(np.where(alpha > 127, 255, 0).astype(np.uint8)).save(out)
print(f"{out}: {int((alpha > 127).mean() * 100)}% subject")
