"""Generate flat datasets with adaptive z-sampling, train, and compare.

Pipeline:
1. Read dataset_2000_real.json (curves on uniform z)
2. Compute population-mean CDF-based adaptive z-grid (hybrid blend=0.5)
3. Resample curves to adaptive z-grid → dataset_2000_adaptive.json
4. Train SineFourierCrossNet on adaptive data (flat mode: 6 params → Δ²)
5. Train SineFourierCrossNet on uniform data as baseline
6. Compare both on a shared uniform validation grid
"""

import argparse, json, time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split

TRAIN_DIR = Path(__file__).resolve().parent

import sys
sys.path.insert(0, str(TRAIN_DIR))

from Former import (
    SinusoidalFourierCrossNet, FourierCrossNet,
    gaussian_nll_loss
)
from adaptive_z_sampling import (
    adaptive_zs_population, adaptive_zs_hybrid, resample_curves, describe_grid
)

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

Z_MIN, Z_MAX = 5.0, 25.0
N_Z = 128


# ─── data loading ───
def load_real_curves(path):
    with open(path) as f:
        raw = json.load(f)
    X = np.array(raw["params_normalized"], dtype=np.float32)
    Y = np.array(raw["curves"], dtype=np.float32)
    mask = ~np.all(Y == 0, axis=1)
    return X[mask], Y[mask]


# ─── flat dataset: (5 params + z) → log10(Δ²) ───
def curves_to_flat(X, Y, z_grid):
    """(N,5) curves on z_grid → (N*len(z_grid), 6) and (N*len(z_grid),).

    Y is in linear space (mK²); output Y_flat is log10(Y).
    """
    M = len(z_grid)
    z_norm = (z_grid - Z_MIN) / (Z_MAX - Z_MIN)
    X_flat = np.empty((X.shape[0] * M, 6), dtype=np.float32)
    Y_flat = np.empty(X.shape[0] * M, dtype=np.float32)
    for i in range(X.shape[0]):
        start = i * M
        end = start + M
        X_flat[start:end, :5] = X[i]
        X_flat[start:end, 5] = z_norm
        Y_flat[start:end] = np.log10(np.maximum(Y[i], 1e-10))
    return X_flat, Y_flat


# ─── train / eval ───
def train_flat(X_flat, Y_flat, model_cls, device, epochs=120, batch_size=256,
               peak_lr=3e-4, ckpt_path=None):
    X_train, X_val, Y_train, Y_val = train_test_split(
        X_flat, Y_flat, test_size=0.2, random_state=42)
    train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(Y_train))
    val_ds   = TensorDataset(torch.tensor(X_val),   torch.tensor(Y_val))
    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True, drop_last=False)
    val_dl   = DataLoader(val_ds, batch_size=batch_size * 2)

    model = model_cls(input_dim=6).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  Model: {n_params:,} params")

    opt = optim.AdamW(model.parameters(), lr=peak_lr, weight_decay=1e-3, betas=(0.9, 0.999))
    steps_per_epoch = len(train_dl)
    total_steps = epochs * steps_per_epoch
    warmup_steps = 5 * steps_per_epoch

    def lr_lambda(step):
        if step < warmup_steps:
            return step / max(1, warmup_steps)
        progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
        return max(1e-6 / peak_lr, 0.5 * (1 + np.cos(np.pi * progress)))

    scheduler = optim.lr_scheduler.LambdaLR(opt, lr_lambda)

    best_loss = float("inf")
    t0 = time.time()

    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        for xb, yb in train_dl:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            out = model(xb)
            loss = gaussian_nll_loss(out, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            scheduler.step()
            train_loss += loss.item() * xb.size(0)
        train_loss /= len(train_ds)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for xb, yb in val_dl:
                xb, yb = xb.to(device), yb.to(device)
                out = model(xb)
                val_loss += gaussian_nll_loss(out, yb).item() * xb.size(0)
        val_loss /= len(val_ds)

        if val_loss < best_loss:
            best_loss = val_loss
            if ckpt_path:
                torch.save({"model_state": model.state_dict(), "input_dim": 6,
                            "arch": "sinefouriercross"}, ckpt_path)

        if epoch % 20 == 0 or epoch < 3:
            elapsed = time.time() - t0
            print(f"  epoch {epoch+1:3d}/{epochs}  train={train_loss:.4e}  "
                  f"val={val_loss:.4e}  lr={opt.param_groups[0]['lr']:.2e}  "
                  f"t={elapsed:.0f}s")

    print(f"  Best val loss: {best_loss:.4e}")
    return model, best_loss


def predict_curves_from_flat(model, X, z_grid, device):
    """X: (N, 5) → (N, len(z_grid), 2) via broadcasting."""
    B = X.shape[0]
    M = len(z_grid)
    z_norm = torch.tensor((z_grid - Z_MIN) / (Z_MAX - Z_MIN),
                          dtype=torch.float32, device=device)
    x_t = torch.tensor(X, dtype=torch.float32, device=device)
    x_exp = x_t.unsqueeze(1).expand(B, M, 5).reshape(B * M, 5)
    z_exp = z_norm.unsqueeze(0).expand(B, M).reshape(B * M, 1)
    x6 = torch.cat([x_exp, z_exp], dim=-1)
    with torch.no_grad():
        out = model(x6)
    return out.reshape(B, M, 2)


# ─── evaluation on uniform grid (common reference) ───
def eval_on_uniform(model, X, Y_orig, z_uniform, device, tag=""):
    out = predict_curves_from_flat(model, X, z_uniform, device)
    mu = out[..., 0].cpu().numpy()
    log_sigma = out[..., 1].cpu().numpy()
    sigma = np.log1p(np.exp(log_sigma)) + 1e-3

    # MAE in log10 space
    mae_log10 = np.mean(np.abs(mu - np.log10(np.maximum(Y_orig, 1e-10))))

    # FE in linear space
    mu_lin = 10.0 ** mu
    eps = 1e-3
    fe = np.abs(mu_lin - Y_orig) / (Y_orig + eps)
    fe_per_curve = fe.mean(axis=1)

    results = {
        "mae_log10": mae_log10,
        "fe_mean": fe_per_curve.mean() * 100,
        "fe_median": np.median(fe_per_curve) * 100,
        "fe_lt1pct": (fe_per_curve < 0.01).sum() / len(fe_per_curve) * 100,
    }
    print(f"  [{tag}] MAE(log10)={mae_log10:.4f}  "
          f"FE(mean)={results['fe_mean']:.2f}%  "
          f"FE(median)={results['fe_median']:.2f}%  "
          f"FE<1%={results['fe_lt1pct']:.1f}%")
    return results, mu_lin, sigma, Y_orig


# ─── main ───
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--blend", type=float, default=0.5,
                        help="Hybrid blend ratio (0=uniform, 1=adaptive)")
    parser.add_argument("--skip-train", action="store_true",
                        help="Skip training, only compare")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Load data
    json_path = TRAIN_DIR / "data" / "dataset_2000_real.json"
    X, Y_orig = load_real_curves(json_path)
    print(f"\nLoaded {len(X)} curves, shape: {Y_orig.shape}")

    # z grids
    z_uniform = np.linspace(Z_MIN, Z_MAX, N_Z)
    z_fine = np.linspace(Z_MIN, Z_MAX, 512)  # fine for CDF
    Y_fine = np.empty((len(Y_orig), 512), dtype=np.float32)
    for i in range(len(Y_orig)):
        Y_fine[i] = np.interp(z_fine, z_uniform, Y_orig[i])

    # Adaptive grid
    z_adaptive = adaptive_zs_hybrid(Y_fine, z_fine, N_Z=N_Z,
                                    blend_ratio=args.blend)
    print(f"\n--- z-grid: hybrid blend={args.blend} ---")
    describe_grid(z_adaptive)

    # Make flat datasets
    X_flat_u, Y_flat_u = curves_to_flat(X, Y_orig, z_uniform)
    Y_adaptive = resample_curves(Y_orig, z_uniform, z_adaptive)
    X_flat_a, Y_flat_a = curves_to_flat(X, Y_adaptive, z_adaptive)

    print(f"\nUniform flat data:  {X_flat_u.shape[0]} points")
    print(f"Adaptive flat data: {X_flat_a.shape[0]} points")

    ckpt_dir = TRAIN_DIR / "checkpoints"
    ckpt_dir.mkdir(exist_ok=True)

    model_cls = SinusoidalFourierCrossNet

    if not args.skip_train:
        print("\n" + "=" * 50)
        print("Training on UNIFORM z-grid")
        print("=" * 50)
        model_u, loss_u = train_flat(
            X_flat_u, Y_flat_u, model_cls, device,
            epochs=args.epochs, batch_size=args.batch_size,
            ckpt_path=ckpt_dir / "best_adaptive_uniform.pth")

        print("\n" + "=" * 50)
        print("Training on ADAPTIVE z-grid")
        print("=" * 50)
        model_a, loss_a = train_flat(
            X_flat_a, Y_flat_a, model_cls, device,
            epochs=args.epochs, batch_size=args.batch_size,
            ckpt_path=ckpt_dir / "best_adaptive_blend.pth")
    else:
        print("\nLoading pre-trained checkpoints...")
        model_u = model_cls(input_dim=6).to(device)
        model_u.load_state_dict(torch.load(
            ckpt_dir / "best_adaptive_uniform.pth", map_location=device)["model_state"])
        model_u.eval()

        model_a = model_cls(input_dim=6).to(device)
        model_a.load_state_dict(torch.load(
            ckpt_dir / "best_adaptive_blend.pth", map_location=device)["model_state"])
        model_a.eval()

    # Evaluate both on uniform grid (fair comparison)
    print("\n" + "=" * 50)
    print("Evaluation on UNIFORM reference grid (128 points)")
    print("=" * 50)
    res_u, mu_u, sigma_u, Y_ref = eval_on_uniform(
        model_u, X, Y_orig, z_uniform, device, tag="Uniform-trained")
    res_a, mu_a, sigma_a, _ = eval_on_uniform(
        model_a, X, Y_orig, z_uniform, device, tag="Adaptive-trained")

    # Also evaluate adaptive model on adaptive grid
    Y_adaptive_full = resample_curves(Y_orig, z_uniform, z_adaptive)
    print("\n" + "=" * 50)
    print("Evaluation on ADAPTIVE reference grid")
    print("=" * 50)
    res_a_adaptive, _, _, _ = eval_on_uniform(
        model_a, X, Y_adaptive_full, z_adaptive, device,
        tag="Adaptive-trained on adaptive")

    # ─── Comparison plot ───
    fe_u = np.abs(mu_u - Y_ref) / (Y_ref + 1e-3)
    fe_a = np.abs(mu_a - Y_ref) / (Y_ref + 1e-3)
    fe_u_curve = fe_u.mean(axis=1)
    fe_a_curve = fe_a.mean(axis=1)

    n_curves = len(X)
    best_u = np.argsort(fe_u_curve)[:2]
    best_a = np.argsort(fe_a_curve)[:2]
    worst_u = np.argsort(fe_u_curve)[-2:]
    worst_a = np.argsort(fe_a_curve)[-2:]
    rng = np.random.default_rng(42)
    pool = [i for i in range(n_curves) if i not in best_u and i not in worst_u]
    rand_idx = rng.choice(pool, size=2, replace=False)

    fig, axes = plt.subplots(2, 4, figsize=(14, 7))
    fig.suptitle(f"Adaptive z-Sampling (hybrid blend={args.blend}) — "
                 f"SineFourierCrossNet on 1829 curves",
                 fontsize=13, fontweight="bold")

    # Row 1: uniform-trained model
    for j, (idx, tag) in enumerate([(best_u[0], "BEST"), (worst_u[0], "WORST"),
                                     (rand_idx[0], "RANDOM"), (best_a[0], "ADAPT-BEST")]):
        ax = axes[0, j]
        ax.plot(z_uniform, mu_u[idx], "C0-", lw=1.2, label="uniform-trained")
        ax.plot(z_uniform, mu_a[idx], "C2--", lw=1.0, label="adaptive-trained")
        ax.plot(z_uniform, Y_ref[idx], "C1:", lw=1.0, label="true")
        ax.set_title(f"{tag} #{idx}\nFEu={fe_u_curve[idx]*100:.2f}% "
                     f"FEa={fe_a_curve[idx]*100:.2f}%", fontsize=8)
        ax.tick_params(labelsize=6)
        if j == 0:
            ax.legend(fontsize=6)
            ax.set_ylabel(r"$\Delta^2_{21}$ [mK$^2$]", fontsize=8)

    # Row 2: residual
    for j, (idx, tag) in enumerate([(best_u[0], "BEST"), (worst_u[0], "WORST"),
                                     (rand_idx[0], "RANDOM"), (best_a[0], "ADAPT-BEST")]):
        ax = axes[1, j]
        resid_u = (mu_u[idx] - Y_ref[idx]) / (Y_ref[idx] + 1e-8)
        resid_a = (mu_a[idx] - Y_ref[idx]) / (Y_ref[idx] + 1e-8)
        ax.axhline(0, color="black", lw=0.5)
        ax.plot(z_uniform, resid_u, "C0-", lw=0.8, label="uniform")
        ax.plot(z_uniform, resid_a, "C2--", lw=0.8, label="adaptive")
        ax.set_xlabel("z", fontsize=7)
        ax.tick_params(labelsize=6)
        if j == 0:
            ax.set_ylabel("rel. residual", fontsize=8)

    plt.tight_layout()
    plots_dir = TRAIN_DIR / "plots"
    plots_dir.mkdir(exist_ok=True)
    out_path = plots_dir / f"comparison_adaptive_blend{args.blend}.png"
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"\nFigure saved: {out_path}")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY (on uniform reference grid)")
    print("=" * 60)
    print(f"{'Metric':<20} {'Uniform':>12} {'Adaptive':>12} {'Δ':>10}")
    print("-" * 54)
    for k in ["mae_log10", "fe_mean", "fe_median", "fe_lt1pct"]:
        vu = res_u[k]
        va = res_a[k]
        if k == "mae_log10":
            d = va - vu
            print(f"{k:<20} {vu:>12.4f} {va:>12.4f} {d:>+10.4f}")
        else:
            d = va - vu
            print(f"{k:<20} {vu:>10.2f}% {va:>10.2f}% {d:>+9.2f}%")
    print(f"\nFigure: {out_path}")


if __name__ == "__main__":
    main()
