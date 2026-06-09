#!/usr/bin/env python
"""Load a flat-trained checkpoint and predict full Δ²(z) curves from 5 params.

Key insight: the flat model is trained on 233k data points (5 params + z → Δ²).
To predict a 128-point curve from just 5 params, we broadcast the 5 params
to 128 z-values and forward through the flat model.

Usage:
  python train/train_sagenet_curve.py --ckpt checkpoints/best_model_2000flat_sinefouriercross.pth
"""
import argparse, json, sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch

TRAIN_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TRAIN_DIR))
from Former import (
    PhysicsNet, FourierNet, DCNv2Net, FourierCrossNet,
    SinusoidalFourierCrossNet, FormerFlat6,
)

ARCH_REGISTRY = {
    "physicsnet":         PhysicsNet,
    "fouriernet":         FourierNet,
    "dcnv2":              DCNv2Net,
    "fouriercross":       FourierCrossNet,
    "sinefouriercross":   SinusoidalFourierCrossNet,
    "formerflat6":        FormerFlat6,
}

ARCH_LABELS = {
    "physicsnet":         "PhysicsNet",
    "fouriernet":         "FourierNet",
    "dcnv2":              "DCNv2 (Deep & Cross)",
    "fouriercross":       "FourierCrossNet",
    "sinefouriercross":   "SinusoidalFourierCrossNet",
    "formerflat6":        "FormerFlat6",
}

N_Z = 128
Z_MIN, Z_MAX = 5.0, 25.0


def load_curve_json(path):
    with open(path) as f:
        raw = json.load(f)
    X = np.array(raw["params_normalized"], dtype=np.float32)
    Y_raw = np.array(raw["curves"], dtype=np.float32)
    zero_mask = np.all(Y_raw == 0, axis=1)
    if zero_mask.any():
        X = X[~zero_mask]
        Y_raw = Y_raw[~zero_mask]
    return X, Y_raw


def predict_curves(model, X, device):
    """X: (N, 5) → (N, 128, 2) via broadcasting z."""
    B = X.shape[0]
    z_norm = torch.linspace(0, 1, N_Z, device=device, dtype=torch.float32)
    x_t = torch.tensor(X, dtype=torch.float32, device=device)
    x_exp = x_t.unsqueeze(1).expand(B, N_Z, 5).reshape(B * N_Z, 5)
    z_exp = z_norm.unsqueeze(0).expand(B, N_Z).reshape(B * N_Z, 1)
    x6 = torch.cat([x_exp, z_exp], dim=-1)
    with torch.no_grad():
        out = model(x6)  # (B*128, 2)
    return out.reshape(B, N_Z, 2)


def compare(ckpt_relpath, json_path="data/dataset_2000_real.json", output_name=None):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    X, Y_raw = load_curve_json(TRAIN_DIR / json_path)

    ckpt = torch.load(TRAIN_DIR / ckpt_relpath, map_location=device)
    arch = ckpt.get("arch", "sinefouriercross")
    input_dim = ckpt.get("input_dim", 6)

    model_cls = ARCH_REGISTRY.get(arch, SinusoidalFourierCrossNet)
    model = model_cls(input_dim=input_dim).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    all_out = predict_curves(model, X, device)
    mu_log10 = all_out[..., 0].cpu().numpy()
    log_sigma = all_out[..., 1].cpu().numpy()
    sigma_log10 = np.log1p(np.exp(log_sigma)) + 1e-3

    mu_lin = 10.0 ** mu_log10
    sigma_lo = 10.0 ** (mu_log10 - sigma_log10)
    sigma_hi = 10.0 ** (mu_log10 + sigma_log10)
    Y_lin = Y_raw  # already linear

    zs = np.linspace(Z_MIN, Z_MAX, N_Z)
    n_curves = mu_lin.shape[0]

    mae_all = np.mean(np.abs(mu_lin - Y_lin), axis=1)
    rng = np.random.default_rng(42)

    best_idx = np.argsort(mae_all)[:2]
    worst_idx = np.argsort(mae_all)[-2:]
    pool = [i for i in range(n_curves) if i not in best_idx and i not in worst_idx]
    rand_idx = rng.choice(pool, size=2, replace=False)
    idxs_show = list(best_idx) + list(worst_idx) + list(rand_idx)
    n_show = 6

    fig, axes = plt.subplots(2, n_show, figsize=(3.2 * n_show, 6.5))
    label = ARCH_LABELS.get(arch, arch.upper())
    fig.suptitle(f"{label} vs 21cmFAST — Δ²₂₁(z)  (5→128 curves)", fontsize=14, fontweight="bold")

    for j, idx in enumerate(idxs_show):
        if j < 2:      tag = "BEST"
        elif j < 4:    tag = "WORST"
        else:          tag = "RANDOM"

        ax = axes[0, j]
        ax.fill_between(zs, sigma_lo[idx], sigma_hi[idx], alpha=0.2, color="C0")
        ax.plot(zs, mu_lin[idx], "C0-", lw=1.5, label="predicted")
        ax.plot(zs, Y_lin[idx], "C1--", lw=1.2, label="true")
        ax.set_title(f"{tag} #{idx}  MAE={mae_all[idx]:.3f}", fontsize=9)
        ax.tick_params(labelsize=7)
        if j == 0:
            ax.legend(fontsize=7)
            ax.set_ylabel(r"Δ²₂₁(z) [mK²]", fontsize=8)

        ax = axes[1, j]
        resid = (mu_lin[idx] - Y_lin[idx]) / (Y_lin[idx] + 1e-8)
        ax.axhline(0, color="black", lw=0.5)
        rel_lo = (sigma_lo[idx] - Y_lin[idx]) / (Y_lin[idx] + 1e-8)
        rel_hi = (sigma_hi[idx] - Y_lin[idx]) / (Y_lin[idx] + 1e-8)
        ax.fill_between(zs, rel_lo, rel_hi, alpha=0.15, color="C0")
        ax.plot(zs, resid, "C0-", lw=0.8)
        ax.tick_params(labelsize=7)

    eps_fe = 1e-3
    fe_all = np.abs(mu_lin.ravel() - Y_lin.ravel()) / (Y_lin.ravel() + eps_fe)
    fe_2d = fe_all.reshape(n_curves, N_Z)
    fe_curve = np.mean(fe_2d, axis=1)

    plt.tight_layout()
    plots_dir = TRAIN_DIR / "plots"
    plots_dir.mkdir(exist_ok=True)
    out = plots_dir / (output_name if output_name else f"comparison_curve_{arch}.png")
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)

    mae_log10 = np.mean(np.abs(mu_log10 - np.log10(np.maximum(Y_lin, 1e-10))))
    print(f"\n{'='*50}")
    print(f"{label} Curve Prediction  (n={n_curves}, 128 z-points)")
    print(f"{'='*50}")
    print(f"MAE (log10)    : {mae_log10:.4f}  (≈ factor {10**mae_log10:.2f}x)")
    print(f"MAE (linear)   : mean={mae_all.mean():.4f}   median={np.median(mae_all):.4f}")
    print(f"FE  (per-pt)   : mean={fe_all.mean()*100:.2f}%  median={np.median(fe_all)*100:.2f}%")
    print(f"FE  (per-curve): mean={fe_curve.mean()*100:.2f}%  median={np.median(fe_curve)*100:.2f}%")
    print(f"FE  (per-curve): std={fe_curve.std()*100:.2f}%  min={fe_curve.min()*100:.3f}%  max={fe_curve.max()*100:.2f}%")
    pct_1 = (fe_curve < 0.01).sum() / n_curves * 100
    print(f"FE  < 1.0%     : {pct_1:.1f}% of curves")
    print(f"Figure         : {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt", default="checkpoints/best_model_2000flat_sinefouriercross.pth")
    parser.add_argument("--json", default="data/dataset_2000_real.json")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    compare(args.ckpt, args.json, args.output)
