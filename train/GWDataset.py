import torch
from torch.utils.data import Dataset
from sklearn.preprocessing import StandardScaler
import numpy as np


class GWDataset(Dataset):
    """Dataset for 21cmFAST Δ²(z) curves.

    Expects ``data`` as a list of dicts, each with keys:
        - ``params_normalized``: 5-element list (ALPHA_STAR, HII_EFF_FACTOR,
          ION_Tvir_MIN, L_X, K_TARGET), already in [0, 1] from LHS sampling.
        - ``curve``: 128-element list, Δ²₂₁(z) at z∈[6, 25].
    """

    def __init__(self, data, param_scaler=None, curve_scaler=None, fit_scalers=True):
        self.data = data

        # 5 参数 (已由 LHS 归一化至 [0,1]), 128 点 Δ²(z) 曲线
        params = np.array([item["params_normalized"] for item in data], dtype=np.float32)
        curves = np.array([item["curve"] for item in data], dtype=np.float32)  # (N, 128)

        if fit_scalers or param_scaler is None or curve_scaler is None:
            self.param_scaler = StandardScaler()
            self.param_scaler.fit(params)
            self.curve_scaler = StandardScaler()
            self.curve_scaler.fit(curves.reshape(-1, 1))
        else:
            self.param_scaler = param_scaler
            self.curve_scaler = curve_scaler

        self.params = self.param_scaler.transform(params)
        self.curves = self.curve_scaler.transform(
            curves.reshape(-1, 1)
        ).reshape(curves.shape)  # (N, 128)

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        params = torch.tensor(self.params[idx], dtype=torch.float32)
        curve = torch.tensor(self.curves[idx], dtype=torch.float32)
        return params, curve
