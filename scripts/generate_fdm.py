#!/usr/bin/env python
"""
generate_fdm.py - 21cmFAST FDM (Fuzzy Dark Matter) 功率谱随红移演化生成工具

与 generate.py 功能一致，但额外引入 M_TURN 参数模拟模糊暗物质的效应。
M_TURN 是临界质量 (log10(Msun))，低于此质量的 halo 会受到 FDM 的抑制。

Usage:
    python generate_fdm.py
    python generate_fdm.py --seed 123
"""

import logging
import warnings
import os
from pathlib import Path

import yaml
import numpy as np
import matplotlib.pyplot as plt

import py21cmfast as p21c

warnings.filterwarnings("ignore")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

logger = logging.getLogger("py21cmfast")
logger.setLevel(logging.INFO)

# ============================================================================
# 配置加载
# ============================================================================

CONFIG_PATH = Path(__file__).parent / 'config_fdm.yaml'


def load_config() -> dict:
    """从 config_fdm.yaml 加载配置"""
    with open(CONFIG_PATH, 'r') as f:
        config = yaml.safe_load(f)
    print(f"已从 {CONFIG_PATH} 加载配置")
    return config


# ============================================================================
# 功率谱计算
# ============================================================================

def _compute_power_spectrum(brightness_temp: np.ndarray,
                            box_len: float,
                            n_bins: int = 256,
                            k_min: float = 0.01,
                            k_max: float = 10.0) -> tuple:
    """
    计算21cm无量纲功率谱 Δ²₂₁(k)

    Δ²(k) = k³/(2π²) × P(k)
    """
    N = brightness_temp.shape[0]
    cell_size = box_len / N

    k = np.fft.fftfreq(N, d=cell_size) * 2 * np.pi
    k[N // 2] = 0

    kx, ky, kz = np.meshgrid(k, k, k, indexing='ij')
    k_mag = np.sqrt(kx**2 + ky**2 + kz**2)

    fft_bt = np.fft.fftn(brightness_temp)
    ps3d = np.abs(fft_bt)**2 / (N**6) * box_len**3

    k_edges = np.logspace(np.log10(k_min), np.log10(k_max), n_bins + 1)
    k_centers = 10**(0.5 * (np.log10(k_edges[:-1]) + np.log10(k_edges[1:])))

    pk1d = np.zeros(n_bins)
    for i in range(n_bins):
        mask = (k_mag >= k_edges[i]) & (k_mag < k_edges[i + 1]) & (k_mag > 0)
        if np.sum(mask) > 0:
            pk1d[i] = np.mean(ps3d[mask])
        else:
            pk1d[i] = np.nan

    delta_squared = (k_centers**3 / (2 * np.pi**2)) * pk1d
    return k_centers, delta_squared


# ============================================================================
# 模拟运行
# ============================================================================

def run_simulation(config: dict, seed: int = None) -> dict:
    """
    使用模板运行单组参数的21cmFAST FDM模拟。

    FDM 与 CDM 的核心区别在于 AstroParams 中包含了 M_TURN 参数：
    M_TURN 为转折质量 (log10(Msun))，抑制小质量晕中的恒星形成，
    模拟模糊暗物质 (FDM) 对宇宙大尺度结构的效应。
    """
    sim = config['simulation']
    astro = config.get('astro_params', {})
    template_name = config.get('template', 'simple')

    if seed is None:
        seed = sim.get('random_seed', 42)

    # 生成红移列表
    z_min = sim['z_min']
    z_max = sim['z_max']
    n_redshift = sim['n_redshift']
    redshifts = np.linspace(z_min, z_max, n_redshift).tolist()

    HII_DIM = sim['HII_DIM']
    BOX_LEN = sim['BOX_LEN']

    print(f"\n{'='*60}")
    print(f"运行21cmFAST FDM模拟  (template: {template_name})")
    print(f"{'='*60}")
    print(f"网格: {HII_DIM}³, 盒子大小: {BOX_LEN} Mpc")
    print(f"天体物理参数 (含FDM):")
    for key, val in astro.items():
        print(f"  {key} = {val}")
    print(f"红移: {z_min} → {z_max} (共{n_redshift}个点)")
    print(f"随机种子: {seed}")
    print(f"{'='*60}")

    # ---------- 使用模板创建参数 ----------
    # InputParameters.from_template() 一步加载模板并用配置文件值覆盖
    inputs = p21c.InputParameters.from_template(
        template_name,
        BOX_LEN=BOX_LEN,
        HII_DIM=HII_DIM,
        **astro,                # 天体物理参数覆盖 (包含 M_TURN)
        random_seed=seed,
    )

    # 运行共动场模拟
    coevals = p21c.run_coeval(
        inputs=inputs,
        out_redshifts=redshifts,
    )

    # 提取结果
    results = {
        'redshifts': [],
        'k_values': None,
        'power_spectra': [],
        'brightness_temp_mean': [],
    }

    print(f"\n计算功率谱...")
    for coeval in coevals:
        bt = coeval.brightness_temp
        k, delta_squared = _compute_power_spectrum(
            bt, BOX_LEN,
            n_bins=sim.get('n_k_bins', 256),
            k_min=sim.get('k_min', 0.01),
            k_max=sim.get('k_max', 10.0),
        )

        if results['k_values'] is None:
            results['k_values'] = k
        results['redshifts'].append(coeval.redshift)
        results['power_spectra'].append(delta_squared)
        results['brightness_temp_mean'].append(float(np.mean(bt)))
        print(f"  z = {coeval.redshift:6.2f}  |  <δTb> = {results['brightness_temp_mean'][-1]:8.2f} mK")

    print(f"\n模拟完成! 成功处理 {len(results['redshifts'])}/{n_redshift} 个红移点")
    return results


# ============================================================================
# 绘图
# ============================================================================

def plot_power_spectrum_evolution(results: dict, config: dict, output_dir: str = None):
    """绘制功率谱随红移的演化（双图）。"""
    if output_dir is None:
        output_dir = SCRIPT_DIR

    redshifts = np.array(results['redshifts'])
    k_values = results['k_values']
    power_spectra = np.array(results['power_spectra'])
    k_targets = config['simulation'].get('k_targets', [0.1, 0.42, 1.0])

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5))

    # ---- 左图: Δ²(k) vs 红移 ----
    ax = axes[0]
    colors = ['#e41a1c', '#377eb8', '#4daf4a']

    for i, k_tgt in enumerate(k_targets):
        k_idx = np.argmin(np.abs(k_values - k_tgt))
        k_actual = k_values[k_idx]

        delta2_vs_z = power_spectra[:, k_idx]
        valid = ~np.isnan(delta2_vs_z)

        ax.semilogy(
            redshifts[valid], delta2_vs_z[valid],
            'o-', color=colors[i % len(colors)],
            markersize=4, linewidth=1.5,
            label=f'k ≈ {k_actual:.2f} Mpc⁻¹'
        )

    ax.set_xlabel('Redshift z', fontsize=12)
    ax.set_ylabel('Δ²₂₁(k)', fontsize=12)
    ax.set_title('FDM Power Spectrum vs Redshift', fontsize=13)
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)

    # ---- 右图: Δ²(k) vs k (选定几个红移的快照) ----
    ax = axes[1]
    n_z = len(redshifts)
    z_indices = [0, n_z // 3, 2 * n_z // 3, n_z - 1]
    z_indices = [i for i in z_indices if i < n_z and i < len(power_spectra)]

    for idx in z_indices:
        ps = power_spectra[idx]
        valid = ~np.isnan(ps)
        ax.loglog(
            k_values[valid], ps[valid],
            '-', linewidth=1.3,
            label=f'z = {redshifts[idx]:.1f}'
        )

    ax.set_xlabel('k [Mpc⁻¹]', fontsize=12)
    ax.set_ylabel('Δ²₂₁(k)', fontsize=12)
    ax.set_title('FDM Power Spectrum at Selected Redshifts', fontsize=13)
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()

    plot_path = os.path.join(output_dir, 'power_spectrum_fdm_vs_redshift.png')
    fig.savefig(plot_path, dpi=150, bbox_inches='tight')
    print(f"\n图像已保存: {plot_path}")

    return fig, axes


# ============================================================================
# 主函数
# ============================================================================

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(
        description='21cmFAST FDM 功率谱随红移演化生成工具'
    )
    parser.add_argument(
        '--seed', type=int, default=None,
        help='随机种子 (默认: 从config.yaml读取)'
    )
    parser.add_argument(
        '--show-config', action='store_true',
        help='显示当前配置并退出'
    )

    args = parser.parse_args()

    config = load_config()

    if args.show_config:
        print("\n" + "=" * 60)
        print("当前配置 (config_fdm.yaml)")
        print("=" * 60)
        print(f"\n模板: {config.get('template', 'simple')}")
        print(f"\n模拟配置:")
        for key, val in config['simulation'].items():
            print(f"  {key}: {val}")
        print(f"\n天体物理参数 (含FDM):")
        for key, val in config['astro_params'].items():
            print(f"  {key}: {val}")
        exit(0)

    results = run_simulation(config, seed=args.seed)

    plot_power_spectrum_evolution(results, config)

    print("\n完成!")
