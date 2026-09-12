#!/usr/bin/env python3
"""Import helper for FlyWire exports (CC BY-NC 4.0).

IMPORTANT: FlyWire public data is NonCommercial. Do not use for commercial products.
This script never auto-downloads the full dataset.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


def _load_convert():
    path = Path(__file__).with_name("import_hemibrain.py")
    spec = importlib.util.spec_from_file_location("import_hemibrain", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.convert_edge_list


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edges", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("data/processed/flywire"))
    parser.add_argument("--max-nodes", type=int, default=None)
    args = parser.parse_args()
    print(
        "WARNING: Upstream FlyWire license is CC BY-NC 4.0 — non-commercial use only."
    )
    convert_edge_list = _load_convert()
    convert_edge_list(args.edges, args.out, max_nodes=args.max_nodes)
    meta_path = args.out / "meta.json"
    if meta_path.exists():
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
        payload["metadata"]["source"] = "flywire_user_export"
        payload["metadata"]["license"] = "CC BY-NC 4.0"
        payload["metadata"]["commercial_use"] = "NOT permitted under CC BY-NC"
        meta_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
