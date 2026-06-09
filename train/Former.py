#!/usr/bin/env python
"""Former — Transformer 回归: 5 参数 (4 astro + k) → 128 点 Δ²(z) → 2 通道 (μ, log σ)"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class Former(nn.Module):
    def __init__(self, num_points=128):
        super().__init__()
        self.num_points = num_points

        self.param_encoder = nn.Sequential(
            nn.Linear(5, 128),
            nn.GELU(),
            nn.LayerNorm(128),
            nn.Linear(128, 256),
            nn.GELU(),
            nn.LayerNorm(256)
        )

        self.position_embed = nn.Embedding(num_points, 256)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=256,
            nhead=8,
            dim_feedforward=512,
            dropout=0.1,
            activation="gelu",
            batch_first=True,
            norm_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=3)

        self.decoder = nn.Sequential(
            nn.Linear(256, 128),
            nn.GELU(),
            nn.Linear(128, 2)
        )

    def forward(self, params):
        B = params.shape[0]

        encoded = self.param_encoder(params)                        # (B, 256)
        seq = encoded.unsqueeze(1).expand(-1, self.num_points, -1)  # (B, N, 256)

        positions = torch.arange(self.num_points, device=params.device)
        seq = seq + self.position_embed(positions).unsqueeze(0)     # (B, N, 256)

        seq = self.transformer(seq)                                 # (B, N, 256)
        out = self.decoder(seq)                                     # (B, N, 2)
        return out


class FormerFlat(nn.Module):
    """MLP for scalar prediction: 6 params → (μ, σ) per point."""
    def __init__(self, input_dim=6):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.GELU(),
            nn.LayerNorm(256),
            nn.Linear(256, 512),
            nn.GELU(),
            nn.LayerNorm(512),
            nn.Linear(512, 256),
            nn.GELU(),
            nn.LayerNorm(256),
            nn.Linear(256, 128),
            nn.GELU(),
            nn.LayerNorm(128),
            nn.Linear(128, 2),
        )

    def forward(self, x):
        return self.net(x)   # (B, 2)


class FormerFlat6(nn.Module):
    """6-hidden-layer MLP: 6 → 256 → 384 → 512 → 384 → 256 → 128 → (μ, σ)"""
    def __init__(self, input_dim=6):
        super().__init__()
        dims = [input_dim, 256, 384, 512, 384, 256, 128]
        layers = []
        for i in range(len(dims) - 1):
            layers.append(nn.Linear(dims[i], dims[i + 1]))
            layers.append(nn.LayerNorm(dims[i + 1]))
            layers.append(nn.GELU())
            layers.append(nn.Dropout(0.05))
        layers.append(nn.Linear(128, 2))
        self.net = nn.Sequential(*layers)
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_in', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x):
        return self.net(x)   # (B, 2)


# ============================================================
# PhysicsNet — 全新设计的网络
# ============================================================
class PhysicsNet(nn.Module):
    """Physics-aware network for 21cm power spectrum prediction.
    
    Architecture:
      - Input: 6 params [α, ζ, T_vir, L_X, k, z] in [0,1]
      - Feature expansion: explicit pairwise interactions between astro params
      - z-aware modulation: z modulates the astro features
      - Residual backbone: 6 residual blocks with Pre-LayerNorm + SiLU
      - Output: 2 channels [μ in log10 space, log_σ]
    
    Design rationale:
      - Astro params have near-zero linear correlation with Δ² but interact nonlinearly
      - z is the dominant feature and modulates how astro params affect the spectrum
      - Residual connections allow learning the residual corrections to a z-driven baseline
    """
    def __init__(self, input_dim=6, embed_dim=384, n_res_blocks=6, dropout=0.1):
        super().__init__()
        self.input_dim = input_dim
        self.embed_dim = embed_dim

        # --- Input embedding ---
        self.input_proj = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.SiLU(),
            nn.Linear(128, embed_dim),
            nn.SiLU(),
        )

        # --- Interaction encoder: learn pair-wise products ---
        # For 6 params, there are C(6,2)=15 pairs + 6 singles = 21 features
        n_pairs = input_dim * (input_dim - 1) // 2
        self.n_interact_features = input_dim + n_pairs
        # Learnable projection from interaction features
        self.interact_proj = nn.Sequential(
            nn.Linear(input_dim + n_pairs, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
        )

        # --- Residual blocks (Pre-LN style) ---
        self.res_blocks = nn.ModuleList([
            PreLNResBlock(embed_dim, dropout=dropout)
            for _ in range(n_res_blocks)
        ])

        # --- z-gate: z gates the astro features ---
        self.z_gate = nn.Sequential(
            nn.Linear(1, embed_dim),
            nn.Sigmoid(),
        )

        # --- Output head ---
        self.head = nn.Sequential(
            nn.Linear(embed_dim, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.LayerNorm(128),
            nn.SiLU(),
            nn.Linear(128, 2),
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_in', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def _compute_interactions(self, x):
        """Compute pairwise interactions: [x_1,...,x_d, x_1*x_2, x_1*x_3, ...]"""
        d = x.shape[1]
        # Collect pair-wise products
        pairs = []
        for i in range(d):
            for j in range(i + 1, d):
                pairs.append(x[:, i] * x[:, j])
        pairs = torch.stack(pairs, dim=1)   # (B, n_pairs)
        return torch.cat([x, pairs], dim=1)  # (B, d + n_pairs)

    def forward(self, x):
        B = x.shape[0]

        # Feature expansion with interactions
        interact_feats = self._compute_interactions(x)
        h = self.interact_proj(interact_feats)

        # z-gate modulation: z controls how astro params affect output
        z = x[:, 5:6]  # last column = Z
        gate = self.z_gate(z)
        h = h * gate

        # Residual backbone
        for block in self.res_blocks:
            h = block(h)

        return self.head(h)  # (B, 2)


class PreLNResBlock(nn.Module):
    """Pre-LayerNorm residual block (better gradient flow than post-norm)."""
    def __init__(self, dim, dropout=0.1, expansion=4):
        super().__init__()
        inner_dim = dim * expansion
        self.norm1 = nn.LayerNorm(dim)
        self.fc1 = nn.Linear(dim, inner_dim)
        self.act = nn.SiLU()
        self.drop1 = nn.Dropout(dropout)
        self.fc2 = nn.Linear(inner_dim, dim)
        self.drop2 = nn.Dropout(dropout)

    def forward(self, x):
        residual = x
        x = self.norm1(x)
        x = self.fc1(x)
        x = self.act(x)
        x = self.drop1(x)
        x = self.fc2(x)
        x = self.drop2(x)
        return residual + x


# ============================================================
# FourierNet — Fourier Feature Network (Tancik et al., NeurIPS 2020)
# ============================================================
class FourierNet(nn.Module):
    """PhysicsNet augmented with Fourier feature encoding.

    Fourier features map input coordinates to a higher-dimensional
    frequency space via sin/cos encoding, eliminating the spectral
    bias of standard MLPs towards low frequencies. Critical for
    learning the steep z-dependence at z > 20.

    Architecture:
      - Fourier feature encoding of all 6 inputs
      - Explicit pairwise interactions
      - z-gate modulation
      - 6 Pre-LN residual blocks (SiLU, expansion=4)
      - Output: 2 channels [μ in log10 space, log_σ]
    """
    def __init__(self, input_dim=6, n_fourier=128, fourier_scale=1.0,
                 embed_dim=384, n_res_blocks=6, dropout=0.1):
        super().__init__()
        self.input_dim = input_dim
        self.n_fourier = n_fourier

        # Random Gaussian frequency matrix (fixed, not learned)
        B = torch.randn(input_dim, n_fourier) * fourier_scale
        self.register_buffer("freq_B", B)

        ff_dim = input_dim + 2 * n_fourier  # raw + sin + cos

        # Project Fourier features to embed
        self.ff_proj = nn.Sequential(
            nn.Linear(ff_dim, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
        )

        # Explicit pairwise interactions in Fourier space
        n_pairs = input_dim * (input_dim - 1) // 2
        self.interact_proj = nn.Sequential(
            nn.Linear(input_dim + n_pairs, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
        )

        self.res_blocks = nn.ModuleList([
            PreLNResBlock(embed_dim, dropout=dropout, expansion=4)
            for _ in range(n_res_blocks)
        ])

        self.z_gate = nn.Sequential(
            nn.Linear(1, embed_dim),
            nn.Sigmoid(),
        )

        self.head = nn.Sequential(
            nn.Linear(embed_dim, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.LayerNorm(128),
            nn.SiLU(),
            nn.Linear(128, 2),
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_in', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x):
        # Fourier feature encoding
        x_proj = 2 * torch.pi * (x @ self.freq_B)   # (B, n_fourier)
        x_ff = torch.cat([x, torch.sin(x_proj), torch.cos(x_proj)], dim=-1)
        h = self.ff_proj(x_ff)

        # Explicit pairwise interactions (on raw input)
        interact = self._compute_interactions(x)
        h_i = self.interact_proj(interact)
        h = h + h_i

        # z-gate
        z = x[:, 5:6]
        h = h * self.z_gate(z)

        for block in self.res_blocks:
            h = block(h)

        return self.head(h)

    @staticmethod
    def _compute_interactions(x):
        d = x.shape[1]
        pairs = []
        for i in range(d):
            for j in range(i + 1, d):
                pairs.append(x[:, i] * x[:, j])
        pairs = torch.stack(pairs, dim=1)
        return torch.cat([x, pairs], dim=1)


# ============================================================
# DCNv2Net — Deep & Cross Network V2 (Wang et al., WWW 2021)
# ============================================================
class CrossLayerV2(nn.Module):
    """DCN-V2 cross layer: x_{l+1} = x_0 ⊙ (W x_l + b) + x_l.

    W is factorized as U @ V^T for parameter efficiency when rank < d.
    """
    def __init__(self, d, rank=None):
        super().__init__()
        if rank is None or rank >= d:
            self.W = nn.Linear(d, d, bias=True)
            self.is_lowrank = False
        else:
            self.U = nn.Linear(d, rank, bias=False)
            self.V = nn.Linear(rank, d, bias=True)
            self.is_lowrank = True

    def forward(self, x, x0):
        if self.is_lowrank:
            wx = self.V(self.U(x))
        else:
            wx = self.W(x)
        return x0 * wx + x


class CrossNetwork(nn.Module):
    """Stacked DCN-V2 cross layers."""
    def __init__(self, d, n_layers=3, rank=None):
        super().__init__()
        self.layers = nn.ModuleList([
            CrossLayerV2(d, rank=rank) for _ in range(n_layers)
        ])

    def forward(self, x0):
        x = x0
        for layer in self.layers:
            x = layer(x, x0)
        return x


class DCNv2Net(nn.Module):
    """Deep & Cross Network V2 for 21cm power spectrum prediction.

    Architecture:
      - Input: 6 params in [0,1] → embed_dim
      - Cross Network: 4 cross layers [low-rank, rank=32] learn
        arbitrary-degree feature interactions
      - Deep Network: 4 Pre-LN residual blocks capture general patterns
      - Concatenation: cross_output + deep_output → prediction head
      - Output: 2 channels [μ in log10 space, log_σ]

    Key advantage over PhysicsNet:
      Cross layers learn C(d,3), C(d,4), ... interactions, not just
      pairwise. This is essential because 21cm astrophysics involves
      3-way and higher-order parameter interactions (e.g., α×ζ×L_X
      modulates reionization history).
    """
    def __init__(self, input_dim=6, embed_dim=384,
                 n_cross_layers=4, cross_rank=32,
                 n_res_blocks=4, dropout=0.1):
        super().__init__()

        # Input projection
        self.input_proj = nn.Sequential(
            nn.Linear(input_dim, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
        )

        # Cross network for explicit high-order interactions
        self.cross_net = CrossNetwork(embed_dim, n_layers=n_cross_layers,
                                      rank=cross_rank)

        # Deep network
        self.res_blocks = nn.ModuleList([
            PreLNResBlock(embed_dim, dropout=dropout, expansion=4)
            for _ in range(n_res_blocks)
        ])

        # z-gate
        self.z_gate = nn.Sequential(
            nn.Linear(1, embed_dim),
            nn.Sigmoid(),
        )

        # Combine cross + deep: 2 * embed_dim
        self.combine = nn.Sequential(
            nn.Linear(embed_dim * 2, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
            nn.Dropout(dropout),
        )

        self.head = nn.Sequential(
            nn.Linear(embed_dim, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.LayerNorm(128),
            nn.SiLU(),
            nn.Linear(128, 2),
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_in', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, nn.LayerNorm):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)

    def forward(self, x):
        h = self.input_proj(x)

        # Cross network learns high-order feature interactions
        h_cross = self.cross_net(h)

        # Deep network captures general patterns
        h_deep = h
        for block in self.res_blocks:
            h_deep = block(h_deep)

        # z-gate both branches
        z = x[:, 5:6]
        gate = self.z_gate(z)
        h_cross = h_cross * gate
        h_deep = h_deep * gate

        # Combine
        h = torch.cat([h_cross, h_deep], dim=-1)
        h = self.combine(h)

        return self.head(h)


# ============================================================
# FourierCrossNet — Fourier features + Cross Network + Deep Network
# ============================================================
class FourierCrossNet(nn.Module):
    """Ultimate architecture: Fourier features + DCN-V2 Cross + Deep.

    This combines the best of both worlds:
      - Fourier encoding eliminates spectral bias (critical for z-domain)
      - Cross layers learn bounded-degree feature interactions up to
        arbitrary order
      - Deep residual blocks capture general nonlinearities
      - z-gate modulates both branches

    Expected to be the strongest model for achieving sub-1% FE.
    """
    def __init__(self, input_dim=6, n_fourier=128, fourier_scale=1.0,
                 embed_dim=384, n_cross_layers=4, cross_rank=32,
                 n_res_blocks=4, dropout=0.1):
        super().__init__()

        self.n_fourier = n_fourier

        # Random Gaussian frequency matrix (fixed)
        B = torch.randn(input_dim, n_fourier) * fourier_scale
        self.register_buffer("freq_B", B)

        ff_dim = input_dim + 2 * n_fourier

        # Project Fourier features to embed_dim
        self.ff_proj = nn.Sequential(
            nn.Linear(ff_dim, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
        )

        # Cross network
        self.cross_net = CrossNetwork(embed_dim, n_layers=n_cross_layers,
                                      rank=cross_rank)

        # Deep network
        self.res_blocks = nn.ModuleList([
            PreLNResBlock(embed_dim, dropout=dropout, expansion=4)
            for _ in range(n_res_blocks)
        ])

        # Explicit pairwise branch
        n_pairs = input_dim * (input_dim - 1) // 2
        self.interact_proj = nn.Sequential(
            nn.Linear(input_dim + n_pairs, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
        )

        # z-gate
        self.z_gate = nn.Sequential(
            nn.Linear(1, embed_dim),
            nn.Sigmoid(),
        )

        # Combine cross + deep + interact: 3 * embed_dim
        self.combine = nn.Sequential(
            nn.Linear(embed_dim * 3, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
            nn.Dropout(dropout),
        )

        self.head = nn.Sequential(
            nn.Linear(embed_dim, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.LayerNorm(128),
            nn.SiLU(),
            nn.Linear(128, 2),
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_in', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    @staticmethod
    def _compute_interactions(x):
        d = x.shape[1]
        pairs = []
        for i in range(d):
            for j in range(i + 1, d):
                pairs.append(x[:, i] * x[:, j])
        pairs = torch.stack(pairs, dim=1)
        return torch.cat([x, pairs], dim=1)

    def forward(self, x):
        # Fourier feature encoding
        x_proj = 2 * torch.pi * (x @ self.freq_B)
        x_ff = torch.cat([x, torch.sin(x_proj), torch.cos(x_proj)], dim=-1)
        h = self.ff_proj(x_ff)

        # Cross network on Fourier-encoded features
        h_cross = self.cross_net(h)

        # Deep network
        h_deep = h
        for block in self.res_blocks:
            h_deep = block(h_deep)

        # Pairwise interaction branch (on raw input)
        interact = self._compute_interactions(x)
        h_interact = self.interact_proj(interact)

        # z-gate all branches
        z = x[:, 5:6]
        gate = self.z_gate(z)
        h_cross = h_cross * gate
        h_deep = h_deep * gate
        h_interact = h_interact * gate

        # Combine all three branches
        h = torch.cat([h_cross, h_deep, h_interact], dim=-1)
        h = self.combine(h)

        return self.head(h)


# ============================================================
# SinusoidalFourierCrossNet — FourierCrossNet + Sinusoidal z-encoding
# ============================================================
class SinusoidalFourierCrossNet(nn.Module):
    """FourierCrossNet augmented with deterministic sinusoidal z-encoding.

    Motivation:
      The 21cm Δ²₂₁(z) has a characteristic shape — a peak around z≈7-10,
      steep rise at z>15, and gentle decay at z<6. Standard Fourier features
      (random Gaussian matrix) struggle to explicitly capture this z-dependent
      structure because they mix all input dimensions together.

      This architecture adds a **deterministic sinusoidal encoding of z**
      (à la NeRF / Transformer) at multiple octaves. The sin/cos encodings
      at different frequencies give the network direct access to multi-scale
      periodic bases in the z domain, which complements the random Fourier
      features and makes the model explicitly z-aware.

    Key changes from FourierCrossNet:
      1. Sinusoidal z-encoding: L octaves of sin(2^l * π * z) / cos(...)
         projected to embed_dim/2, concatenated with Fourier features
      2. Dual z-modulation: the z-encoded vector gates both cross and
         deep branches, replacing the simple scalar z-gate
      3. The z-encoded vector also serves as a query to an
         attention-style context summary for the prediction head

    Expected improvement: better z-extrapolation and sharper peak capture
    at z≈5-15 where the 21cm signal is strongest.
    """
    def __init__(self, input_dim=6, n_fourier=128, fourier_scale=1.0,
                 embed_dim=384, n_cross_layers=4, cross_rank=32,
                 n_res_blocks=4, dropout=0.1,
                 n_sine_octaves=8):
        super().__init__()

        self.input_dim = input_dim
        self.n_fourier = n_fourier
        self.n_sine_octaves = n_sine_octaves
        sine_dim = 2 * n_sine_octaves  # sin + cos per octave

        # Random Gaussian frequency matrix (fixed) — encodes ALL params
        B = torch.randn(input_dim, n_fourier) * fourier_scale
        self.register_buffer("freq_B", B)

        # Fourier feature dimension: raw + sin(freq) + cos(freq)
        ff_dim = input_dim + 2 * n_fourier

        # Sinusoidal z-encoding projection: z → multi-octave sin/cos → embed_dim//2
        self.z_sine_proj = nn.Sequential(
            nn.Linear(sine_dim, embed_dim // 2),
            nn.LayerNorm(embed_dim // 2),
            nn.SiLU(),
        )

        # Project Fourier features to embed_dim (reduced to make room for z-sine)
        self.ff_proj = nn.Sequential(
            nn.Linear(ff_dim, embed_dim // 2),
            nn.LayerNorm(embed_dim // 2),
            nn.SiLU(),
        )

        # Cross network — operates on combined [FF | z-sine] = embed_dim
        self.cross_net = CrossNetwork(embed_dim, n_layers=n_cross_layers,
                                      rank=cross_rank)

        # Deep network — also embed_dim
        self.res_blocks = nn.ModuleList([
            PreLNResBlock(embed_dim, dropout=dropout, expansion=4)
            for _ in range(n_res_blocks)
        ])

        # Explicit pairwise branch (on raw input)
        n_pairs = input_dim * (input_dim - 1) // 2
        self.interact_proj = nn.Sequential(
            nn.Linear(input_dim + n_pairs, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
        )

        # z-aware modulation: z-sine encoding → modulation vector for cross & deep
        self.z_mod_cross = nn.Sequential(
            nn.Linear(sine_dim, embed_dim),
            nn.Sigmoid(),
        )
        self.z_mod_deep = nn.Sequential(
            nn.Linear(sine_dim, embed_dim),
            nn.Sigmoid(),
        )

        # z-context query: z-sine → query vector to mix with final features
        self.z_query = nn.Sequential(
            nn.Linear(sine_dim, embed_dim // 2),
            nn.LayerNorm(embed_dim // 2),
            nn.SiLU(),
            nn.Linear(embed_dim // 2, embed_dim),
        )

        # Combine: cross(embed) + deep(embed) + interact(embed) + z_query(embed) = 4*embed
        self.combine = nn.Sequential(
            nn.Linear(embed_dim * 4, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
            nn.Dropout(dropout),
        )

        self.head = nn.Sequential(
            nn.Linear(embed_dim, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.LayerNorm(128),
            nn.SiLU(),
            nn.Linear(128, 2),
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_in', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    @staticmethod
    def _sine_encode(z, n_octaves=8):
        """Deterministic sinusoidal positional encoding of z.

        z: (B, 1) normalized to [0, 1]
        Returns: (B, 2*n_octaves) = [sin(2^0*π*z), cos(2^0*π*z), sin(2^1*π*z), ...]
        """
        B = z.shape[0]
        freqs = (2.0 ** torch.arange(n_octaves, device=z.device, dtype=z.dtype)) * torch.pi
        # z: (B, 1), freqs: (n_octaves,) → (B, n_octaves)
        zf = z @ freqs.unsqueeze(0)  # (B, n_octaves)
        return torch.cat([torch.sin(zf), torch.cos(zf)], dim=-1)  # (B, 2*n_octaves)

    @staticmethod
    def _compute_interactions(x):
        d = x.shape[1]
        pairs = []
        for i in range(d):
            for j in range(i + 1, d):
                pairs.append(x[:, i] * x[:, j])
        pairs = torch.stack(pairs, dim=1)
        return torch.cat([x, pairs], dim=1)

    def forward(self, x):
        B = x.shape[0]

        # --- 1. Sinusoidal z-encoding ---
        z = x[:, 5:6]  # (B, 1) — column 5 = Z (normalized to [0,1])
        z_sine = self._sine_encode(z, self.n_sine_octaves)  # (B, 2*L)
        z_sine_feat = self.z_sine_proj(z_sine)               # (B, embed_dim//2)

        # --- 2. Fourier feature encoding (all params) ---
        x_proj = 2 * torch.pi * (x @ self.freq_B)
        x_ff = torch.cat([x, torch.sin(x_proj), torch.cos(x_proj)], dim=-1)
        ff_feat = self.ff_proj(x_ff)  # (B, embed_dim//2)

        # Combine: [FF | z-sine] → full embed_dim
        h = torch.cat([ff_feat, z_sine_feat], dim=-1)  # (B, embed_dim)

        # --- 3. Cross network ---
        h_cross = self.cross_net(h)  # (B, embed_dim)
        z_mod_cross = self.z_mod_cross(z_sine)
        h_cross = h_cross * z_mod_cross

        # --- 4. Deep network ---
        h_deep = h
        for block in self.res_blocks:
            h_deep = block(h_deep)
        z_mod_deep = self.z_mod_deep(z_sine)
        h_deep = h_deep * z_mod_deep

        # --- 5. Pairwise interactions ---
        interact = self._compute_interactions(x)
        h_interact = self.interact_proj(interact)  # (B, embed_dim)

        # --- 6. z-context query ---
        h_zquery = self.z_query(z_sine)  # (B, embed_dim)

        # --- 7. Combine all four branches ---
        h = torch.cat([h_cross, h_deep, h_interact, h_zquery], dim=-1)  # (B, 4*embed_dim)
        h = self.combine(h)

        return self.head(h)


class DensityAwareSineFourierCrossNet(SinusoidalFourierCrossNet):
    """SinusoidalFourierCrossNet with z-grid density awareness.

    Adds a density-weight input: the local Δz spacing at each z-point,
    normalized to [0,1]. This tells the network which z regions are
    sampled more densely (high |dy/dz|) vs sparsely (floor regions).

    Also adds a lightweight TransformerEncoder for cross-z attention
    (curve-level), allowing the network to learn smoothness constraints
    across the full 128-point curve.

    Input: (B, 7) = [5 params + z_norm + dz_norm]
    Output: (B, 2) = [mu_log10, log_sigma]
    """
    def __init__(self, input_dim=7, n_fourier=128, fourier_scale=1.0,
                 embed_dim=384, n_cross_layers=4, cross_rank=32,
                 n_res_blocks=4, dropout=0.1, n_sine_octaves=8,
                 n_transformer_layers=2, transformer_heads=4,
                 transformer_ff=512):
        super().__init__(input_dim=input_dim, n_fourier=n_fourier,
                         fourier_scale=fourier_scale, embed_dim=embed_dim,
                         n_cross_layers=n_cross_layers, cross_rank=cross_rank,
                         n_res_blocks=n_res_blocks, dropout=dropout,
                         n_sine_octaves=n_sine_octaves)

        # Project dz (local spacing) into embed_dim//2
        self.dz_proj = nn.Sequential(
            nn.Linear(1, embed_dim // 4),
            nn.LayerNorm(embed_dim // 4),
            nn.SiLU(),
            nn.Linear(embed_dim // 4, embed_dim // 2),
        )

        # Project [ff_feat | z_sine_feat | dz_feat] → embed_dim
        # ff_feat: embed_dim//2, z_sine_feat: embed_dim//2, dz_feat: embed_dim//2
        self.input_fusion = nn.Sequential(
            nn.Linear((embed_dim // 2) * 3, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.SiLU(),
        )

        # Cross-z attention transformer (operates on (N_curves, 128, embed_dim))
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embed_dim, nhead=transformer_heads,
            dim_feedforward=transformer_ff, dropout=dropout,
            activation='gelu', batch_first=True, norm_first=True,
        )
        self.curve_transformer = nn.TransformerEncoder(
            encoder_layer, num_layers=n_transformer_layers)

    def forward(self, x):
        B = x.shape[0]

        # --- 1. Sinusoidal z-encoding ---
        z = x[:, 5:6]
        z_sine = self._sine_encode(z, self.n_sine_octaves)
        z_sine_feat = self.z_sine_proj(z_sine)  # (B, embed_dim//2)

        # --- 2. Density encoding ---
        dz = x[:, 6:7]
        dz_feat = self.dz_proj(dz)  # (B, embed_dim//2)

        # --- 3. Fourier feature encoding ---
        x_proj = 2 * torch.pi * (x @ self.freq_B)
        x_ff = torch.cat([x, torch.sin(x_proj), torch.cos(x_proj)], dim=-1)
        ff_feat = self.ff_proj(x_ff)  # (B, embed_dim//2)

        # --- 4. Fuse all three: FF + z-sine + dz → embed_dim ---
        h = self.input_fusion(torch.cat([ff_feat, z_sine_feat, dz_feat], dim=-1))

        # --- 5. Cross network ---
        h_cross = self.cross_net(h)
        z_mod_cross = self.z_mod_cross(z_sine)
        h_cross = h_cross * z_mod_cross

        # --- 6. Deep network ---
        h_deep = h
        for block in self.res_blocks:
            h_deep = block(h_deep)
        z_mod_deep = self.z_mod_deep(z_sine)
        h_deep = h_deep * z_mod_deep

        # --- 7. Pairwise interactions ---
        interact = self._compute_interactions(x)
        h_interact = self.interact_proj(interact)

        # --- 8. z-context query ---
        h_zquery = self.z_query(z_sine)

        # --- 9. Combine all four branches ---
        h = torch.cat([h_cross, h_deep, h_interact, h_zquery], dim=-1)
        h = self.combine(h)  # (B, embed_dim)

        # --- 10. Cross-z attention (curve-level) ---
        N_Z = 128
        if B % N_Z == 0 and B >= N_Z:
            n_curves = B // N_Z
            h_seq = h.reshape(n_curves, N_Z, h.shape[-1])
            h_seq = self.curve_transformer(h_seq)
            h = h_seq.reshape(B, h.shape[-1])

        return self.head(h)


def gaussian_nll_loss(pred, target, min_sigma=1e-3, weight=None):
    """pred: (B,2) or (B,N,2) [μ, log_σ]   target: (B,) or (B,N)  →  scalar
    weight: optional (B,) tensor, higher weight = more penalty on that sample"""
    mu = pred[..., 0]
    log_sigma = pred[..., 1]
    sigma = F.softplus(log_sigma) + min_sigma
    diff = (target - mu) / sigma
    loss = 0.5 * diff ** 2 + torch.log(sigma)
    if weight is not None:
        loss = loss * weight
        return loss.sum() / weight.sum()
    return loss.mean()
