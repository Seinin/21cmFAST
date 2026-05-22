#!/usr/bin/env python
"""
sample_cosmology.py — LHS 采样 + 功率谱曲线生成

对四个天体物理参数进行拉丁超立方采样（LHS），每个样本包含:
  1. 四个参数的 [0,1] 归一化值
  2. 对应的 256 点功率谱曲线 Δ²₂₁(k)

所有 21cmFAST 模拟逻辑委托给 scripts/_common.py，本文件只负责 LHS 采样和批生成。

Usage:
    python train/sample_cosmology.py                     # 默认 100 个样本
    python train/sample_cosmology.py --n-samples 1000    # 自定义样本数
    python train/sample_cosmology.py --mock              # 用 mock 数据快速测试流程
    python train/sample_cosmology.py --show-samples      # 仅展示采样点
"""

import argparse
import json
import multiprocessing as mp
import os
import sys
import time
from pathlib import Path

import numpy as np
import yaml
from scipy.stats.qmc import LatinHypercube

# ---------------------------------------------------------------------------
# 路径 —— import scripts/_common
# ---------------------------------------------------------------------------
SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from _common import rebin_power_spectrum, run_simulation

OUTPUT_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)

# ============================================================================
# 参数定义
# ============================================================================

PARAM_CONFIG = {
    "ALPHA_STAR":     (0.1, 1.0,   0.5,  "恒星形成幂律指数"),
    "HII_EFF_FACTOR": (5.0, 50.0,  30.0, "电离效率因子 ζ"),
    "ION_Tvir_MIN":   (4.0, 5.5,   4.7,  "最小晕阈值 log10(K)"),
    "L_X":            (38.0, 42.0, 40.5, "X射线光度 log10(erg/s)"),
}

PARAM_NAMES = list(PARAM_CONFIG.keys())
PARAM_LB = np.array([v[0] for v in PARAM_CONFIG.values()])
PARAM_UB = np.array([v[1] for v in PARAM_CONFIG.values()])


# ============================================================================
# LHS 采样 (归一化/反归一化)
# ============================================================================

def sample_lhs(n_samples: int, seed: int = 42) -> np.ndarray:
    """拉丁超立方采样，返回 (n_samples, 4) 归一化 ∈ [0,1]"""
    sampler = LatinHypercube(d=len(PARAM_NAMES), seed=seed)
    return sampler.random(n=n_samples)


def denormalize(normalized: np.ndarray) -> np.ndarray:
    """[0,1] → 物理范围"""
    return PARAM_LB + (PARAM_UB - PARAM_LB) * normalized


def normalize(physical: np.ndarray) -> np.ndarray:
    """物理值 → [0,1]"""
    return (physical - PARAM_LB) / (PARAM_UB - PARAM_LB)


# ============================================================================
# 单次模拟
# ============================================================================

def simulate_one(physical_params: np.ndarray, redshift: float = 10.0,
                  n_threads: int = 1) -> np.ndarray:
    """
    对一组物理参数运行 21cmFAST，返回 256 点功率谱曲线。

    Parameters
    ----------
    physical_params : 形状 (4,) 的物理参数数组
    redshift : 目标红移
    n_threads : OpenMP 线程数（单次模拟内部并行，默认 1）
    """
    astro = dict(zip(PARAM_NAMES, map(float, physical_params)))

    config = {
        "simulation": {
            "HII_DIM": 128,
            "BOX_LEN": 200.0,
            "random_seed": 42,
            "N_THREADS": n_threads,
            "n_k_bins": 256,
            "k_min": 0.03,
            "k_max": 10.0,
            "z_min": redshift,
            "z_max": redshift,
            "n_redshift": 1,
        },
        "astro_params": astro,
        "template": "simple",
    }

    results = run_simulation(config, quiet=True, regenerate=True, write_cache=False)
    k = results["k_values"]
    delta_sq = results["power_spectra"][0]
    return rebin_power_spectrum(k, delta_sq, n_bins=256)


# ============================================================================
# Mock 曲线
# ============================================================================

def mock_curve(n_bins: int = 256) -> np.ndarray:
    """拟真伪功率谱曲线，用于快速测试数据流"""
    k = np.logspace(np.log10(0.03), np.log10(1.6), n_bins)
    amplitude = 10 ** np.random.uniform(0, 1.5)
    slope = np.random.uniform(1.5, 3.0)
    curve = amplitude * k ** (-slope)
    curve *= 1 + np.random.normal(0, 0.02, n_bins)
    return curve


# ============================================================================
# 批生成
# ============================================================================

# ============================================================================
# NaN 检查
# ============================================================================

def check_nan(dataset: dict) -> dict:
    """全面检查数据集中的 NaN/Inf，返回详细统计。"""
    report = {}
    for key in ["params_normalized", "params_physical", "curves"]:
        arr = dataset[key]
        n_nan = int(np.isnan(arr).sum())
        n_inf = int(np.isinf(arr).sum())
        n_finite = arr.size - n_nan - n_inf
        report[key] = {
            "total_elements": int(arr.size),
            "nan_count": n_nan,
            "inf_count": n_inf,
            "finite_count": n_finite,
        }
    # 样本级检查: 哪些样本的曲线包含 NaN
    curve_nan_per_sample = np.isnan(dataset["curves"]).any(axis=1)
    bad_indices = np.where(curve_nan_per_sample)[0].tolist()
    report["samples_with_nan_curve"] = {
        "count": len(bad_indices),
        "indices": bad_indices,
    }
    report["all_clean"] = all(
        report[k]["nan_count"] == 0 and report[k]["inf_count"] == 0
        for k in ["params_normalized", "params_physical", "curves"]
    )
    return report


def print_nan_report(report: dict) -> None:
    """打印 NaN 检查报告。"""
    status = "✓ 全部干净" if report["all_clean"] else "✗ 发现异常值!"
    print(f"\n{'='*60}")
    print(f"NaN/Inf 检查: {status}")
    print(f"{'='*60}")
    for key in ["params_normalized", "params_physical", "curves"]:
        r = report[key]
        print(f"  {key:22s}  total={r['total_elements']:>10d}  "
              f"NaN={r['nan_count']:>6d}  Inf={r['inf_count']:>6d}")
    bad = report["samples_with_nan_curve"]
    if bad["count"] > 0:
        print(f"\n  曲线含 NaN 的样本: {bad['count']} 个")
        print(f"  索引: {bad['indices']}")
    print(f"{'='*60}")

# ============================================================================
# 批生成
# ============================================================================

def _worker_simulate(args: tuple) -> tuple:
    """多进程 worker: 对一组物理参数运行模拟，返回 (idx, curve)。

    每个子进程在独立临时目录中运行，避免 HDF5 缓存文件写冲突。
    返回 (idx, curve_or_None) — 若模拟失败则 curve 为全零数组。
    """
    import shutil
    import tempfile

    idx, phys, _ = args
    os.environ["OMP_NUM_THREADS"] = "1"

    orig_cwd = os.getcwd()
    tmpdir = tempfile.mkdtemp(prefix="cmfast_worker_")
    os.chdir(tmpdir)
    try:
        curve = simulate_one(phys, n_threads=1)
    except Exception:
        curve = np.full(256, np.nan)  # 标记为失败
    finally:
        os.chdir(orig_cwd)
        shutil.rmtree(tmpdir, ignore_errors=True)

    return (idx, curve)


def _estimate_safe_workers(requested: int, mem_per_worker_gb: float = 2.5) -> int:
    """根据可用物理内存估算安全的 worker 数，避免 OOM。"""
    import shutil
    avail_gb = shutil.disk_usage("/").free / (1024**3)  # fallback
    try:
        # Linux: 读取实际可用内存 (MemAvailable)
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    avail_kb = int(line.split()[1])
                    avail_gb = avail_kb / (1024**2)
                    break
    except Exception:
        pass

    safe_count = max(1, int(avail_gb / mem_per_worker_gb))
    if requested > safe_count:
        print(f"  ⚠ 内存警告: 系统可用 ~{avail_gb:.1f} GB, "
              f"预估每进程 ~{mem_per_worker_gb} GB, 安全上限 ≈ {safe_count}")
        print(f"            {requested} → 强制降为 {safe_count} (避免 OOM)")
        return safe_count
    return requested


def generate_dataset(n_samples: int = 100, seed: int = 42, use_mock: bool = False,
                     n_workers: int = 1, n_threads: int = None) -> dict:
    """
    生成完整训练数据集。

    Returns
    -------
    dict with keys: params_normalized (n,4), params_physical (n,4),
                    curves (n,256), param_names, param_ranges
    """
    print(f"\n{'='*60}")
    print(f"LHS 采样 — {n_samples} 个样本")
    print(f"{'='*60}")
    print(f"参数: {', '.join(PARAM_NAMES)}")
    for name in PARAM_NAMES:
        lb, ub, df, desc = PARAM_CONFIG[name]
        print(f"  {name:16s} ∈ [{lb:5.1f}, {ub:5.1f}]   默认={df}")
    print(f"{'='*60}\n")

    print("▶ LHS 采样...")
    norm = sample_lhs(n_samples, seed=seed)
    phys = denormalize(norm)

    curves = np.zeros((n_samples, 256))
    if use_mock:
        print(f"▶ 生成 mock 功率谱曲线...")
        for i in range(n_samples):
            curves[i] = mock_curve(256)
            if (i + 1) % max(1, n_samples // 10) == 0:
                print(f"  {i+1}/{n_samples}")
    else:
        if n_threads is None:
            n_threads = max(1, mp.cpu_count())

        if n_workers <= 1:
            # ---- 单进程：OpenMP 多线程 ----
            print(f"▶ 运行 21cmFAST 模拟 (单进程, OpenMP ×{n_threads})...")
            for i in range(n_samples):
                t0 = time.time()
                curves[i] = simulate_one(phys[i], n_threads=n_threads)
                elapsed = time.time() - t0
                eta = elapsed * (n_samples - i - 1)
                print(f"  [{i+1}/{n_samples}] z=10.0 耗时={elapsed:.1f}s  "
                      f"ETA={eta/60:.0f}min  params={phys[i]}")
        else:
            # ---- 多进程：自动限流，避免 OOM ----
            n_workers = _estimate_safe_workers(n_workers)
            print(f"▶ 运行 21cmFAST 模拟 ({n_workers} 进程并行, 每进程 OpenMP ×1)...")
            t_total = time.time()
            tasks = [(i, phys[i], None) for i in range(n_samples)]
            completed = 0
            with mp.Pool(processes=n_workers, maxtasksperchild=1) as pool:
                for idx, curve in pool.imap_unordered(_worker_simulate, tasks):
                    curves[idx] = curve
                    completed += 1
                    elapsed = (time.time() - t_total) / 60
                    eta = elapsed / completed * (n_samples - completed) if completed > 0 else 0
                    status = "✗" if np.isnan(curve).any() else "✓"
                    print(f"  [{completed}/{n_samples}] idx={idx} {status}  "
                          f"elapsed={elapsed:.1f}min  ETA={eta:.1f}min")
            print(f"  总耗时: {(time.time() - t_total)/60:.1f} min")

    result = {
        "params_normalized": norm,
        "params_physical": phys,
        "curves": curves,
        "param_names": PARAM_NAMES,
        "param_ranges": {name: (lb, ub) for name, (lb, ub, *_rest) in PARAM_CONFIG.items()},
    }

    # 自动 NaN 检查
    nan_report = check_nan(result)
    print_nan_report(nan_report)

    return result


# ============================================================================
# 保存 / 加载
# ============================================================================

def save_dataset(dataset: dict, filename: str = "lhs_samples.npz"):
    path = OUTPUT_DIR / filename
    np.savez(
        path,
        params_normalized=dataset["params_normalized"],
        params_physical=dataset["params_physical"],
        curves=dataset["curves"],
        param_names=np.array(dataset["param_names"], dtype=str),
    )
    yaml_path = path.with_suffix(".yaml")
    with open(yaml_path, "w") as f:
        yaml.dump({"param_ranges": dataset["param_ranges"]}, f, default_flow_style=False)

    print(f"\n数据集已保存:")
    print(f"  样本数据: {path}")
    print(f"  参数范围: {yaml_path}")
    print(f"  形状: params={dataset['params_normalized'].shape}, curves={dataset['curves'].shape}")


def save_dataset_json(dataset: dict, filename: str = "lhs_samples.json"):
    """保存数据集为 JSON 格式（兼容 Python/JS/任意语言）。"""
    path = OUTPUT_DIR / filename

    # NumPy 数组 → Python list，数值 → float/int 确保 JSON 序列化
    out = {
        "description": "21cmFAST LHS sampled dataset — 4 astro params → 256-point power spectrum",
        "n_samples": int(len(dataset["params_normalized"])),
        "param_names": dataset["param_names"],
        "param_ranges": {k: [float(v[0]), float(v[1])] for k, v in dataset["param_ranges"].items()},
        "params_normalized": dataset["params_normalized"].tolist(),
        "params_physical": dataset["params_physical"].tolist(),
        "curves": dataset["curves"].tolist(),
        "curve_length": 256,
        "curve_type": "log-log Δ²₂₁(k) power spectrum",
    }

    with open(path, "w") as f:
        json.dump(out, f)

    file_size_mb = path.stat().st_size / (1024 * 1024)
    print(f"\nJSON 数据集已保存: {path}  ({file_size_mb:.1f} MB)")


def load_dataset(filename: str = "lhs_samples.npz") -> dict:
    path = OUTPUT_DIR / filename
    data = np.load(path, allow_pickle=True)
    dataset = {
        "params_normalized": data["params_normalized"],
        "params_physical": data["params_physical"],
        "curves": data["curves"],
        "param_names": list(data["param_names"]),
        "param_ranges": {
            name: (PARAM_CONFIG[name][0], PARAM_CONFIG[name][1])
            for name in PARAM_NAMES
        },
    }
    print(f"已加载数据集: {path}")
    print(f"  样本数: {len(dataset['params_normalized'])}")
    return dataset


# ============================================================================
# 命令行
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="LHS 采样 4 个天体物理参数，生成 256 点功率谱数据集"
    )
    parser.add_argument("--n-samples", type=int, default=100, help="样本数量")
    parser.add_argument("--seed", type=int, default=42, help="随机种子")
    parser.add_argument("--mock", action="store_true", help="使用 mock 曲线，不运行 21cmFAST")
    parser.add_argument("--output", type=str, default="lhs_samples", help="输出文件名（不含扩展名）")
    parser.add_argument("--format", type=str, choices=["npz", "json", "both"], default="npz",
                        help="输出格式")
    parser.add_argument("--n-workers", type=int, default=1,
                        help="并行进程数 (1=单进程OpenMP, >1=多进程每进程1线程)")
    parser.add_argument("--n-threads", type=int, default=None,
                        help="单进程时的OpenMP线程数 (默认=CPU核数)")
    parser.add_argument("--show-samples", action="store_true", help="仅展示采样点")

    args = parser.parse_args()

    if args.show_samples:
        norm = sample_lhs(args.n_samples, seed=args.seed)
        phys = denormalize(norm)
        print(f"\n归一化样本 (前5个) [0,1]:")
        print(norm[:5])
        print(f"\n对应物理值:")
        header = "  " + "  ".join(f"{n:>14s}" for n in PARAM_NAMES)
        print(header)
        for row in phys[:5]:
            print("  " + "  ".join(f"{v:14.6f}" for v in row))
        sys.exit(0)

    dataset = generate_dataset(n_samples=args.n_samples, seed=args.seed,
                               use_mock=args.mock, n_workers=args.n_workers,
                               n_threads=args.n_threads)

    if args.format in ("npz", "both"):
        save_dataset(dataset, filename=f"{args.output}.npz")
    if args.format in ("json", "both"):
        save_dataset_json(dataset, filename=f"{args.output}.json")
