import json
import os
import sys
from datetime import date

PATH = "meta.json"


def check(folder, label):
    path = os.path.join(folder, PATH)
    if not os.path.exists(path):
        return
    previous = json.load(open(path, encoding="utf-8")).get("input")
    if previous != label:
        sys.exit(f"{folder} already holds another model ({previous!r}); pass SLUG=<other_name> or remove the folder")


def write(folder, pairs):
    meta = dict(pair.split("=", 1) for pair in pairs)
    meta["date"] = date.today().isoformat()
    with open(os.path.join(folder, PATH), "w", encoding="utf-8") as f:
        f.write(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    command, folder, *rest = sys.argv[1:]
    if command == "check":
        check(folder, rest[0])
    elif command == "write":
        write(folder, rest)
    else:
        raise SystemExit(f"unknown command {command}: check | write")
