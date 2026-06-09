"""Train on flattened (params+z → Δ²) dataset.

Available architectures:
  physicsnet       - PhysicsNet (baseline: pairwise + z-gate + residual)
  fouriernet       - FourierNet (Fourier feature encoding + PhysicsNet backbone)
  dcnv2            - DCNv2Net (Deep & Cross Network V2)
  fouriercross     - FourierCrossNet (Fourier + Cross + Deep — strongest)
  sinefouriercross - SinusoidalFourierCrossNet (FourierCross + Sinusoidal z-encoding)

Usage:
  python train/train_sagenet_flat.py
  python train/train_sagenet_flat.py --arch fouriercross
  python train/train_sagenet_flat.py --arch sinefouriercross
  python train/train_sagenet_flat.py --arch dcnv2 --epochs 200
"""
import argparse, json, subprocess, sys
from pathlib import Path

import numpy as np
import torch
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split

TRAIN_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TRAIN_DIR))
from Former import (
    FormerFlat, FormerFlat6, PhysicsNet,
    FourierNet, DCNv2Net, FourierCrossNet,
    SinusoidalFourierCrossNet,
    gaussian_nll_loss
)

ARCH_REGISTRY = {
    "physicsnet":    PhysicsNet,
    "fouriernet":    FourierNet,
    "dcnv2":         DCNv2Net,
    "fouriercross":  FourierCrossNet,
    "sinefouriercross": SinusoidalFourierCrossNet,
    "formerflat":    FormerFlat,
    "formerflat6":   FormerFlat6,
}


def load_flat_json(path):
    with open(path) as f:
        raw = json.load(f)
    X = np.array(raw["params_normalized"], dtype=np.float32)
    raw_curves = np.array(raw["curves"], dtype=np.float32)
    N_Z = 128
    n_curves = len(raw_curves) // N_Z

    # Remove failed simulations (all-zero curves)
    curves_2d = raw_curves.reshape(n_curves, N_Z)
    zero_curves = np.all(curves_2d == 0, axis=1)
    if zero_curves.any():
        n_removed = zero_curves.sum()
        print(f"Removing {n_removed} zero-valued curve(s): indices={np.where(zero_curves)[0].tolist()}")
        keep_x = np.repeat(~zero_curves, N_Z)
        X = X[keep_x]
        raw_curves = raw_curves[keep_x]
    Y = np.log10(np.maximum(raw_curves, 1e-10))
    print(f"X: {X.shape}, Y: {Y.shape}, Y range: [{Y.min():.3f}, {Y.max():.3f}]")
    return X, Y


def train(json_path, arch="physicsnet", epochs=120, batch_size=256,
          peak_lr=3e-4, warmup_epochs=5, min_lr=1e-6, ckpt_name="best_model_2000flat.pth"):
    X, Y = load_flat_json(json_path)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    X_train, X_val, Y_train, Y_val = train_test_split(X, Y, test_size=0.2, random_state=42)

    train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(Y_train))
    val_ds   = TensorDataset(torch.tensor(X_val),   torch.tensor(Y_val))
    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True, drop_last=False)
    val_dl   = DataLoader(val_ds,   batch_size=batch_size * 2)

    model_cls = ARCH_REGISTRY[arch]
    model = model_cls(input_dim=X.shape[1]).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Arch: {arch}  Model: {n_params:,} params  batch={batch_size}  peak_lr={peak_lr:.1e}  device={device}")

    optimizer = optim.AdamW(model.parameters(), lr=peak_lr, weight_decay=1e-4, betas=(0.9, 0.999))
    steps_per_epoch = len(train_dl)
    total_steps = epochs * steps_per_epoch
    warmup_steps = warmup_epochs * steps_per_epoch

    def lr_lambda(step):
        if step < warmup_steps:
            return step / max(1, warmup_steps)
        progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
        return max(min_lr / peak_lr, 0.5 * (1 + np.cos(np.pi * progress)))

    scheduler = optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

    best_loss = float("inf")
    global_step = 0
    ckpt_dir = TRAIN_DIR / "checkpoints"
    ckpt_dir.mkdir(exist_ok=True)
    ckpt_path = ckpt_dir / ckpt_name

    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        for xb, yb in train_dl:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            loss = gaussian_nll_loss(model(xb), yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            train_loss += loss.item() * xb.size(0)
            global_step += 1
        train_loss /= len(train_ds)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for xb, yb in val_dl:
                xb, yb = xb.to(device), yb.to(device)
                val_loss += gaussian_nll_loss(model(xb), yb).item() * xb.size(0)
        val_loss /= len(val_ds)

        lr_now = optimizer.param_groups[0]['lr']
        marker = ""
        if val_loss < best_loss:
            best_loss = val_loss
            torch.save({
                "model_state": model.state_dict(),
                "input_dim": X.shape[1],
                "arch": arch,
            }, ckpt_path)
            marker = "  ✓ saved"

        if epoch % 5 == 0 or epoch < 5 or epoch >= epochs - 3:
            print(f"Epoch {epoch+1:3d}/{epochs}  train={train_loss:.4f}  val={val_loss:.4f}  lr={lr_now:.2e}{marker}")

    print(f"\nBest val loss: {best_loss:.4f}")
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", default="physicsnet",
                        choices=list(ARCH_REGISTRY.keys()),
                        help="Model architecture")
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--json", default="data/dataset_2000_flat.json")
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--ckpt-name", default="best_model_2000flat.pth",
                        help="Checkpoint filename (in checkpoints/)")
    args = parser.parse_args()

    train(TRAIN_DIR / args.json, arch=args.arch, epochs=args.epochs,
          batch_size=args.batch_size, peak_lr=args.lr, ckpt_name=args.ckpt_name)

    out_name = args.ckpt_name.replace(".pth", ".png")
    print("\n" + "=" * 50)
    print("Generating comparison plot...")
    try:
        subprocess.run([sys.executable, str(TRAIN_DIR / "compare_flat.py"),
                        "--ckpt", f"checkpoints/{args.ckpt_name}",
                        "--output", out_name], check=True)
    except subprocess.CalledProcessError as e:
        print(f"\n[WARNING] compare_flat.py failed with exit code {e.returncode}")
        print(f"  You can run it manually: python train/compare_flat.py --ckpt checkpoints/{args.ckpt_name} --output {out_name}")
