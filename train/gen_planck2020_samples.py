#!/usr/bin/env python
"""
串行生成 2 组 BOX_LEN=250 cMpc, HII_DIM=128 的样本，
使用 Planck 2020 宇宙学。每跑完一个立刻画图，不白等。
"""
import os, sys, gc, shutil, tempfile, time
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, SCRIPTS_DIR)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

BOX_LEN = 250.0
HII_DIM = 128
Z_MIN, Z_MAX, N_Z = 5.0, 25.0, 20
K_TARGET = 0.1

SAMPLES = [
    {"ALPHA_STAR": 0.5,  "HII_EFF_FACTOR": 30.0, "ION_Tvir_MIN": 4.7,  "L_X": 40.5},
    {"ALPHA_STAR": 0.3,  "HII_EFF_FACTOR": 20.0, "ION_Tvir_MIN": 4.5,  "L_X": 39.5},
]


def run_one(i, astro):
    """串行跑一个样本，在独立临时目录里运行，防止缓存污染。"""
    import py21cmfast as p21c
    from _common import _compute_power_spectrum

    orig = os.getcwd()
    tmp = tempfile.mkdtemp(prefix="p20_")
    os.chdir(tmp)
    try:
        inputs = p21c.InputParameters.from_template(
            ["planck2020", "simple"], random_seed=i * 42,
            BOX_LEN=BOX_LEN, HII_DIM=HII_DIM, **astro,
        )
        c = inputs.cosmo_params
        print(f"  cosmo: h={c.hlittle}, Om={c.OMm}, Ob={c.OMb}, "
              f"σ8={c.SIGMA_8}, ns={c.POWER_INDEX}", flush=True)

        redshifts = np.linspace(Z_MIN, Z_MAX, N_Z).tolist()
        coevals = p21c.run_coeval(
            inputs=inputs, out_redshifts=redshifts,
            regenerate=True, write=False,
        )

        zs, dz, dk = [], [], []
        for cv in coevals:
            k_sh, ds = _compute_power_spectrum(
                cv.brightness_temp, BOX_LEN, n_bins=256,
                k_min=0.05, k_max=5.0,
            )
            v = ds > 0
            if v.sum() >= 2:
                val = 10 ** np.interp(np.log10(K_TARGET),
                                      np.log10(k_sh[v]), np.log10(ds[v]))
            else:
                val = 0.0
            zs.append(cv.redshift)
            dz.append(val)
            dk.append(ds)

        pk = int(np.argmax(dz))
        print(f"  done — peak {max(dz):.2f} at z≈{zs[pk]:.1f}", flush=True)

        return {
            "z": np.array(zs), "delta2": np.array(dz),
            "k": k_sh, "delta_k": np.array(dk), "astro": astro,
        }
    finally:
        os.chdir(orig)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    print("=" * 60)
    print("Planck 2020 ΛCDM — BOX_LEN=250 Mpc, HII_DIM=128, 串行 2 样本")
    print("=" * 60)

    all_results = []
    for i, astro in enumerate(SAMPLES):
        t0 = time.time()
        print(f"\n--- Sample {i}: α*={astro['ALPHA_STAR']}, ζ={astro['HII_EFF_FACTOR']}, "
              f"Tvir={astro['ION_Tvir_MIN']}, LX={astro['L_X']} ---")
        r = run_one(i, astro)
        all_results.append(r)
        gc.collect()
        print(f"  elapsed: {time.time() - t0:.0f}s")

        # 每跑完一个立刻画当前进度图
        colors = plt.cm.viridis(np.linspace(0, 0.9, max(2, len(all_results))))
        fig, axes = plt.subplots(1, 2, figsize=(14, 5.5))

        ax = axes[0]
        for j, rr in enumerate(all_results):
            a = rr["astro"]
            label = (f"α*={a['ALPHA_STAR']}, ζ={a['HII_EFF_FACTOR']}, "
                     f"Tvir={a['ION_Tvir_MIN']}, LX={a['L_X']}")
            ax.semilogy(rr["z"], rr["delta2"], '-o', markersize=3, linewidth=1.3,
                        color=colors[j], label=label)
        ax.set_xlabel("Redshift z")
        ax.set_ylabel(f"Δ²₂₁(k≈{K_TARGET})")
        ax.set_title(f"Planck 2020 ΛCDM, BOX={BOX_LEN:.0f} Mpc, DIM={HII_DIM}\n"
                     f"Δ²(z) at k≈{K_TARGET} Mpc⁻¹")
        ax.legend(fontsize=7, loc="lower left")
        ax.grid(True, alpha=0.3)

        ax = axes[1]
        z_idx = N_Z // 3
        for j, rr in enumerate(all_results):
            k = rr["k"]
            dk = rr["delta_k"][z_idx]
            valid = dk > 0
            a = rr["astro"]
            label = f"α*={a['ALPHA_STAR']}, ζ={a['HII_EFF_FACTOR']}"
            ax.loglog(k[valid], dk[valid], '-', linewidth=1.3, color=colors[j], label=label)
        ax.set_xlabel("k [Mpc⁻¹]")
        ax.set_ylabel("Δ²₂₁(k)")
        ax.set_title(f"Δ²(k) at z≈{all_results[0]['z'][z_idx]:.1f}")
        ax.legend(fontsize=7)
        ax.grid(True, alpha=0.3)

        plt.tight_layout()
        outpath = os.path.join(OUTPUT_DIR, f"planck2020_box250_dim128_{i+1}of{len(SAMPLES)}.png")
        fig.savefig(outpath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"  图已保存: {outpath}")

    print(f"\n全部完成! {len(all_results)} 个样本。")
