#!/usr/bin/env python
"""合并多机分片生成的数据集。

用法:
    python merge_parts.py dataset_2000_real --n-parts 4
    → 合并 dataset_2000_real_r0of4.npz ~ _r3of4.npz → dataset_2000_real.npz
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import yaml

OUTPUT_DIR = Path(__file__).resolve().parent / "data"


def merge(prefix: str, n_parts: int):
    all_norm, all_phys, all_curves = [], [], []
    param_names = None
    param_ranges = None

    for r in range(n_parts):
        npz_path = OUTPUT_DIR / f"{prefix}_r{r}of{n_parts}.npz"
        if not npz_path.exists():
            print(f"ERROR: {npz_path} 不存在")
            sys.exit(1)

        d = np.load(npz_path, allow_pickle=True)
        all_norm.append(d["params_normalized"])
        all_phys.append(d["params_physical"])
        all_curves.append(d["curves"])
        if param_names is None:
            param_names = d["param_names"].tolist()
        print(f"  part{r}: {d['curves'].shape[0]} samples  ← {npz_path}")

        # JSON
        json_path = npz_path.with_suffix(".json")
        if json_path.exists():
            with open(json_path) as f:
                jd = json.load(f)
            if param_ranges is None:
                param_ranges = jd["param_ranges"]

    merged_norm = np.concatenate(all_norm, axis=0)
    merged_phys = np.concatenate(all_phys, axis=0)
    merged_curves = np.concatenate(all_curves, axis=0)
    print(f"\n合并完成: {merged_curves.shape[0]} 样本")

    # 写 npz
    npz_out = OUTPUT_DIR / f"{prefix}.npz"
    np.savez(npz_out,
             params_normalized=merged_norm,
             params_physical=merged_phys,
             curves=merged_curves,
             param_names=np.array(param_names))
    print(f"  → {npz_out}")

    # 写 json
    json_out = OUTPUT_DIR / f"{prefix}.json"
    with open(json_out, "w") as f:
        json.dump({
            "description": "21cmFAST LHS sampled dataset — merged from parts",
            "n_samples": int(len(merged_norm)),
            "param_names": param_names,
            "param_ranges": param_ranges or {},
            "params_normalized": merged_norm.tolist(),
            "params_physical": merged_phys.tolist(),
            "curves": merged_curves.tolist(),
            "curve_length": merged_curves.shape[1],
        }, f)
    print(f"  → {json_out}")

    # 写 yaml
    yaml_out = OUTPUT_DIR / f"{prefix}.yaml"
    with open(yaml_out, "w") as f:
        yaml.dump({"param_ranges": param_ranges}, f, default_flow_style=False)
    print(f"  → {yaml_out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="合并多机分片数据集")
    parser.add_argument("prefix", type=str, help="输出文件前缀，如 dataset_2000_real")
    parser.add_argument("--n-parts", type=int, required=True, help="总分片数")
    args = parser.parse_args()
    merge(args.prefix, args.n_parts)
