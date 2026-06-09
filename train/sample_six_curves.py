#!/usr/bin/env python
"""
sample_cosmo6.py — LHS 采样 6 参数 (5 cosmology + k) → 4 条曲线 + τ

4 条曲线 (每条 128 点, z∈[4,35]):
  1. power_spectrum          — Δ²₂₁(z, k)  功率谱
  2. spin_temperature        — T_s(z)       自旋温度
  3. global_21cm_signal      — δT_b(z)      全局21cm信号
  4. neutral_hydrogen_fraction — x_HI(z)    平均中性氢分数
  5. tau                     — τ_e          CMB汤姆逊散射光学深度 (标量)

6 个 LHS 采样参数:
  SIGMA_8, hlittle (H₀/100), OMm, OMb, POWER_INDEX (n_s), k_target

z 角色: run_coeval 的输出采样网格(out_redshifts), 固定 z∈[4,35]×128 点,
      每次模拟跑完整宇宙演化, 在所有 out_redshifts 处输出快照。

Usage:
    python train/sample_six_curves.py --n-samples 5000 --n-workers 10
    python train/sample_six_curves.py --mock --n-samples 10
"""

import argparse
import atexit
import json
import gc
import multiprocessing as mp
import os
import signal
import shutil
import sys
import tempfile
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import numpy as np
import yaml
from scipy.stats.qmc import LatinHypercube

# ── 路径 ──
SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
from _common import _compute_power_spectrum

import py21cmfast as p21c

OUTPUT_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)

# ═══════════════════════════════════════════════════════════════════════
# 进程清理 + 紧急 checkpoint
# ═══════════════════════════════════════════════════════════════════════
_active_pool = None
_emergency_ckpt_path = None
_emergency_curves = None
_emergency_completed = 0
_ckpt_write_lock = None

def _save_checkpoint_safe(path, completed, curves_all_dict):
    """原子写入 checkpoint — 先写临时文件再 rename，防止中途被杀损坏"""
    import threading, os
    global _ckpt_write_lock
    if _ckpt_write_lock is None:
        _ckpt_write_lock = threading.Lock()
    with _ckpt_write_lock:
        tmp = str(path) + ".tmp.npz"
        np.savez_compressed(tmp, completed=completed, **curves_all_dict)
        os.replace(tmp, path)

def _save_emergency_ckpt():
    """被信号/atexit 调用时，紧急保存"""
    global _emergency_ckpt_path, _emergency_curves, _emergency_completed
    if _emergency_ckpt_path is not None and _emergency_curves is not None:
        try:
            _save_checkpoint_safe(_emergency_ckpt_path, _emergency_completed, _emergency_curves)
            xhi = _emergency_curves.get("neutral_hydrogen_fraction")
            n_saved = int((~np.all(np.isclose(xhi, 0), axis=1)).sum()) if xhi is not None else 0
            t_now = time.strftime("%Y-%m-%d %H:%M:%S")
            print(f"\n  ⚠ 紧急checkpoint [{t_now}] saved → completed={_emergency_completed}, "
                  f"实际数据行数={n_saved}", flush=True)
        except Exception as e:
            print(f"\n  ⚠ 紧急checkpoint 失败: {e}", flush=True)

def _kill_pool():
    global _active_pool
    if _active_pool is not None:
        _active_pool.terminate()
        _active_pool.join()
        _active_pool = None

def _on_kill_signal(signum, frame):
    _save_emergency_ckpt()
    _kill_pool()
    os._exit(1)

signal.signal(signal.SIGINT, _on_kill_signal)
signal.signal(signal.SIGTERM, _on_kill_signal)
atexit.register(_save_emergency_ckpt)
atexit.register(_kill_pool)

# ═══════════════════════════════════════════════════════════════════════
# 参数定义 — 5 宇宙学 + k_target = 6 个 LHS 采样参数
# ═══════════════════════════════════════════════════════════════════════
#
# z 不是 LHS 参数，而是固定的输出采样网格 (out_redshifts)。
# run_coeval 内部从 z=35 演化到 z=4, 在 out_redshifts 的 128 个 z 处返回快照。
#
PARAM_CONFIG = {
    "SIGMA_8":       (0.75, 0.86,   "功率谱归一化 σ₈"),
    "hlittle":       (0.64, 0.72,   "H₀/100 哈勃参数 h"),
    "OMm":           (0.25, 0.36,   "Ωm 总物质密度"),
    "OMb":           (0.044, 0.054, "Ωb 重子密度"),
    "POWER_INDEX":   (0.95, 0.99,   "n_s 原初功率谱指数"),
    "k_target":      (0.1, 5.0,     "功率谱 k 目标值 Mpc⁻¹"),
}

PARAM_NAMES = list(PARAM_CONFIG.keys())
PARAM_LB = np.array([v[0] for v in PARAM_CONFIG.values()])
PARAM_UB = np.array([v[1] for v in PARAM_CONFIG.values()])

# 红移 — 固定的输出采样网格，不是 LHS 参数
Z_MIN, Z_MAX, N_Z = 4.0, 35.0, 128

# 天体物理参数 — 全部使用默认值（模板 "simple" 的默认值）
DEFAULT_ASTRO = {
    "ALPHA_STAR": 0.5,
    "HII_EFF_FACTOR": 30.0,
    "ION_Tvir_MIN": 4.7,
    "L_X": 40.0,
    "F_STAR10": -1.35,
}

# 模拟配置 — 不随采样变化
SIM_CONFIG = {
    "HII_DIM": 64,
    "BOX_LEN": 200.0,
    "USE_TS_FLUCT": True,
    "INHOMO_RECO": True,
    "N_THREADS": 1,
    "random_seed": 42,  # 固定的随机种子 → 相同的初始条件 → 纯参数效应
}

# ═══════════════════════════════════════════════════════════════════════
# LHS 采样
# ═══════════════════════════════════════════════════════════════════════

def sample_lhs(n_samples: int, seed: int = 42) -> np.ndarray:
    sampler = LatinHypercube(d=len(PARAM_NAMES), seed=seed)
    return sampler.random(n=n_samples)

def denormalize(normalized: np.ndarray) -> np.ndarray:
    return PARAM_LB + (PARAM_UB - PARAM_LB) * normalized


# ═══════════════════════════════════════════════════════════════════════
# 单次模拟 — 返回 4 条曲线 + tau 标量
# ═══════════════════════════════════════════════════════════════════════
#
# 每次模拟调用一次 run_coeval, out_redshifts 固定为 z=35→4 的 128 点。
# run_coeval 内部从 z=35 演化到 z=4, 在每个 out_redshifts 处返回 Coeval 快照。
# z 不是输入参数, 是输出采样点。
#

def simulate_one(physical_params: np.ndarray) -> dict:
    """对一组物理参数运行 21cmFAST。

    前5个是宇宙学参数 (SIGMA_8, hlittle, OMm, OMb, POWER_INDEX)，
    第6个是 k_target。

    Returns
    -------
    dict with keys:
      power_spectrum:          (128,)  Δ²₂₁(z, k_target)
      spin_temperature:        (128,)  global T_s
      global_21cm_signal:      (128,)  global δT_b
      neutral_hydrogen_fraction: (128,) global x_HI
      tau:                     float   τ_e (scalar)
    """
    cosmo_params = physical_params[:5]
    k_target = float(physical_params[5])

    cosmo_kwargs = dict(zip(PARAM_NAMES[:5], map(float, cosmo_params)))

    # z 降序: 35→4 (run_coeval 和 C 代码内部需要降序)
    redshifts_desc = np.linspace(Z_MAX, Z_MIN, N_Z).tolist()

    # 宇宙学参数可变, 天体物理参数固定
    inputs = p21c.InputParameters.from_template(
        "simple",
        BOX_LEN=SIM_CONFIG["BOX_LEN"],
        HII_DIM=SIM_CONFIG["HII_DIM"],
        USE_TS_FLUCT=SIM_CONFIG["USE_TS_FLUCT"],
        INHOMO_RECO=SIM_CONFIG["INHOMO_RECO"],
        N_THREADS=SIM_CONFIG["N_THREADS"],
        random_seed=SIM_CONFIG["random_seed"],
        **cosmo_kwargs,
        **DEFAULT_ASTRO,
    )

    # 一次 run_coeval → 128 个 Coeval 快照 (每个 z 一个)
    coevals = p21c.run_coeval(
        inputs=inputs,
        out_redshifts=redshifts_desc,
        regenerate=True,
        write=False,
    )

    ps_curve  = np.zeros(N_Z, dtype=np.float32)
    ts_curve  = np.zeros(N_Z, dtype=np.float32)
    tb_curve  = np.zeros(N_Z, dtype=np.float32)
    xhi_curve = np.zeros(N_Z, dtype=np.float32)

    for i, coeval in enumerate(coevals):
        bt = coeval.brightness_temp

        # 1. 功率谱 Δ²(k_target)
        k_shell, delta_sq = _compute_power_spectrum(
            bt, SIM_CONFIG["BOX_LEN"],
            n_bins=256, k_min=0.05, k_max=5.0,
        )
        valid = delta_sq > 0
        if valid.sum() >= 2:
            ps_curve[i] = 10.0 ** np.interp(
                np.log10(k_target),
                np.log10(k_shell[valid]),
                np.log10(delta_sq[valid]),
            )
        else:
            ps_curve[i] = 0.0

        # 2. 自旋温度 T_s
        ts_box = coeval.ts_box
        if ts_box is not None:
            ts_curve[i] = float(ts_box.global_Ts)
        else:
            ts_curve[i] = 0.0

        # 3. 全局 21cm 信号 δT_b
        bt_struct = coeval.brightness_temperature
        tb_curve[i] = float(bt_struct.global_Tb)

        # 4. 中性氢分数 x_HI
        ion = coeval.ionized_box
        xhi_curve[i] = float(ion.global_xH)

    # tau — 汤姆逊散射光学深度
    tau_val = 0.0
    try:
        tau_val = float(p21c.compute_tau(
            redshifts=list(reversed(redshifts_desc)),
            global_xHI=xhi_curve[::-1].tolist(),
            inputs=inputs,
        ))
    except Exception:
        tau_val = 0.0

    # 翻转所有曲线: coeval 降序 → 数据集升序 (z=4→35)
    return {
        "power_spectrum": ps_curve[::-1],
        "spin_temperature": ts_curve[::-1],
        "global_21cm_signal": tb_curve[::-1],
        "neutral_hydrogen_fraction": xhi_curve[::-1],
        "tau": tau_val,
    }


# ═══════════════════════════════════════════════════════════════════════
# Mock (快速测试)
# ═══════════════════════════════════════════════════════════════════════

def mock_one() -> dict:
    z = np.linspace(Z_MIN, Z_MAX, N_Z)
    rng = np.random.default_rng()
    peak_z = 8.0 + rng.uniform(3, 8)
    width = 4.0 + rng.uniform(2, 6)
    amp = 1.0 + rng.uniform(0, 30)
    ps = amp * np.exp(-0.5 * ((z - peak_z) / width) ** 2)
    ps += rng.uniform(0, 0.3, N_Z)
    ts = 100.0 * np.exp(-0.15 * (z - Z_MIN)) + 2.0
    tb = -150.0 * np.exp(-0.5 * ((z - (peak_z + 2)) / (width * 0.7)) ** 2)
    reion_z = 5.5 + rng.uniform(1, 3)
    width_xhi = 1.0 + rng.uniform(0.5, 2)
    xhi = 1.0 / (1.0 + np.exp(-(z - reion_z) / width_xhi))
    tau = 0.04 + rng.uniform(0.01, 0.08)
    return {
        "power_spectrum": ps.astype(np.float32),
        "spin_temperature": ts.astype(np.float32),
        "global_21cm_signal": tb.astype(np.float32),
        "neutral_hydrogen_fraction": xhi.astype(np.float32),
        "tau": float(tau),
    }


# ═══════════════════════════════════════════════════════════════════════
# Worker
# ═══════════════════════════════════════════════════════════════════════

CURVE_KEYS = [
    "power_spectrum",
    "spin_temperature",
    "global_21cm_signal",
    "neutral_hydrogen_fraction",
]

def _worker_simulate(args: tuple) -> tuple:
    idx, phys = args
    orig_cwd = os.getcwd()
    tmpdir = tempfile.mkdtemp(prefix="cmfast7_worker_")
    os.chdir(tmpdir)
    try:
        print(f"  [worker #{idx}] 开始模拟 ...", flush=True)
        curves = simulate_one(phys)
        status = "✓"
    except Exception as e:
        import traceback
        print(f"  [worker #{idx}] 异常: {e}", flush=True)
        traceback.print_exc()
        curves = {
            "power_spectrum": np.full(N_Z, np.nan),
            "spin_temperature": np.full(N_Z, np.nan),
            "global_21cm_signal": np.full(N_Z, np.nan),
            "neutral_hydrogen_fraction": np.full(N_Z, np.nan),
            "tau": np.nan,
        }
        status = "✗"
    finally:
        os.chdir(orig_cwd)
        shutil.rmtree(tmpdir, ignore_errors=True)
        gc.collect()

    return (idx, curves, status)


# ═══════════════════════════════════════════════════════════════════════
# 批生成
# ═══════════════════════════════════════════════════════════════════════

def generate_dataset(n_samples: int = 5000, seed: int = 42,
                     use_mock: bool = False, n_workers: int = 1,
                     checkpoint_every: int = 10,
                     output_tag: str = "dataset_cosmo6") -> dict:
    global _active_pool, _emergency_ckpt_path, _emergency_curves, _emergency_completed

    print(f"\n{'='*60}")
    print(f"LHS 采样 — {n_samples} samples ({len(PARAM_NAMES)} params: 5 cosmology + k)")
    print(f"  4 curves × {N_Z} z-points + tau scalar, z∈[{Z_MIN}, {Z_MAX}]")
    print(f"  z 角色: run_coeval 输出快照网格 (每次模拟 1 次调用 → 128 快照)")
    print(f"{'='*60}")
    print(f"宇宙学参数 (LHS 采样): {', '.join(PARAM_NAMES[:5])}")
    for name in PARAM_NAMES[:5]:
        lb, ub, desc = PARAM_CONFIG[name]
        print(f"  {name:16s} ∈ [{lb:.4f}, {ub:.4f}]   {desc}")
    print(f"功率谱参数 (LHS 采样):")
    lb, ub, desc = PARAM_CONFIG["k_target"]
    print(f"  {'k_target':16s} ∈ [{lb:.2f}, {ub:.2f}]   {desc}")
    print(f"天体物理参数 (固定):")
    for name, val in DEFAULT_ASTRO.items():
        print(f"  {name:16s} = {val}")
    print(f"红移 (固定网格): z={Z_MIN}→{Z_MAX}  {N_Z} bins")
    print(f"随机种子 (固定): {SIM_CONFIG['random_seed']}")
    print(f"{'='*60}\n")

    ckpt_path = OUTPUT_DIR / f"_ckpt_{output_tag}.npz"

    # ── LHS 采样 ──
    print("▶ LHS 采样...")
    norm = sample_lhs(n_samples, seed=seed)
    phys = denormalize(norm)

    # ── 初始化存储 ──
    curves_all = {
        "power_spectrum": np.zeros((n_samples, N_Z), dtype=np.float32),
        "spin_temperature": np.zeros((n_samples, N_Z), dtype=np.float32),
        "global_21cm_signal": np.zeros((n_samples, N_Z), dtype=np.float32),
        "neutral_hydrogen_fraction": np.zeros((n_samples, N_Z), dtype=np.float32),
        "tau": np.zeros(n_samples, dtype=np.float32),
    }

    # ── 断点续跑 ──
    start_idx = 0
    if ckpt_path.exists():
        ckpt = np.load(ckpt_path, allow_pickle=True)
        xhi_ckpt = ckpt["neutral_hydrogen_fraction"]
        has_data = ~np.all(np.isclose(xhi_ckpt, 0), axis=1)
        start_idx = int(has_data.sum())
        for key in curves_all:
            if key in ckpt:
                curves_all[key] = ckpt[key]
        print(f"▶ 从 checkpoint 续跑: 已完成 {start_idx}/{n_samples} "
              f"(checkpoint标记={ckpt.get('completed', 'N/A')})")

    if use_mock:
        print(f"▶ 生成 mock ...")
        for i in range(start_idx, n_samples):
            c = mock_one()
            for k in curves_all:
                curves_all[k][i] = c[k]
            if (i + 1) % max(1, n_samples // 10) == 0:
                print(f"  {i+1}/{n_samples}")
    else:
        if n_workers <= 1:
            print(f"▶ 运行 21cmFAST 模拟 (单进程) ...")
            t_total = time.time()
            for i in range(start_idx, n_samples):
                print(f"  [{i+1}/{n_samples}] 开始 ...", flush=True)
                t0 = time.time()
                try:
                    c = simulate_one(phys[i])
                    status = "✓"
                except Exception:
                    import traceback
                    traceback.print_exc()
                    c = {k: np.full(N_Z, np.nan) if k != "tau" else np.nan for k in curves_all}
                    status = "✗"
                for k in curves_all:
                    curves_all[k][i] = c[k]
                elapsed = time.time() - t0
                eta = elapsed * (n_samples - i - 1) / 60
                print(f"  [{i+1}/{n_samples}] {status}  {elapsed:.0f}s  ETA={eta:.0f}min", flush=True)
                if (i + 1) % checkpoint_every == 0:
                    t_now = time.strftime("%Y-%m-%d %H:%M:%S")
                    _save_checkpoint_safe(ckpt_path, i + 1, curves_all)
                    print(f"  ▸ checkpoint [{t_now}] saved → completed={i+1}/{n_samples}", flush=True)
            print(f"  总耗时: {(time.time() - t_total)/60:.1f} min")
        else:
            print(f"▶ 运行 21cmFAST 模拟 ({n_workers} 进程并行) ...")
            t_total = time.time()
            tasks = [(i, phys[i]) for i in range(start_idx, n_samples)]
            _active_pool = mp.Pool(processes=n_workers)
            completed = start_idx

            _emergency_ckpt_path = ckpt_path
            _emergency_curves = curves_all

            saved_indices = set()
            try:
                for idx, curves, status in _active_pool.imap_unordered(
                    _worker_simulate, tasks
                ):
                    for k in curves_all:
                        curves_all[k][idx] = curves[k]
                    saved_indices.add(idx)
                    completed += 1
                    _emergency_completed = completed

                    elapsed = (time.time() - t_total) / 60
                    eta = elapsed / (completed - start_idx) * (n_samples - completed) if completed > start_idx else 0
                    print(f"  [{completed}/{n_samples}] idx={idx} {status}  "
                          f"elapsed={elapsed:.1f}min  ETA={eta:.1f}min", flush=True)

                    if completed % checkpoint_every == 0:
                        t_now = time.strftime("%Y-%m-%d %H:%M:%S")
                        _save_checkpoint_safe(ckpt_path, completed, curves_all)
                        gc.collect()
                        saved_sorted = sorted(saved_indices)
                        idx_range = f"{saved_sorted[0]}~{saved_sorted[-1]}" if saved_sorted else "none"
                        print(f"  ▸ checkpoint [{t_now}] saved → completed={completed}/{n_samples}"
                              f"  (saved: {idx_range}, {len(saved_indices)} unique)", flush=True)
            finally:
                _emergency_ckpt_path = None
                _emergency_curves = None
                _kill_pool()
            print(f"  总耗时: {(time.time() - t_total)/60:.1f} min")

    # 清理 checkpoint
    if ckpt_path.exists():
        ckpt_path.unlink()

    # ── 组装结果 ──
    result = {
        "params_normalized": norm.astype(np.float32),
        "params_physical": phys.astype(np.float32),
        "param_names": PARAM_NAMES,
        "param_ranges": {name: (lb, ub) for name, (lb, ub, *_rest) in PARAM_CONFIG.items()},
        "z_values": np.linspace(Z_MIN, Z_MAX, N_Z).astype(np.float32),
        "curves": curves_all,
        "n_samples": n_samples,
        "curve_length": N_Z,
        "z_range": [Z_MIN, Z_MAX],
    }
    return result


# ═══════════════════════════════════════════════════════════════════════
# 保存
# ═══════════════════════════════════════════════════════════════════════

def save_dataset_npz(dataset: dict, filename: str):
    path = OUTPUT_DIR / filename
    np.savez_compressed(
        path,
        params_normalized=dataset["params_normalized"],
        params_physical=dataset["params_physical"],
        param_names=np.array(dataset["param_names"], dtype=str),
        z_values=dataset["z_values"],
        power_spectrum=dataset["curves"]["power_spectrum"],
        spin_temperature=dataset["curves"]["spin_temperature"],
        global_21cm_signal=dataset["curves"]["global_21cm_signal"],
        neutral_hydrogen_fraction=dataset["curves"]["neutral_hydrogen_fraction"],
        tau=dataset["curves"]["tau"],
    )
    print(f"NPZ 数据集已保存: {path}")

    yaml_path = path.with_suffix(".yaml")
    with open(yaml_path, "w") as f:
        yaml.dump({
            "param_ranges": dataset["param_ranges"],
            "z_range": dataset["z_range"],
        }, f, default_flow_style=False)


def save_dataset_json(dataset: dict, filename: str):
    path = OUTPUT_DIR / filename
    out = {
        "description": f"21cmFAST LHS sampled — 5 cosmology + k → 4 curves × {N_Z} z-points + tau, z∈[{Z_MIN},{Z_MAX}]",
        "n_samples": dataset["n_samples"],
        "param_names": dataset["param_names"],
        "param_ranges": {k: [float(v[0]), float(v[1])] for k, v in dataset["param_ranges"].items()},
        "params_normalized": dataset["params_normalized"].tolist(),
        "params_physical": dataset["params_physical"].tolist(),
        "z_values": dataset["z_values"].tolist(),
        "curves": {k: dataset["curves"][k].tolist() for k in CURVE_KEYS},
        "tau": dataset["curves"]["tau"].tolist(),
        "curve_length": N_Z,
        "z_range": [Z_MIN, Z_MAX],
    }
    with open(path, "w") as f:
        json.dump(out, f)
    file_size_mb = path.stat().st_size / (1024 * 1024)
    print(f"JSON 数据集已保存: {path}  ({file_size_mb:.1f} MB)")


# ═══════════════════════════════════════════════════════════════════════
# 命令行
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="LHS 采样 6 参数 (5 宇宙学 + k) → 4 曲线 + tau (z 固定网格 4→35 ×128)"
    )
    parser.add_argument("--n-samples", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--mock", action="store_true", help="使用 mock 曲线快速测试")
    parser.add_argument("--output", type=str, default="dataset_cosmo6")
    parser.add_argument("--format", choices=["npz", "json", "both"], default="both")
    parser.add_argument("--n-workers", type=int, default=1)
    parser.add_argument("--checkpoint-every", type=int, default=10)
    args = parser.parse_args()

    dataset = generate_dataset(
        n_samples=args.n_samples,
        seed=args.seed,
        use_mock=args.mock,
        n_workers=args.n_workers,
        checkpoint_every=args.checkpoint_every,
        output_tag=args.output,
    )

    if args.format in ("npz", "both"):
        save_dataset_npz(dataset, f"{args.output}.npz")
    if args.format in ("json", "both"):
        save_dataset_json(dataset, f"{args.output}.json")

    # ── 统计 ──
    print(f"\n{'='*60}")
    print(f"数据集统计 (5 cosmology + k → 4 curves + tau)")
    print(f"{'='*60}")
    for name in CURVE_KEYS:
        arr = dataset["curves"][name]
        nan_count = int(np.isnan(arr).sum())
        finite = arr[np.isfinite(arr)]
        print(f"  {name:30s}  shape={arr.shape}  "
              f"range=[{finite.min():.4e}, {finite.max():.4e}]  NaN={nan_count}")
    tau_arr = dataset["curves"]["tau"]
    tau_finite = tau_arr[np.isfinite(tau_arr)]
    print(f"  {'tau':30s}  shape={tau_arr.shape}  "
          f"range=[{tau_finite.min():.6f}, {tau_finite.max():.6f}]  "
          f"NaN={int(np.isnan(tau_arr).sum())}")
