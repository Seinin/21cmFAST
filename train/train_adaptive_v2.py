"""Train models on the adaptive z-grid dataset and compare vs uniform baseline.

Usage:
    python train/train_adaptive_v2.py                        # train both, compare
    python train/train_adaptive_v2.py --arch sinefouriercross  # use baseline arch
    python train/train_adaptive_v2.py --arch densityaware      # use DensityAwareSineFourierCrossNet
    python train/train_adaptive_v2.py --skip-train             # only compare
"""
import argparse, json, subprocess, sys, time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split

TRAIN_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TRAIN_DIR))
from Former import (
    SinusoidalFourierCrossNet, FourierCrossNet, DCNv2Net,
    DensityAwareSineFourierCrossNet,
    gaussian_nll_loss
)


Z_MIN, Z_MAX = 5.0, 25.0
N_Z = 128

ARCH_REGISTRY = {
    "sinefouriercross": SinusoidalFourierCrossNet,
    "fouriercross": FourierCrossNet,
    "dcnv2": DCNv2Net,
    "densityaware": DensityAwareSineFourierCrossNet,
}


# ═══════════════════════════════════════════════════════════════════════
# Data loading
# ═══════════════════════════════════════════════════════════════════════

def load_adaptive_dataset(path, remove_zero=True):
    """Load dataset_2000_adaptive.json → flat (N*128, 7) + Y log10.

    z_adaptive is now (N, 128) — each curve has its own z-grid.
    """
    with open(path) as f:
        raw = json.load(f)

    X_params = np.array(raw["params_normalized"], dtype=np.float32)   # (N, 5)
    Y_curves = np.array(raw["curves"], dtype=np.float32)              # (N, 128)
    z_adapt_all = np.array(raw["z_adaptive"], dtype=np.float32)       # (N, 128) per-curve

    N = len(X_params)
    assert Y_curves.shape == (N, 128)
    assert z_adapt_all.shape == (N, 128)

    # Remove all-zero curves (artifact, e.g. #55)
    if remove_zero:
        is_zero = np.all(Y_curves == 0, axis=1)
        if is_zero.any():
            print(f"Removing {is_zero.sum()} all-zero curve(s): {np.where(is_zero)[0].tolist()}")
            keep = ~is_zero
            X_params = X_params[keep]
            Y_curves = Y_curves[keep]
            z_adapt_all = z_adapt_all[keep]
            N = len(X_params)

    # Per-curve dz and z_norm
    dz_all = np.zeros_like(z_adapt_all)
    dz_all[:, 0] = z_adapt_all[:, 1] - z_adapt_all[:, 0]
    dz_all[:, -1] = z_adapt_all[:, -1] - z_adapt_all[:, -2]
    dz_all[:, 1:-1] = (z_adapt_all[:, 2:] - z_adapt_all[:, :-2]) / 2.0
    dz_norm_all = dz_all / dz_all.max()  # global normalize across all curves

    z_norm_all = (z_adapt_all - Z_MIN) / (Z_MAX - Z_MIN)

    # Flatten to (N*128, 7): [5 params | z_norm | dz_norm]
    M = N_Z
    X_flat = np.empty((N * M, 7), dtype=np.float32)
    for i in range(N):
        s, e = i * M, (i + 1) * M
        X_flat[s:e, :5] = X_params[i]
        X_flat[s:e, 5] = z_norm_all[i]
        X_flat[s:e, 6] = dz_norm_all[i]
    Y_flat = np.log10(np.maximum(Y_curves.ravel(), 1e-10))

    print(f"Adaptive dataset: {N} curves × {M} z-pts = {N*M} flat samples")
    print(f"  Y range (log10): [{Y_flat.min():.3f}, {Y_flat.max():.3f}]")
    return X_flat, Y_flat, z_adapt_all, N


def load_uniform_flat(path, remove_zero=True):
    """Load dataset_2000_flat.json or generate from dataset_2000_real.json."""
    with open(path) as f:
        raw = json.load(f)
    X = np.array(raw["params_normalized"], dtype=np.float32)   # (N, 5)
    curves = np.array(raw["curves"], dtype=np.float32)          # (N, 128)
    N = len(curves)

    if remove_zero:
        is_zero = np.all(curves == 0, axis=1)
        if is_zero.any():
            print(f"Removing {is_zero.sum()} all-zero curve(s)")
            X = X[~is_zero]
            curves = curves[~is_zero]
            N = len(curves)

    z_u = np.linspace(Z_MIN, Z_MAX, N_Z)
    z_norm = (z_u - Z_MIN) / (Z_MAX - Z_MIN)
    X_flat = np.empty((N * N_Z, 6), dtype=np.float32)
    for i in range(N):
        s, e = i * N_Z, (i + 1) * N_Z
        X_flat[s:e, :5] = X[i]
        X_flat[s:e, 5] = z_norm
    Y_flat = np.log10(np.maximum(curves.ravel(), 1e-10))

    print(f"Uniform dataset: {N} curves × {N_Z} z-pts = {N*N_Z} flat samples")
    return X_flat, Y_flat


# ═══════════════════════════════════════════════════════════════════════
# Training
# ═══════════════════════════════════════════════════════════════════════

def train_model(X_flat, Y_flat, model_cls, device, input_dim,
                epochs=120, batch_size=256, peak_lr=3e-4,
                ckpt_path=None, tag=""):
    """Train a flat model with warmup+cosine schedule and z-weighting."""
    X_train, X_val, Y_train, Y_val = train_test_split(
        X_flat, Y_flat, test_size=0.2, random_state=42)
    train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(Y_train))
    val_ds   = TensorDataset(torch.tensor(X_val),   torch.tensor(Y_val))
    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True, drop_last=False)
    val_dl   = DataLoader(val_ds, batch_size=batch_size * 2)

    model = model_cls(input_dim=input_dim).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  [{tag}] Model: {model_cls.__name__}, {n_params:,} params, device={device}")

    opt = optim.AdamW(model.parameters(), lr=peak_lr, weight_decay=1e-4, betas=(0.9, 0.999))
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
                val_loss += gaussian_nll_loss(model(xb), yb).item() * xb.size(0)
        val_loss /= len(val_ds)

        if val_loss < best_loss:
            best_loss = val_loss
            if ckpt_path:
                torch.save({
                    "model_state": model.state_dict(),
                    "input_dim": input_dim,
                    "arch": model_cls.__name__,
                }, ckpt_path)

        if epoch % 10 == 0 or epoch < 3 or epoch >= epochs - 3:
            elapsed = time.time() - t0
            marker = " ✓" if val_loss == best_loss else ""
            print(f"  epoch {epoch+1:3d}/{epochs}  train={train_loss:.4e}  "
                  f"val={val_loss:.4e}  lr={opt.param_groups[0]['lr']:.2e}  "
                  f"t={elapsed:.0f}s{marker}")

    print(f"  [{tag}] Best val loss: {best_loss:.4e}")
    return model, best_loss


# ═══════════════════════════════════════════════════════════════════════
# Prediction helpers
# ═══════════════════════════════════════════════════════════════════════

def predict_curves_flat(model, X_params, z_grid, dz_norm, device):
    """X_params: (N, 5) → predict on z_grid → (N, len(z_grid), 2)."""
    B = X_params.shape[0]
    M = len(z_grid)
    z_norm_t = torch.tensor((z_grid - Z_MIN) / (Z_MAX - Z_MIN),
                            dtype=torch.float32, device=device)
    dz_t = torch.tensor(dz_norm if dz_norm is not None else np.ones(M)/M,
                        dtype=torch.float32, device=device)
    x_t = torch.tensor(X_params, dtype=torch.float32, device=device)
    x_exp = x_t.unsqueeze(1).expand(B, M, 5).reshape(B * M, 5)
    z_exp = z_norm_t.unsqueeze(0).expand(B, M).reshape(B * M, 1)
    dz_exp = dz_t.unsqueeze(0).expand(B, M).reshape(B * M, 1)

    input_dim = x_exp.shape[1] + z_exp.shape[1]
    if dz_norm is not None:
        x6 = torch.cat([x_exp, z_exp, dz_exp], dim=-1)
        input_dim = 7
    else:
        x6 = torch.cat([x_exp, z_exp], dim=-1)
        input_dim = 6

    with torch.no_grad():
        out = model(x6)
    return out.reshape(B, M, 2)


def eval_metrics(mu_log10, Y_linear, tag=""):
    """Compute MAE(log10), FE(linear) per-curve."""
    mu_lin = 10.0 ** mu_log10
    eps = 1e-3
    fe = np.abs(mu_lin - Y_linear) / (Y_linear + eps)
    fe_per_curve = fe.mean(axis=1)
    mae_log10 = np.mean(np.abs(mu_log10 - np.log10(np.maximum(Y_linear, 1e-10))))

    results = {
        "mae_log10": mae_log10,
        "fe_mean": fe_per_curve.mean() * 100,
        "fe_median": np.median(fe_per_curve) * 100,
        "fe_lt1pct": (fe_per_curve < 0.01).sum() / len(fe_per_curve) * 100,
        "fe_per_curve": fe_per_curve,
        "fe_2d": fe,
    }
    print(f"  [{tag}] MAE(log10)={mae_log10:.4f}  FE(mean)={results['fe_mean']:.2f}%  "
          f"FE(median)={results['fe_median']:.2f}%  FE<1%={results['fe_lt1pct']:.1f}%")
    return results


# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", default="sinefouriercross",
                        choices=list(ARCH_REGISTRY.keys()),
                        help="Model architecture")
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--skip-train", action="store_true")
    parser.add_argument("--skip-compare", action="store_true")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}  Arch: {args.arch}")

    ckpt_dir = TRAIN_DIR / "checkpoints"
    ckpt_dir.mkdir(exist_ok=True)

    # ── Load adaptive dataset ──
    adaptive_path = TRAIN_DIR / "data" / "dataset_2000_adaptive.json"
    if not adaptive_path.exists():
        print(f"ERROR: {adaptive_path} not found. Run convert_to_adaptive.py first.")
        sys.exit(1)

    X_adapt, Y_adapt, z_adapt, N_curves = load_adaptive_dataset(adaptive_path)

    # ── Load uniform dataset (for baseline) ──
    uniform_path = TRAIN_DIR / "data" / "dataset_2000_real.json"
    if not uniform_path.exists():
        print(f"ERROR: {uniform_path} not found.")
        sys.exit(1)

    X_uniform, Y_uniform = load_uniform_flat(uniform_path)
    z_uniform = np.linspace(Z_MIN, Z_MAX, N_Z)

    model_cls = ARCH_REGISTRY[args.arch]
    is_density_aware = (args.arch == "densityaware")
    ckpt_adapt = ckpt_dir / f"best_adaptive_{args.arch}_noweight.pth"

    # ── Train adaptive only ──
    if not args.skip_train:
        if is_density_aware:
            print("\n" + "=" * 60)
            print("Training DensityAwareSineFourierCrossNet on ADAPTIVE z-grid (no weight)")
            print("=" * 60)
            model_adapt, _ = train_model(
                X_adapt, Y_adapt, model_cls, device, input_dim=7,
                epochs=args.epochs, batch_size=args.batch_size,
                peak_lr=args.lr, ckpt_path=ckpt_adapt, tag="ADAPT")
        else:
            print("\n" + "=" * 60)
            print(f"Training {args.arch} on ADAPTIVE z-grid (no weight)")
            print("=" * 60)
            X_adapt_6 = X_adapt[:, :6]
            model_adapt, _ = train_model(
                X_adapt_6, Y_adapt, model_cls, device, input_dim=6,
                epochs=args.epochs, batch_size=args.batch_size,
                peak_lr=args.lr, ckpt_path=ckpt_adapt, tag="ADAPT")
    else:
        print("\nSkipping training (--skip-train).")

    # ── Evaluate adaptive-trained on UNIFORM z-grid ──
    if not args.skip_compare:
        print("\n" + "=" * 60)
        print("EVALUATION — Adaptive-trained model on UNIFORM z-grid")
        print("=" * 60)
        input_dim = 7 if is_density_aware else 6
        model_adapt = model_cls(input_dim=input_dim).to(device)
        model_adapt.load_state_dict(torch.load(ckpt_adapt, map_location=device)["model_state"])
        model_adapt.eval()

        # Load uniform truth
        with open(uniform_path) as f:
            raw_u = json.load(f)
        X_uni_params = np.array(raw_u["params_normalized"], dtype=np.float32)
        Y_uni_curves = np.array(raw_u["curves"], dtype=np.float32)
        # Remove zero curves to match adaptive dataset
        is_zero = np.all(Y_uni_curves == 0, axis=1)
        X_uni_params = X_uni_params[~is_zero]
        Y_uni_curves = Y_uni_curves[~is_zero]

        # Predict on uniform z for all curves
        z_u = np.linspace(Z_MIN, Z_MAX, N_Z)
        out = predict_curves_flat(model_adapt, X_uni_params, z_u,
                                  dz_norm=np.ones(N_Z)/N_Z if is_density_aware else None,
                                  device=device)
        mu_log10 = out[:, :, 0].cpu().numpy()
        res = eval_metrics(mu_log10, Y_uni_curves, tag="Adaptive-trained on uniform eval")
        print(f"\nDone.")


if __name__ == "__main__":
    main()
