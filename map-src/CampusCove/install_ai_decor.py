import glob
import os
import re
import shutil
import sys

FILES = ("model.glb", "collision.json", "parts.json")


def install(source, assets, key, category):
    target = os.path.join(assets, key)
    if os.path.exists(target):
        sys.exit(f"{target} already exists: refusing to overwrite it")
    categories_path = os.path.join(assets, "categories.json")
    text = open(categories_path, encoding="utf-8").read()
    if re.search(rf'"{re.escape(key)}"', text):
        sys.exit(f"{key} is already listed in {categories_path}")
    line = re.compile(rf'^(\s*\{{ "id": "{re.escape(category)}",.*?"keys": \[[^\]]*?)(\] \}},?)$', re.M)
    if not line.search(text):
        sys.exit(f"category {category} not found in {categories_path}")
    os.makedirs(target)
    for name in FILES + tuple(os.path.basename(p) for p in glob.glob(os.path.join(source, "parts_*.png"))):
        shutil.copy(os.path.join(source, name), os.path.join(target, name))
    with open(categories_path, "w", encoding="utf-8") as f:
        f.write(line.sub(lambda m: f'{m.group(1)}{"" if m.group(1).endswith("[") else ", "}"{key}"{m.group(2)}', text, count=1))
    print(f"{target}: installed in category {category}")


if __name__ == "__main__":
    install(*sys.argv[1:5])
