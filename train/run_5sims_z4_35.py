#!/usr/bin/env python
"""
运行 5 个随机参数的 21cmFAST 模拟，红移范围 z=4~35，绘制 Δ²₂₁(z,k) 曲线。
使用与旧数据集一致的 FlagOptions (USE_TS_FLUCT=True, INHOMO_RECO=True)。
"""

import os
import sys
import tempfile
import shutil
import gc
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

import py21cmfast as p21c
import warnings
warnings.filterwarnings("ignore")

# 参数范围 (4 astro + k)
PARAM_CONFIG = {
    "ALPHA_STAR":     (0.1, 1.0),
    "HII_EFF_FACTOR": (5.0, 50.0),
    "ION_Tvir_MIN":   (4.0, 5.5),   # log10(K)
    "L_X":            (38.0, 42.0),  # log10(erg/s)
    "K_TARGET":       (0.05, 1.0),   # Mpc^-1
}

Z_MIN, Z_MAX, N_Z = 4.0, 35.0, 128
N_SAMPLES = 5
SEED = 2026


def random_params(n, seed=2026):
    rng = np.random.default_rng(seed)
    params = []
    for name in PARAM_CONFIG:
        lb, ub = PARAM_CONFIG[name]
        params.append(rng.uniform(lb, ub, size=n))
    return np.column_stack(params)


def compute_power_spectrum(brightness_temp, box_len, k_min=0.03, k_max=10.0):
    """计算 Δ²₂₁(k) 壳层功率谱。"""
    N = brightness_temp.shape[0]
    cell_size = box_len / N
    k = np.fft.fftfreq(N, d=cell_size) * 2 * np.pi
    k[N // 2] = 0
    kx, ky, kz = np.meshgrid(k, k, k, indexing="ij")
    k_mag = np.sqrt(kx**2 + ky**2 + kz**2)

    fft_bt = np.fft.fftn(brightness_temp)
    ps3d = np.abs(fft_bt)**2 / (N**6) * box_len**3

    k_fund = 2 * np.pi / box_len
    k_nyq = np.pi / cell_size
    k_min = max(k_min, k_fund * 1.05)
    k_max = min(k_max, k_nyq * 0.8)

    k_rounded = np.round(k_mag, 6)
    unique_k_vals = np.unique(k_rounded[k_rounded > 0])
    shell_power = np.array([np.mean(ps3d[k_rounded == uk]) for uk in unique_k_vals])

    shell_mask = (unique_k_vals >= k_min) & (unique_k_vals <= k_max)
    shell_k = unique_k_vals[shell_mask]
    shell_p = shell_power[shell_mask]

    delta_squared = (shell_k**3 / (2 * np.pi**2)) * shell_p
    return shell_k, delta_squared


def simulate_one(physical_params):
    """对一组物理参数运行 21cmFAST，返回 Δ²₂₁(z, k_target) 曲线。"""
    ALPHA_STAR = float(physical_params[0])
    HII_EFF_FACTOR = float(physical_params[1])
    ION_Tvir_MIN = float(physical_params[2])   # log10(K)
    L_X = float(physical_params[3])             # log10(erg/s)
    k_target = float(physical_params[4])

    redshifts = np.linspace(Z_MIN, Z_MAX, N_Z).tolist()

    user_params = p21c.UserParams(HII_DIM=64, BOX_LEN=200.0, USE_INTERPOLATION_TABLES=True)
    astro_params = p21c.AstroParams(
        ALPHA_STAR=ALPHA_STAR,
        HII_EFF_FACTOR=HII_EFF_FACTOR,
        ION_Tvir_MIN=ION_Tvir_MIN,
        L_X=L_X,
    )
    # 与旧数据 "simple" 模板一致的 FlagOptions
    flag_options = p21c.FlagOptions(USE_TS_FLUCT=True, INHOMO_RECO=True)

    coevals = p21c.run_coeval(
        redshift=redshifts,
        user_params=user_params,
        astro_params=astro_params,
        flag_options=flag_options,
        random_seed=42,
        write=False,
        regenerate=True,
    )

    k_min_ps = max(0.03, k_target * 0.5)
    k_max_ps = min(10.0, k_target * 2.0)

    delta_at_z = np.zeros(N_Z)
    for i, coeval in enumerate(coevals):
        bt = coeval.brightness_temp
        k_shell, ds_shell = compute_power_spectrum(bt, 200.0, k_min=k_min_ps, k_max=k_max_ps)
        valid = ds_shell > 0
        if valid.sum() < 2:
            delta_at_z[i] = np.nan
            continue
        log_ks = np.log10(k_shell[valid])
        log_ds = np.log10(ds_shell[valid])
        delta_at_z[i] = 10 ** np.interp(np.log10(k_target), log_ks, log_ds)

    return delta_at_z


def main():
    all_params = random_params(N_SAMPLES, seed=SEED)
    z = np.linspace(Z_MIN, Z_MAX, N_Z)
    curves = np.zeros((N_SAMPLES, N_Z))

    print(f"参数采样 (seed={SEED}):")
    for name in PARAM_CONFIG:
        print(f"  {name:16s} ∈ [{PARAM_CONFIG[name][0]:.2f}, {PARAM_CONFIG[name][1]:.2f}]")
    print(f"红移: z ∈ [{Z_MIN}, {Z_MAX}], {N_Z} bins")
    print(f"FlagOptions: USE_TS_FLUCT=True, INHOMO_RECO=True\n")

    orig_cwd = os.getcwd()
    for i in range(N_SAMPLES):
        phys = all_params[i]
        print(f"[{i+1}/{N_SAMPLES}] α*={phys[0]:.3f}  ζ={phys[1]:.1f}  "
              f"Tvir={phys[2]:.2f}  Lx={phys[3]:.1f}  k={phys[4]:.3f}")

        tmpdir = tempfile.mkdtemp(prefix=f"cmfast_sim{i}_")
        os.chdir(tmpdir)
        try:
            curve = simulate_one(phys)
        except Exception as e:
            print(f"  ✗ 异常: {e}")
            curve = np.full(N_Z, np.nan)
        finally:
            os.chdir(orig_cwd)
            shutil.rmtree(tmpdir, ignore_errors=True)
            gc.collect()

        curves[i] = curve
        has_nan = np.isnan(curve).any()
        if has_nan:
            print(f"  ✗ 含NaN")
        else:
            peak_idx = np.nanargmax(curve)
            print(f"  ✓ 完成  peak at z={z[peak_idx]:.1f}  "
                  f"max={np.nanmax(curve):.2f} mK²  min={np.nanmin(curve):.4f} mK²")

    # 画图
    fig, ax = plt.subplots(figsize=(12, 6))
    colors = plt.cm.tab10(np.linspace(0, 1, N_SAMPLES))

    for i in range(N_SAMPLES):
        phys = all_params[i]
        label = (f"#{i} α*={phys[0]:.2f} ζ={phys[1]:.0f} "
                 f"Tvir={phys[2]:.1f} Lx={phys[3]:.0f} k={phys[4]:.2f}")
        valid = ~np.isnan(curves[i])
        if valid.any():
            ax.semilogy(z[valid], curves[i][valid], color=colors[i], linewidth=1.8,
                        alpha=0.85, label=label)

    ax.set_xlabel('Redshift z', fontsize=13)
    ax.set_ylabel(r'$\Delta^2_{21}(k)$ [mK$^2$]', fontsize=13)
    ax.set_title(rf'21cmFAST $\Delta^2_{{21}}(z,k)$ — {N_SAMPLES} random samples, '
                 rf'$z \in [{Z_MIN:.0f}, {Z_MAX:.0f}]$', fontsize=14)
    ax.legend(fontsize=9, loc='best')
    ax.grid(True, alpha=0.3)
    ax.invert_xaxis()

    plt.tight_layout()
    out_path = Path(__file__).resolve().parent / "plots" / "5sims_z4_35.png"
    out_path.parent.mkdir(exist_ok=True)
    plt.savefig(out_path, dpi=150, bbox_inches='tight')
    print(f"\n✓ 图已保存: {out_path}")


if __name__ == "__main__":
    main()
