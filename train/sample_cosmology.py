#!/usr/bin/env python
"""
sample_cosmology.py — LHS 采样 + Δ²(z) 曲线生成

对五个参数（4 天体物理 + k）进行拉丁超立方采样（LHS），每个样本包含:
  1. 五个参数的 [0,1] 归一化值
  2. 对应的 {N_Z} 点 Δ²₂₁(z, k) 曲线

所有 21cmFAST 模拟逻辑委托给 scripts/_common.py，本文件只负责 LHS 采样和批生成。

Usage:
    python train/sample_cosmology.py                     # 默认 100 个样本
    python train/sample_cosmology.py --n-samples 1000    # 自定义样本数
    python train/sample_cosmology.py --mock              # 用 mock 数据快速测试流程
    python train/sample_cosmology.py --show-samples      # 仅展示采样点
"""

import argparse
import atexit
import json
import multiprocessing as mp
import os
import signal
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
# 进程清理：确保 kill 主进程时所有子进程一并终止，不残留内存
# ============================================================================

_active_pool = None

def _kill_pool():
    """强制终止 multiprocessing Pool 的所有子进程。"""
    global _active_pool
    if _active_pool is not None:
        _active_pool.terminate()
        _active_pool.join()
        _active_pool = None

def _on_kill_signal(signum, frame):
    """收到 SIGINT/SIGTERM 时杀掉整个子进程组，确保不留孤儿进程。"""
    _kill_pool()
    os._exit(1)

# 注册信号处理（Ctrl+C 或 kill 命令）
signal.signal(signal.SIGINT, _on_kill_signal)
signal.signal(signal.SIGTERM, _on_kill_signal)
atexit.register(_kill_pool)

# ============================================================================
# 参数定义
# ============================================================================

PARAM_CONFIG = {
    "ALPHA_STAR":     (0.1, 1.0,   0.5,  "恒星形成幂律指数"),
    "HII_EFF_FACTOR": (5.0, 50.0,  30.0, "电离效率因子 ζ"),
    "ION_Tvir_MIN":   (4.0, 5.5,   4.7,  "最小晕阈值 log10(K)"),
    "L_X":            (38.0, 42.0, 40.5, "X射线光度 log10(erg/s)"),
    "K_TARGET":       (0.05, 1.0,  0.2,  "wavenumber k [Mpc⁻¹]"),
}

# 红移扫描参数
Z_MIN, Z_MAX, N_Z = 5.0, 25.0, 128

# 天体物理参数名称（不含 k）
ASTRO_PARAM_NAMES = ["ALPHA_STAR", "HII_EFF_FACTOR", "ION_Tvir_MIN", "L_X"]
PARAM_NAMES = list(PARAM_CONFIG.keys())
PARAM_LB = np.array([v[0] for v in PARAM_CONFIG.values()])
PARAM_UB = np.array([v[1] for v in PARAM_CONFIG.values()])


# ============================================================================
# LHS 采样 (归一化/反归一化)
# ============================================================================

def sample_lhs(n_samples: int, seed: int = 42) -> np.ndarray:
    """拉丁超立方采样，返回 (n_samples, {n_params}) 归一化 ∈ [0,1]"""
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

def simulate_one(physical_params: np.ndarray,
                  z_min: float = None, z_max: float = None, n_z: int = None,
                  n_threads: int = 1) -> np.ndarray:
    """
    对一组物理参数运行 21cmFAST，返回 Δ²₂₁(z, k) 随红移演化的曲线。

    Parameters
    ----------
    physical_params : 形状 (5,) 的物理参数数组
        前 4 项: ALPHA_STAR, HII_EFF_FACTOR, ION_Tvir_MIN, L_X
        第 5 项: k_target [Mpc⁻¹]
    z_min, z_max, n_z : 红移范围和采样数
    n_threads : OpenMP 线程数（单次模拟内部并行，默认 1）
    """
    if z_min is None:
        z_min = Z_MIN
    if z_max is None:
        z_max = Z_MAX
    if n_z is None:
        n_z = N_Z

    astro = dict(zip(ASTRO_PARAM_NAMES, map(float, physical_params[:4])))
    k_target = float(physical_params[4])

    config = {
        "simulation": {
            "HII_DIM": 64,
            "BOX_LEN": 200.0,
            "random_seed": 42,
            "N_THREADS": n_threads,
            "n_k_bins": 256,
            "k_min": max(0.03, k_target * 0.5),
            "k_max": min(10.0, k_target * 2.0),
            "z_min": z_min,
            "z_max": z_max,
            "n_redshift": n_z,
        },
        "astro_params": astro,
        "template": "simple",
    }

    results = run_simulation(config, quiet=True, regenerate=True, write_cache=False)
    k_shell = results["k_values"]          # 同一网格，所有 redshift 共用

    # 在每个 redshift 的 Δ²(k) 中，对数插值到 k_target
    delta_at_z = np.zeros(n_z)
    for i, ds_shell in enumerate(results["power_spectra"]):
        valid = ds_shell > 0
        if valid.sum() < 2:
            # 该红移下 Δ²(k) 几乎为零（再电离结束后），直接填 0
            delta_at_z[i] = 0.0
            continue
        log_ks = np.log10(k_shell[valid])
        log_ds = np.log10(ds_shell[valid])
        delta_at_z[i] = 10 ** np.interp(np.log10(k_target), log_ks, log_ds)

    return delta_at_z


# ============================================================================
# Mock 曲线
# ============================================================================

def mock_curve(n_bins: int = 128) -> np.ndarray:
    """拟真 Δ²₂₁(z) 曲线（k 无关），用于快速测试数据流。
    模拟 EoR 信号：先升后降，峰值在 z~10。"""
    z = np.linspace(Z_MIN, Z_MAX, n_bins)
    peak_z = 8.0 + np.random.uniform(2, 5)
    width = 4.0 + np.random.uniform(1, 4)
    amplitude = 1.0 + np.random.uniform(0, 20)
    curve = amplitude * np.exp(-0.5 * ((z - peak_z) / width) ** 2)
    curve += np.random.uniform(0, 0.5, n_bins)  # 底部噪声
    curve *= (1 + np.random.normal(0, 0.02, n_bins))
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

    args = (idx, phys, n_threads)
    """
    import shutil
    import tempfile

    import gc

    idx, phys, n_threads = args
    os.environ["OMP_NUM_THREADS"] = str(n_threads)

    orig_cwd = os.getcwd()
    tmpdir = tempfile.mkdtemp(prefix="cmfast_worker_")
    os.chdir(tmpdir)
    try:
        print(f"  [worker #{idx}] 开始 21cmFAST 模拟 k={phys[4]:.2f} ...", flush=True)
        curve = simulate_one(phys, n_threads=n_threads)
    except Exception as e:
        import traceback
        print(f"  [worker #{idx}] 异常: {e}", flush=True)
        traceback.print_exc()
        curve = np.full(N_Z, np.nan)
    finally:
        os.chdir(orig_cwd)
        shutil.rmtree(tmpdir, ignore_errors=True)
        gc.collect()

    return (idx, curve)


def _estimate_safe_workers(requested: int, mem_per_worker_gb: float = 3.0) -> int:
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
    # 硬上限: 15GB 系统绝不超过 4 worker
    safe_count = min(safe_count, min(4, requested))
    if requested > safe_count:
        print(f"  ⚠ 内存警告: 系统可用 ~{avail_gb:.1f} GB, "
              f"预估每进程 ~{mem_per_worker_gb} GB, 安全上限 ≈ {safe_count}")
        print(f"            {requested} → 强制降为 {safe_count} (避免 OOM)")
        return safe_count
    return requested


def generate_dataset(n_samples: int = 100, seed: int = 42, use_mock: bool = False,
                     n_workers: int = 1, n_threads: int = None,
                     checkpoint_every: int = 1, rank: int = 0, n_parts: int = 1,
                     output_tag: str = "") -> dict:
    """
    生成完整训练数据集。

    rank / n_parts: 多机分片。当 n_parts > 1 时，本机只跑 rank 对应切片，
    但 LHS 仍然生成全部参数（保证所有机器参数集一致）。

    Returns
    -------
    dict with keys: params_normalized (n,5), params_physical (n,5),
                    curves (n,128), param_names, param_ranges
    """
    global _active_pool
    n_params = len(PARAM_NAMES)
    rank_tag = f"_r{rank}of{n_parts}" if n_parts > 1 else ""
    suffix = f"{output_tag}{rank_tag}" if output_tag else rank_tag
    print(f"\n{'='*60}")
    print(f"LHS 采样 — {n_samples} samples ({n_params} params: 4 astro + k)")
    if n_parts > 1:
        print(f"  分片模式: rank={rank}/{n_parts} (只跑本机负责的切片)")
    print(f"  Δ²₂₁(z, k)  curves")
    print(f"{'='*60}")
    print(f"参数: {', '.join(PARAM_NAMES)}")
    for name in PARAM_NAMES:
        lb, ub, df, desc = PARAM_CONFIG[name]
        print(f"  {name:16s} ∈ [{lb:5.1f}, {ub:5.1f}]   默认={df}")
    print(f"红移: z={Z_MIN}→{Z_MAX}  {N_Z} bins")
    print(f"{'='*60}\n")

    ckpt_base = suffix if suffix else str(n_samples)
    ckpt_path = OUTPUT_DIR / f"_ckpt_{ckpt_base}.npz"

    # ---- 分片计算 ----
    if n_parts > 1:
        chunk = n_samples // n_parts
        my_start = rank * chunk
        my_end = my_start + chunk if rank < n_parts - 1 else n_samples
        print(f"本机范围: 样本 [{my_start}, {my_end})  ({my_end - my_start} 个)")
    else:
        my_start, my_end = 0, n_samples

    # ---- 断点续跑：若 checkpoint 存在则从上次中断处继续 ----
    if ckpt_path.exists():
        ckpt = np.load(ckpt_path, allow_pickle=True)
        start_idx = int(ckpt["completed"])
        norm = ckpt["params_norm"]
        phys = ckpt["params_phys"]
        curves = ckpt["curves"]
        print(f"▶ 从 checkpoint 续跑: 已完成 {start_idx}/{my_end - my_start}，跳过前 {start_idx} 个样本")
    else:
        start_idx = 0
        print("▶ LHS 采样...")
        norm = sample_lhs(n_samples, seed=seed)
        phys = denormalize(norm)
        curves = np.zeros((my_end - my_start, N_Z))

    my_count = my_end - my_start
    abs_start = my_start + start_idx

    if use_mock:
        print(f"▶ 生成 mock Δ²(z) 曲线...")
        for i in range(start_idx, my_count):
            curves[i] = mock_curve(N_Z)
            if (i + 1) % max(1, my_count // 10) == 0:
                print(f"  {i+1}/{my_count}")
    else:
        if n_threads is None:
            # 优先尊重 OMP_NUM_THREADS 环境变量（低内存时设 1 避免 OOM）
            n_threads = int(os.environ.get("OMP_NUM_THREADS", max(1, mp.cpu_count())))

        if n_workers <= 1:
            # ---- 单 worker：子进程隔离，避免 C 层内存泄漏累积 ----
            print(f"▶ 运行 21cmFAST 模拟 (1 进程, OpenMP ×{n_threads}, 逐样本新进程) ...")
            t_total = time.time()
            tasks = [(i, phys[i], n_threads) for i in range(abs_start, my_end)]
            completed = start_idx
            # maxtasksperchild=1: 每完成一个样本就销毁子进程，保证 C 内存完全释放
            _active_pool = mp.Pool(processes=1, maxtasksperchild=1)
            try:
                for idx, curve in _active_pool.imap(_worker_simulate, tasks):
                    curves[idx - my_start] = curve
                    completed += 1
                    elapsed = (time.time() - t_total) / 60
                    eta = elapsed / (completed - start_idx) * (my_count - completed) if completed > start_idx else 0
                    tag = "✓" if not np.isnan(curve).any() else "✗"
                    print(f"  [{completed}/{my_count}] idx={idx} {tag}  "
                          f"elapsed={elapsed:.1f}min  ETA={eta:.1f}min  k={phys[idx][4]:.2f}",
                          flush=True)
                    if completed % checkpoint_every == 0:
                        np.savez_compressed(ckpt_path,
                                            params_norm=norm, params_phys=phys,
                                            curves=curves, completed=completed)
                        print(f"  ▸ checkpoint saved → {ckpt_path}", flush=True)
            finally:
                _kill_pool()
            print(f"  总耗时: {(time.time() - t_total)/60:.1f} min")
            if ckpt_path.exists():
                ckpt_path.unlink()
        else:
            # ---- 多进程：自动限流，避免 OOM ----
            n_workers = _estimate_safe_workers(n_workers)
            print(f"▶ 运行 21cmFAST 模拟 ({n_workers} 进程并行, 每进程 OpenMP ×1)...")
            t_total = time.time()
            tasks = [(i, phys[i], 1) for i in range(abs_start, my_end)]  # 多进程各只用 1 线程
            completed = start_idx
            _active_pool = mp.Pool(processes=n_workers)
            try:
                for idx, curve in _active_pool.imap_unordered(_worker_simulate, tasks):
                    curves[idx - my_start] = curve
                    completed += 1
                    elapsed = (time.time() - t_total) / 60
                    eta = elapsed / (completed - start_idx) * (my_count - completed) if completed > start_idx else 0
                    status = "✗" if np.isnan(curve).any() else "✓"
                    print(f"  [{completed}/{my_count}] idx={idx} {status}  "
                          f"elapsed={elapsed:.1f}min  ETA={eta:.1f}min")
                    # ---- 增量 checkpoint: 每 N 个样本写盘 ----
                    if completed % checkpoint_every == 0:
                        np.savez_compressed(ckpt_path,
                                            params_norm=norm, params_phys=phys,
                                            curves=curves, completed=completed)
                        import gc; gc.collect()
                        print(f"  ▸ checkpoint saved → {ckpt_path}")
            finally:
                _kill_pool()
            print(f"  总耗时: {(time.time() - t_total)/60:.1f} min")
            # 清理 checkpoint（全部完成后）
            if ckpt_path.exists():
                ckpt_path.unlink()

    # 如果分片：只输出本机负责的切片
    if n_parts > 1:
        out_norm = norm[my_start:my_end]
        out_phys = phys[my_start:my_end]
    else:
        out_norm, out_phys = norm, phys

    result = {
        "params_normalized": out_norm,
        "params_physical": out_phys,
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
        "description": f"21cmFAST LHS sampled dataset — 4 astro + k → {N_Z}-point Δ²₂₁(z, k)",
        "n_samples": int(len(dataset["params_normalized"])),
        "param_names": dataset["param_names"],
        "param_ranges": {k: [float(v[0]), float(v[1])] for k, v in dataset["param_ranges"].items()},
        "params_normalized": dataset["params_normalized"].tolist(),
        "params_physical": dataset["params_physical"].tolist(),
        "curves": dataset["curves"].tolist(),
        "curve_length": N_Z,
        "curve_type": f"Δ²₂₁(z) at user-specified k, z∈[{Z_MIN},{Z_MAX}]",
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
        description="LHS 采样 5 个参数 (4 astro + k)，生成 Δ²(z) 曲线数据集"
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
    parser.add_argument("--rank", type=int, default=0,
                        help="分片编号 (0 ~ n_parts-1, 用于多机并行)")
    parser.add_argument("--n-parts", type=int, default=1,
                        help="总分片数 (>1 时只跑 --rank 对应的切片)")

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
                               n_threads=args.n_threads,
                               rank=args.rank, n_parts=args.n_parts,
                               output_tag=args.output)

    rank_tag = f"_r{args.rank}of{args.n_parts}" if args.n_parts > 1 else ""
    base = f"{args.output}{rank_tag}"

    if args.format in ("npz", "both"):
        save_dataset(dataset, filename=f"{base}.npz")
    if args.format in ("json", "both"):
        save_dataset_json(dataset, filename=f"{base}.json")
