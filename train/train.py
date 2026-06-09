#!/usr/bin/env python
"""
train.py — 数据生成 + Former 训练一条龙

Usage:
    python train/train.py                          # mock 1000 样本快速训练
    python train/train.py --real --n-workers 4     # 真实 21cmFAST 模拟
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

TRAIN_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TRAIN_DIR))

from sample_cosmology import generate_dataset
from Former import Former, gaussian_nll_loss

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def prepare_data(dataset, batch_size=64, val_ratio=0.15):
    X = torch.tensor(dataset["params_normalized"], dtype=torch.float32)
    y = torch.tensor(dataset["curves"], dtype=torch.float32)
    n = len(X)
    n_val = max(1, int(n * val_ratio))
    perm = torch.randperm(n)
    X, y = X[perm], y[perm]
    train_ds = TensorDataset(X[:n - n_val], y[:n - n_val])
    val_ds = TensorDataset(X[n - n_val:], y[n - n_val:])
    print(f"训练集: {n - n_val}  验证集: {n_val}")
    return (DataLoader(train_ds, batch_size=batch_size, shuffle=True),
            DataLoader(val_ds, batch_size=batch_size * 2))


def train_one_epoch(model, loader, opt):
    model.train()
    total = 0.0
    for x, y in loader:
        x, y = x.to(DEVICE), y.to(DEVICE)
        opt.zero_grad()
        loss = gaussian_nll_loss(model(x), y)
        loss.backward()
        opt.step()
        total += loss.item()
    return total / len(loader)


@torch.no_grad()
def validate(model, loader):
    model.eval()
    total = 0.0
    for x, y in loader:
        x, y = x.to(DEVICE), y.to(DEVICE)
        total += gaussian_nll_loss(model(x), y).item()
    return total / len(loader)


def train(model, train_loader, val_loader, epochs=200, lr=1e-3):
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    best_val = float("inf")
    best_path = TRAIN_DIR / "checkpoints" / "best_model.pt"

    print(f"\n▶ 训练  设备={DEVICE}  epochs={epochs}  lr={lr}\n")
    for e in range(1, epochs + 1):
        train_loss = train_one_epoch(model, train_loader, opt)
        val_loss = validate(model, val_loader)
        sched.step()
        print(f"  epoch {e:3d}  train={train_loss:.4f}  val={val_loss:.4f}  "
              f"lr={sched.get_last_lr()[0]:.2e}")
        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), best_path)
            print(f"  ✓ 保存 → {best_path}")
    print(f"\n完成  best_val={best_val:.4f}")


@torch.no_grad()
def demo(model, dataset, n=5):
    import random
    idxs = random.sample(range(len(dataset["curves"])), min(n, len(dataset["curves"])))
    X = torch.tensor(dataset["params_normalized"][idxs], dtype=torch.float32, device=DEVICE)
    y = dataset["curves"][idxs]
    mu = model(X).cpu().numpy()[..., 0]
    print("\n▶ 样本预测 vs 真实:")
    for i, idx in enumerate(idxs):
        mae = np.mean(np.abs(mu[i] - y[i]))
        print(f"  [{idx:4d}] MAE={mae:.4f}  params={dataset['params_normalized'][idx].round(3)}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Former 训练")
    p.add_argument("--n-samples", type=int, default=5000)
    p.add_argument("--real", action="store_true", help="真实 21cmFAST 模拟")
    p.add_argument("--n-workers", type=int, default=1)
    p.add_argument("--epochs", type=int, default=200)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--lr", type=float, default=1e-3)
    args = p.parse_args()

    # 1. 数据
    print("▶ 生成数据集...")
    dataset = generate_dataset(n_samples=args.n_samples, use_mock=not args.real,
                               n_workers=args.n_workers)

    # 2. DataLoader
    train_loader, val_loader = prepare_data(dataset, args.batch_size)

    # 3. 模型
    model = Former(num_points=128).to(DEVICE)
    print(f"\nFormer 参数量: {sum(p.numel() for p in model.parameters()):,}")

    # 4. 训练
    train(model, train_loader, val_loader, epochs=args.epochs, lr=args.lr)

    # 5. 演示
    ckpt = TRAIN_DIR / "checkpoints" / "best_model.pt"
    if ckpt.exists():
        model.load_state_dict(torch.load(ckpt, map_location=DEVICE, weights_only=True))
        demo(model, dataset)
