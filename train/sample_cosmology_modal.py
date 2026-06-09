#!/usr/bin/env python3
"""
sample_cosmology_modal.py — Modal 云端分布式 21cmFAST LHS 采样

自动在云端创建数百个容器并行运行 21cmFAST，无需管理服务器。
直接用 py21cmfast PyPI 包，不需要挂载源码。

Usage:
    modal run train/sample_cosmology_modal.py --dry-run
    modal run train/sample_cosmology_modal.py --n-samples 2000
"""

import json
import time
from pathlib import Path

import numpy as np
from scipy.stats.qmc import LatinHypercube

# ---------------------------------------------------------------------------
# 参数定义
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)

IGNORE = [".git", "__pycache__", ".venv", "train/data",
          "node_modules", "*.pyc", ".mypy_cache", ".pytest_cache",
          "docs", "joss-paper", "testplots"]

PARAM_CONFIG = {
    "ALPHA_STAR":     (0.1, 1.0,   0.5,  "恒星形成幂律指数"),
    "HII_EFF_FACTOR": (5.0, 50.0,  30.0, "电离效率因子"),
    "ION_Tvir_MIN":   (4.0, 5.5,   4.7,  "最小晕阈值 log10(K)"),
    "L_X":            (38.0, 42.0, 40.5, "X射线光度 log10(erg/s)"),
    "K_TARGET":       (0.05, 1.0,  0.2,  "wavenumber k [Mpc⁻¹]"),
}
ASTRO_PARAM_NAMES = ["ALPHA_STAR", "HII_EFF_FACTOR", "ION_Tvir_MIN", "L_X"]
PARAM_NAMES = list(PARAM_CONFIG.keys())
PARAM_LB = np.array([v[0] for v in PARAM_CONFIG.values()])
PARAM_UB = np.array([v[1] for v in PARAM_CONFIG.values()])
Z_MIN, Z_MAX, N_Z = 6.0, 25.0, 128


def denormalize(normalized):
    return PARAM_LB + (PARAM_UB - PARAM_LB) * normalized


# ============================================================================
# Modal 部分
# ============================================================================

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("gcc", "g++", "make",
                 "libgsl-dev", "libfftw3-dev", "libfftw3-mpi-dev",
                 "libhdf5-dev", "libopenmpi-dev")
    .pip_install(
        "numpy>=2.0", "scipy", "h5py>=2.8.0", "cffi>=1.0",
        "pyyaml", "matplotlib", "astropy>=2.0", "click",
        "bidict", "cosmotile>=0.2.5", "attrs", "tqdm", "tomlkit",
        "setuptools", "setuptools_scm", "cython",
    )
    .add_local_dir(str(PROJECT_ROOT), remote_path="/21cmfast",
                   copy=True, ignore=IGNORE)
    .run_commands(
        "cd /21cmfast && SETUPTOOLS_SCM_PRETEND_VERSION_FOR_21CMFAST=0.1.0 pip install --no-build-isolation -e .",
    )
    .env({"OMP_NUM_THREADS": "1"})
)

app = modal.App("cmfast-sampling", image=image)


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


@app.function(cpu=1, memory=8192, timeout=3600, retries=2, allow_concurrent_inputs=10)
def simulate_one(idx, p0, p1, p2, p3, p4):
    """云端运行一次 21cmFAST 模拟，返回 k=K_TARGET 处的 Δ²₂₁(z)。"""
    import gc, os, shutil, tempfile, traceback, warnings
    import numpy as np
    import py21cmfast as p21c

    warnings.filterwarnings("ignore")

    astro = dict(zip(ASTRO_PARAM_NAMES, map(float, [p0, p1, p2, p3])))
    k_tgt = float(p4)

    HII_DIM = 64
    BOX_LEN = 200.0
    k_min_sim = max(0.03, k_tgt * 0.5)
    k_max_sim = min(10.0, k_tgt * 2.0)
    redshifts = np.linspace(6.0, 25.0, 128).tolist()

    inputs = p21c.InputParameters.from_template(
        "simple",
        random_seed=42,
        HII_DIM=HII_DIM,
        BOX_LEN=BOX_LEN,
        N_THREADS=1,
        **astro,
    )

    orig = os.getcwd()
    tmp = tempfile.mkdtemp(prefix="mc_")
    try:
        os.chdir(tmp)
        coevals = p21c.run_coeval(
            inputs=inputs,
            out_redshifts=redshifts,
            regenerate=True,
            write=True,
        )

        dz = np.zeros(128)
        for i, coeval in enumerate(coevals):
            bt = coeval.brightness_temp
            ks, ds = _compute_power_spectrum(bt, BOX_LEN, k_min_sim, k_max_sim)
            v = ds > 0
            if v.sum() < 2:
                dz[i] = np.nan
                continue
            dz[i] = 10 ** np.interp(np.log10(k_tgt),
                                     np.log10(ks[v]), np.log10(ds[v]))
        return {"idx": idx, "curve": dz.tolist(), "error": None}
    except Exception as e:
        return {"idx": idx, "curve": None, "error": traceback.format_exc()[:500]}
    finally:
        os.chdir(orig)
        shutil.rmtree(tmp, ignore_errors=True)
        gc.collect()


@app.local_entrypoint()
def cli(n_samples: int = 100, seed: int = 42, output: str = "modal_samples",
        dry_run: bool = False, checkpoint_every: int = 50):
    """Modal 入口 — 由 `modal run` 调用。"""

    if dry_run:
        print("▶ 干跑测试 — 提交 1 个任务到云端...")
        r = simulate_one.remote(0, 0.5, 30.0, 4.7, 40.5, 0.2)
        if r["error"]:
            print(f"  失败: {r['error']}")
        else:
            print(f"  成功! 曲线长={len(r['curve'])}, 前5={r['curve'][:5]}")
        return

    print(f"\n{'='*60}")
    print(f"Modal 云端 LHS 采样 — {n_samples} 样本")
    print(f"参数: {', '.join(PARAM_NAMES)}")
    print(f"{'='*60}\n")

    print("▶ 本地 LHS 采样...")
    sampler = LatinHypercube(d=len(PARAM_NAMES), seed=seed)
    norm = sampler.random(n=n_samples)
    phys = denormalize(norm)

    ckpt_path = OUTPUT_DIR / f"_ckpt_modal_{output}.npz"
    if ckpt_path.exists():
        ckpt = np.load(ckpt_path, allow_pickle=True)
        start_idx = int(ckpt["completed"])
        curves = ckpt["curves"]
        print(f"▶ 续跑: 已完成 {start_idx}/{n_samples}")
    else:
        start_idx = 0
        curves = np.full((n_samples, N_Z), np.nan)

    n_tasks = n_samples - start_idx
    print(f"▶ 提交 {n_tasks} 个任务到云端 (自动并行)...")
    t0 = time.time()

    tasks = [(i, float(phys[i][0]), float(phys[i][1]), float(phys[i][2]),
              float(phys[i][3]), float(phys[i][4]))
             for i in range(start_idx, n_samples)]

    errors = 0
    completed = start_idx
    report_int = max(1, n_samples // 10)

    for result in simulate_one.starmap(tasks, return_exceptions=False):
        idx = result["idx"]
        if result["error"]:
            errors += 1
            if errors <= 10:
                print(f"  ✗ idx={idx}: {result['error'][:120]}")
        else:
            curves[idx] = np.array(result["curve"])
        completed += 1

        if completed % report_int == 0 or completed <= 5:
            e = (time.time() - t0) / 60
            rate = (completed - start_idx) / max(e, 0.01)
            eta = (n_samples - completed) / max(rate, 0.01)
            print(f"  [{completed}/{n_samples}] {e:.1f}min  "
                  f"{rate:.1f}/min  ETA={eta:.1f}min  err={errors}", flush=True)

        if completed % checkpoint_every == 0:
            np.savez_compressed(ckpt_path, params_norm=norm, params_phys=phys,
                                curves=curves, completed=completed)
            print("  ▸ checkpoint saved", flush=True)

    e = (time.time() - t0) / 60
    print(f"\n✓ {e:.1f}min  ok={n_samples-errors} err={errors}")

    if ckpt_path.exists():
        ckpt_path.unlink()

    nc = int(np.isnan(curves).sum())
    print(f"NaN: {nc} 值, {int(np.isnan(curves).any(axis=1).sum())}/{n_samples} 样本")

    np.savez(OUTPUT_DIR / f"{output}.npz",
             params_normalized=norm, params_physical=phys, curves=curves,
             param_names=np.array(PARAM_NAMES, dtype=str))
    print(f"✓ {OUTPUT_DIR / f'{output}.npz'}")

    d = {"n_samples": n_samples, "param_names": PARAM_NAMES,
         "param_ranges": {k: [float(v[0]), float(v[1])] for k, v in PARAM_CONFIG.items()},
         "params_normalized": norm.tolist(), "params_physical": phys.tolist(),
         "curves": curves.tolist(), "curve_length": N_Z}
    p = OUTPUT_DIR / f"{output}.json"
    with open(p, "w") as f:
        json.dump(d, f)
    print(f"✓ {p} ({p.stat().st_size/1e6:.1f}MB)")


if __name__ == "__main__":
    print("""
    请用 modal run 启动:
        modal run train/sample_cosmology_modal.py --dry-run
        modal run train/sample_cosmology_modal.py --n-samples 2000
    """)
