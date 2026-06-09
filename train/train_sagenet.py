import json

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from sklearn.model_selection import train_test_split

import Former
import GWDataset
from tqdm import tqdm


def load_json_data(file_path):
    """加载本项目 21cmFAST 数据集 JSON, 转为 GWDataset 所需的 list-of-dicts 格式."""
    with open(file_path, "r") as f:
        raw = json.load(f)

    # 验证格式: 顶层 dict 含 params_normalized 和 curves 两个数组
    assert "params_normalized" in raw, "缺少 params_normalized"
    assert "curves" in raw, "缺少 curves"
    assert len(raw["params_normalized"]) == len(raw["curves"]), "样本数不匹配"
    assert len(raw["params_normalized"][0]) == 5, "参数数应为 5"
    assert len(raw["curves"][0]) == 128, "曲线长度应为 128"

    # 转为 list of dicts (GWDataset 需要的格式)
    data = [
        {"params_normalized": p, "curve": c}
        for p, c in zip(raw["params_normalized"], raw["curves"])
    ]
    return data


def collate_fn(batch):
    params, curves = zip(*batch)
    return torch.stack(params), torch.stack(curves)

def train_gw_model(json_path, model_name="Transformer", epochs=200, batch_size=32):
    raw_data = load_json_data(json_path)
    full_dataset = GWDataset.GWDataset(raw_data)
    print(f"JSON loaded. Total data num: {len(raw_data)}. model: {model_name}")

    train_idx, val_idx = train_test_split(
        np.arange(len(full_dataset)),
        test_size=0.2,
        random_state=42,
    )
    train_data = torch.utils.data.Subset(full_dataset, train_idx)
    val_data = torch.utils.data.Subset(full_dataset, val_idx)

    train_loader = DataLoader(train_data, batch_size=batch_size, shuffle=True, collate_fn=collate_fn)
    val_loader = DataLoader(val_data, batch_size=batch_size, collate_fn=collate_fn)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = Former.Former().to(device)
    optimizer = optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5,
    )
    # Former 输出 (B, 128, 2): μ 与 log σ, 需配套 gaussian_nll_loss
    print(f"Model initialized. Start training. Current device: {device}")

    best_loss = float("inf")
    for epoch in tqdm(range(epochs)):
        model.train()
        train_loss = 0.0

        for params, curves in train_loader:
            params = params.to(device)
            curves = curves.to(device)
            optimizer.zero_grad()
            outputs = model(params)
            loss = Former.gaussian_nll_loss(outputs, curves)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item() * params.size(0)

        # Valid
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for params, curves in val_loader:
                params = params.to(device)
                curves = curves.to(device)
                outputs = model(params)
                val_loss += Former.gaussian_nll_loss(outputs, curves).item() * params.size(0)

        train_loss /= len(train_loader)
        val_loss /= len(val_loader)
        scheduler.step(val_loss)

        print(f"Epoch {epoch + 1}/{epochs}")
        print(f"Train Loss: {train_loss:.4e} | Val Loss: {val_loss:.4e}")

        if val_loss < best_loss:
            best_loss = val_loss
            from pathlib import Path
            ckpt_dir = Path(__file__).resolve().parent / "checkpoints"
            ckpt_dir.mkdir(exist_ok=True)
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "param_scaler": full_dataset.param_scaler,
                    "curve_scaler": full_dataset.curve_scaler,
                },
                ckpt_dir / "best_model_2000real.pth",
            )

    return model


if __name__ == "__main__":
    trained_model = train_gw_model("data/dataset_2000_real.json", model_name="Transformer", epochs=500)
