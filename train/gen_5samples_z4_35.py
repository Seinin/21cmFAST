#!/usr/bin/env python3
"""
生成 5 个 LHS 样本，z 范围 4→35，保存到 lhs_samples_z4_35.npz
"""
import os
import shutil
import tempfile
import gc
import time
import warnings
from pathlib import Path

import numpy as np
from scipy.stats.qmc import LatinHypercube
import py21cmfast as p21c

warnings.filterwarnings("ignore")

# ============================================================================
# 参数定义
# ============================================================================
PARAM_CONFIG = {
    "ALPHA_STAR":     (0.1, 1.0,   0.5),
    "HII_EFF_FACTOR": (5.0, 50.0,  30.0),
    "ION_Tvir_MIN":   (4.0, 5.5,   4.7),
    "L_X":            (38.0, 42.0, 40.5),
    "K_TARGET":       (0.05, 1.0,  0.2),
}
ASTRO_NAMES = ["ALPHA_STAR", "HII_EFF_FACTOR", "ION_Tvir_MIN", "L_X"]
PARAM_NAMES = list(PARAM_CONFIG.keys())
PARAM_LB = np.array([v[0] for v in PARAM_CONFIG.values()])
PARAM_UB = np.array([v[1] for v in PARAM_CONFIG.values()])

Z_MIN, Z_MAX, N_Z = 4.0, 35.0, 128

N_SAMPLES = 5
SEED = 42
HII_DIM = 64
BOX_LEN = 200.0

OUTPUT_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)
OUTPUT_FILE = OUTPUT_DIR / "lhs_samples_z4_35.npz"


def _compute_power_spectrum(brightness_temp, box_len, k_min, k_max):
    """计算 21cm 无量纲功率谱 Δ²₂₁(k)（壳层平均）。"""
    N = brightness_temp.shape[0]
    cell_size = box_len / N

    k = np.fft.fftfreq(N, d=cell_size) * 2 * np.pi
    k[N // 2] = 0
    kx, ky, kz = np.meshgrid(k, k, k, indexing="ij")
    k_mag = np.sqrt(kx**2 + ky**2 + kz**2)

    fft_bt = np.fft.fftn(brightness_temp)
    ps3d = np.abs(fft_bt) ** 2 / (N**6) * box_len**3

    k_fund = 2 * np.pi / box_len
    k_nyq = np.pi / cell_size
    k_min = max(k_min, k_fund * 1.05)
    k_max = min(k_max, k_nyq * 0.8)

    k_rounded = np.round(k_mag, 6)
    unique_k = np.unique(k_rounded[k_rounded > 0])
    shell_power = np.array([np.mean(ps3d[k_rounded == uk]) for uk in unique_k])

    mask = (unique_k >= k_min) & (unique_k <= k_max)
    shell_k = unique_k[mask]
    shell_p = shell_power[mask]

    delta_squared = (shell_k**3 / (2 * np.pi**2)) * shell_p
    return shell_k, delta_squared


def simulate_one(idx, phys):
    """对一组物理参数运行 21cmFAST，返回 (idx, curve)。"""
    astro = dict(zip(ASTRO_NAMES, map(float, phys[:4])))
    k_tgt = float(phys[4])

    k_min_sim = max(0.03, k_tgt * 0.5)
    k_max_sim = min(10.0, k_tgt * 2.0)
    redshifts = np.linspace(Z_MIN, Z_MAX, N_Z).tolist()

    user_params = p21c.UserParams(
        HII_DIM=HII_DIM,
        BOX_LEN=BOX_LEN,
        N_THREADS=1,
    )

    orig = os.getcwd()
    tmp = tempfile.mkdtemp(prefix="cmfast_")
    try:
        os.chdir(tmp)
        coevals = p21c.run_coeval(
            redshift=redshifts[0],  # deprecated but needed for compat
            user_params=user_params,
            astro_params=p21c.AstroParams(**astro),
            random_seed=42,
            regenerate=True,
            write=False,
        )
        print(f"  [sample #{idx}] k={k_tgt:.2f}  z={Z_MIN}→{Z_MAX} ...", flush=True)
    except Exception as e:
        print(f"  [sample #{idx}] 模拟失败: {e}", flush=True)
        return idx, np.full(N_Z, np.nan)
    finally:
        os.chdir(orig)
        shutil.rmtree(tmp, ignore_errors=True)
        gc.collect()

    # 但是 run_coeval 只接受单个 redshift... 需要逐个 z 调用
    return idx, np.full(N_Z, np.nan)


def simulate_one_multi_z(idx, phys):
    """在每个 z 点单独运行 run_coeval，收集 Δ²(z, k_target)。"""
    astro = dict(zip(ASTRO_NAMES, map(float, phys[:4])))
    k_tgt = float(phys[4])

    k_min_sim = max(0.03, k_tgt * 0.5)
    k_max_sim = min(10.0, k_tgt * 2.0)
    redshifts = np.linspace(Z_MIN, Z_MAX, N_Z)

    user_params = p21c.UserParams(
        HII_DIM=HII_DIM,
        BOX_LEN=BOX_LEN,
        N_THREADS=1,
    )
    astro_params = p21c.AstroParams(**astro)

    curve = np.zeros(N_Z)
    orig = os.getcwd()
    tmp = tempfile.mkdtemp(prefix="cmfast_")
    try:
        os.chdir(tmp)
        t0 = time.time()
        for i, z in enumerate(redshifts):
            coeval = p21c.run_coeval(
                redshift=float(z),
                user_params=user_params,
                astro_params=astro_params,
                random_seed=42,
                regenerate=True,
                write=False,
            )
            bt = coeval.brightness_temp
            ks, ds = _compute_power_spectrum(bt, BOX_LEN, k_min_sim, k_max_sim)
            valid = ds > 0
            if valid.sum() < 2:
                curve[i] = np.nan
            else:
                curve[i] = 10 ** np.interp(
                    np.log10(k_tgt),
                    np.log10(ks[valid]),
                    np.log10(ds[valid]),
                )
        elapsed = (time.time() - t0) / 60
        print(f"  [sample #{idx}] k={k_tgt:.2f}  z={Z_MIN}→{Z_MAX}  "
              f"OK ({elapsed:.1f} min)", flush=True)
    except Exception as e:
        print(f"  [sample #{idx}] 异常: {e}", flush=True)
        curve = np.full(N_Z, np.nan)
    finally:
        os.chdir(orig)
        shutil.rmtree(tmp, ignore_errors=True)
        gc.collect()

    return idx, curve


def main():
    print(f"\n{'='*60}")
    print(f"生成 {N_SAMPLES} 个 LHS 样本  z∈[{Z_MIN},{Z_MAX}]  {N_Z} bins")
    print(f"{'='*60}")
    for name in PARAM_NAMES:
        lb, ub, _ = PARAM_CONFIG[name]
        print(f"  {name:16s} ∈ [{lb:5.1f}, {ub:5.1f}]")
    print(f"{'='*60}\n")

    # LHS 采样
    sampler = LatinHypercube(d=len(PARAM_NAMES), seed=SEED)
    norm = sampler.random(n=N_SAMPLES)
    phys = PARAM_LB + (PARAM_UB - PARAM_LB) * norm

    print("LHS 采样物理值:")
    header = "  " + "  ".join(f"{n:>14s}" for n in PARAM_NAMES)
    print(header)
    for row in phys:
        print("  " + "  ".join(f"{v:14.6f}" for v in row))
    print()

    curves = np.zeros((N_SAMPLES, N_Z))
    for i in range(N_SAMPLES):
        idx, curve = simulate_one_multi_z(i, phys[i])
        curves[i] = curve

    nc = int(np.isnan(curves).sum())
    bad_samples = int(np.isnan(curves).any(axis=1).sum())
    print(f"\nNaN 统计: {nc} 个值, {bad_samples}/{N_SAMPLES} 个样本")

    np.savez(
        OUTPUT_FILE,
        params_normalized=norm,
        params_physical=phys,
        curves=curves,
        param_names=np.array(PARAM_NAMES, dtype=str),
    )
    print(f"\n✓ 已保存: {OUTPUT_FILE}")
    print(f"  形状: params={norm.shape}, curves={curves.shape}")


if __name__ == "__main__":
    main()
