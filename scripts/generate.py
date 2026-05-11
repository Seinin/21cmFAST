#!/usr/bin/env python
"""
generate.py - 21cmFAST LHS采样与功率谱生成工具

支持 FDM (Fuzzy Dark Matter) 和 CDM (Cold Dark Matter) 两种模型:
    - FDM: 5个参数，含 m22 (质量转折参数)
    - CDM: 4个参数，无 m22 (标准冷暗物质)

所有参数通过 config.yaml 配置文件设置

Author: Zile Wang
Date: 2026-05-06
"""

import numpy as np
import pandas as pd
from scipy.stats import qmc
import py21cmfast as p21c
import warnings
import os
from pathlib import Path
import yaml
import json

warnings.filterwarnings("ignore")

# 配置文件路径
CONFIG_PATH = Path(__file__).parent / 'config.yaml'

# ============================================================================
# 配置加载
# ============================================================================

def load_full_config(config_path: str = None) -> dict:
    """
    从YAML配置文件加载所有设置
    
    Parameters
    ----------
    config_path : str, optional
        配置文件路径
        
    Returns
    -------
    dict
        完整配置字典
    """
    if config_path is None:
        config_path = CONFIG_PATH
    
    config_path = Path(config_path)
    
    if config_path.exists():
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        print(f"已从 {config_path} 加载配置")
        return config
    else:
        raise FileNotFoundError(f"配置文件 {config_path} 不存在！")

# 加载配置
CONFIG = load_full_config()

# ============================================================================
# 配置访问函数
# ============================================================================

def get_simulation_config() -> dict:
    """获取模拟配置"""
    return CONFIG.get('simulation', {})

def get_model_config(model: str = 'CDM') -> dict:
    """获取指定模型的配置
    
    Parameters
    ----------
    model : str
        'CDM' 或 'FDM'
        
    Returns
    -------
    dict
        模型配置字典
    """
    model = model.upper()
    if model not in ['CDM', 'FDM']:
        raise ValueError(f"未知的模型: {model}，应为 'CDM' 或 'FDM'")
    
    model_config = CONFIG.get(model, {})
    
    return {
        'parameter_ranges': model_config.get('parameter_ranges', {}),
        'n_samples': model_config.get('n_samples', 100),
        'default_params': model_config.get('default_params', {})
    }

def get_redshift_evolution_config() -> dict:
    """获取红移演化曲线配置"""
    return CONFIG.get('redshift_evolution', {})

def get_k_values() -> np.ndarray:
    """获取k值数组"""
    sim_config = get_simulation_config()
    k_min = sim_config.get('k_min', 0.01)
    k_max = sim_config.get('k_max', 10.0)
    n_k_bins = sim_config.get('n_k_bins', 256)
    
    k_edges = np.logspace(np.log10(k_min), np.log10(k_max), n_k_bins + 1)
    k_centers = 10**(0.5 * (np.log10(k_edges[:-1]) + np.log10(k_edges[1:])))
    return k_centers

def get_default_redshifts() -> list:
    """获取默认红移列表"""
    evo_config = get_redshift_evolution_config()
    z_min = evo_config.get('z_min', 5.0)
    z_max = evo_config.get('z_max', 25.0)
    n_redshift = evo_config.get('n_redshift', 10)
    
    return np.linspace(z_min, z_max, n_redshift).tolist()

# ============================================================================
# 默认参数 (用于快速访问)
# ============================================================================
CDM_PARAMETER_RANGES = get_model_config('CDM')['parameter_ranges']
FDM_PARAMETER_RANGES = get_model_config('FDM')['parameter_ranges']
DEFAULT_SIMULATION_CONFIG = get_simulation_config()
    
# ============================================================================
# LHS采样函数
# ============================================================================

def lhs_sampling(n_samples: int, parameter_ranges: dict = None, 
                 seed: int = None, scramble: bool = True) -> pd.DataFrame:# ->语法是返回值的类型，可以帮助IDE自动补全
    """
    执行拉丁超立方采样 (Latin Hypercube Sampling)
    
    Parameters
    ----------
    n_samples : int
        采样数量
    parameter_ranges : dict, optional
        参数范围字典，如果为None则使用默认的DEFAULT_PARAMETER_RANGES
    seed : int, optional
        随机种子
    scramble : bool
        是否打乱样本
        
    Returns
    -------
    pd.DataFrame
        采样结果DataFrame
    """
    if parameter_ranges is None:
        parameter_ranges = DEFAULT_PARAMETER_RANGES
    
    n_params = len(parameter_ranges)
    param_names = list(parameter_ranges.keys())
    
    # 创建LHS sampler
    sampler = qmc.LatinHypercube(d=n_params, seed=seed, scramble=scramble)
    
    # 在[0,1]区间生成样本
    samples_unit = sampler.random(n=n_samples)
    
    # 转换到实际参数范围
    samples = np.zeros_like(samples_unit)
    for i, param_name in enumerate(param_names): #enumerate是一个函数，用于同时返回索引和值，i是索引，param_name是值
        p_min = parameter_ranges[param_name]['min']
        p_max = parameter_ranges[param_name]['max']
        samples[:, i] = p_min + samples_unit[:, i] * (p_max - p_min)# samples_unit是随机种子，每一个维度执行LHS
    # 创建DataFrame
    df = pd.DataFrame(samples, columns=param_names)
    
    return df


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
    k[N//2] = 0
    
    kx, ky, kz = np.meshgrid(k, k, k, indexing='ij')
    k_mag = np.sqrt(kx**2 + ky**2 + kz**2)
    
    fft_bt = np.fft.fftn(brightness_temp)
    ps3d = np.abs(fft_bt)**2 / (N**6) * box_len**3
    
    k_edges = np.logspace(np.log10(k_min), np.log10(k_max), n_bins + 1)
    k_centers = 10**(0.5 * (np.log10(k_edges[:-1]) + np.log10(k_edges[1:])))
    
    pk1d = np.zeros(n_bins)
    
    for i in range(n_bins):
        mask = (k_mag >= k_edges[i]) & (k_mag < k_edges[i+1]) & (k_mag > 0)
        if np.sum(mask) > 0:
            pk1d[i] = np.mean(ps3d[mask])
        else:
            pk1d[i] = np.nan
    
    delta_squared = (k_centers**3 / (2 * np.pi**2)) * pk1d
    
    return k_centers, delta_squared


def run_simulation_for_params(m22: float, alpha: float, zeta: float,
                              Tvir: float, L_X: float,
                              random_seed: int = 42,
                              redshifts: list = None,
                              sim_config: dict = None) -> dict:
    """
    为一组参数运行21cmFAST模拟
    
    Parameters
    ----------
    m22 : float
        FDM转折质量 (log10(Msun))
    alpha : float
        恒星形成幂律指数 (ALPHA_STAR)
    zeta : float
        电离效率因子 (HII_EFF_FACTOR)
    Tvir : float
        最小晕阈值温度 (log10(K))
    L_X : float
        X射线光度 (log10(erg/s))
    random_seed : int
        随机种子
    redshifts : list
        输出红移列表
    sim_config : dict, optional
        模拟配置字典
        
    Returns
    -------
    dict
        包含功率谱和元数据的字典
    """
    if sim_config is None:
        sim_config = DEFAULT_SIMULATION_CONFIG
    
    if redshifts is None:
        redshifts = sim_config['redshifts']
    
    HII_DIM = sim_config['HII_DIM']
    BOX_LEN = sim_config['BOX_LEN']
    
    # 创建输入参数 (新版本py21cmfast API)
    user_params = p21c.UserParams(
        HII_DIM=HII_DIM,
        BOX_LEN=BOX_LEN,
        DIM=3 * HII_DIM,
    )
    astro_params = p21c.AstroParams(
        M_TURN=m22,              # 直接使用log10值
        ALPHA_STAR=alpha,         # 幂律指数
        HII_EFF_FACTOR=zeta,       # 电离效率
        ION_Tvir_MIN=Tvir,        # 直接使用log10值
        L_X=L_X,                  # 直接使用log10值
    )
    flag_options = p21c.FlagOptions(
        USE_MINI_HALOS=False,
    )
    
    # 运行共动场模拟
    coevals = p21c.run_coeval(
        redshift=redshifts,
        user_params=user_params,
        cosmo_params=p21c.CosmoParams(),
        astro_params=astro_params,
        flag_options=flag_options,
        regenerate=False,
        random_seed=random_seed,
    )
    
    # 为每个红移提取功率谱 (使用21cmFAST内置计算)
    results = {
        'redshifts': redshifts,
        'k': None,
        'power_spectra': [],
        'brightness_temp_mean': [],
    }
    
    for coeval in coevals:
        # 获取亮度温度
        bt = coeval.brightness_temp
        
        # 计算功率谱 (手动FFT)
        k, delta_squared = _compute_power_spectrum(bt, BOX_LEN)
        
        if results['k'] is None:
            results['k'] = k
        results['power_spectra'].append(delta_squared)
        results['brightness_temp_mean'].append(float(np.mean(bt)))
    
    results['params'] = {
        'm22': m22,
        'alpha': alpha,
        'zeta': zeta,
        'Tvir': Tvir,
        'L_X': L_X,
    }
    
    return results


# ============================================================================
# CDM 版本函数 (无 m22 参数)
# ============================================================================

def run_cdm_simulation_for_params(alpha: float, zeta: float,
                                   Tvir: float, L_X: float,
                                   random_seed: int = 42,
                                   redshifts: list = None,
                                   sim_config: dict = None) -> dict:
    """
    为一组CDM参数运行21cmFAST模拟 (无FDM质量参数)
    
    Parameters
    ----------
    alpha : float
        恒星形成幂律指数 (ALPHA_STAR)
    zeta : float
        电离效率因子 (HII_EFF_FACTOR)
    Tvir : float
        最小晕阈值温度 (log10(K))
    L_X : float
        X射线光度 (log10(erg/s))
    random_seed : int
        随机种子
    redshifts : list
        输出红移列表
    sim_config : dict, optional
        模拟配置字典
        
    Returns
    -------
    dict
        包含功率谱和元数据的字典
    """
    if sim_config is None:
        sim_config = DEFAULT_SIMULATION_CONFIG
    
    if redshifts is None:
        redshifts = sim_config['redshifts']
    
    HII_DIM = sim_config['HII_DIM']
    BOX_LEN = sim_config['BOX_LEN']
    
    # 创建CDM输入参数 (新版本py21cmfast API)
    user_params = p21c.UserParams(
        HII_DIM=HII_DIM,
        BOX_LEN=BOX_LEN,
        DIM=3 * HII_DIM,
    )
    astro_params = p21c.AstroParams(
        ALPHA_STAR=alpha,         # 幂律指数
        HII_EFF_FACTOR=zeta,       # 电离效率
        ION_Tvir_MIN=Tvir,         # 直接使用log10值
        L_X=L_X,                   # 直接使用log10值
    )
    flag_options = p21c.FlagOptions(
        USE_MINI_HALOS=False,
    )
    
    # 运行共动场模拟
    coevals = p21c.run_coeval(
        redshift=redshifts,
        user_params=user_params,
        cosmo_params=p21c.CosmoParams(),
        astro_params=astro_params,
        flag_options=flag_options,
        regenerate=False,
        random_seed=random_seed,
    )
    
    # 为每个红移提取功率谱
    results = {
        'redshifts': redshifts,
        'k': None,
        'power_spectra': [],
        'brightness_temp_mean': [],
    }
    
    for coeval in coevals:
        # 获取亮度温度
        bt = coeval.brightness_temp
        
        # 计算功率谱
        k, delta_squared = _compute_power_spectrum(bt, BOX_LEN)
        
        if results['k'] is None:
            results['k'] = k
        results['power_spectra'].append(delta_squared)
        results['brightness_temp_mean'].append(float(np.mean(bt)))
    
    results['params'] = {
        'alpha': alpha,
        'zeta': zeta,
        'Tvir': Tvir,
        'L_X': L_X,
    }
    
    return results


def generate_cdm_dataset(n_samples: int = 100,
                        output_dir: str = './cdm_samples',
                        parameter_ranges: dict = None,
                        redshifts: list = None,
                        seed: int = None) -> pd.DataFrame:
    """
    生成完整的CDM数据集
    
    Parameters
    ----------
    n_samples : int
        采样数量
    output_dir : str
        输出目录
    parameter_ranges : dict, optional
        参数范围，如果为None则使用默认的CDM_PARAMETER_RANGES
    redshifts : list, optional
        输出红移列表
    seed : int, optional
        随机种子
        
    Returns
    -------
    pd.DataFrame
        包含所有样本的DataFrame
    """
    import json
    
    if parameter_ranges is None:
        parameter_ranges = CDM_PARAMETER_RANGES
    
    if seed is None:
        seed = DEFAULT_SIMULATION_CONFIG['random_seed_base']
    
    if redshifts is None:
        redshifts = get_default_redshifts()
    
    # 创建输出目录
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"=" * 60)
    print(f"21cmFAST CDM LHS采样生成器")
    print(f"=" * 60)
    print(f"采样数量: {n_samples}")
    print(f"参数范围:")
    for param, info in parameter_ranges.items():
        unit = info.get('unit', '')
        print(f"  {param}: [{info['min']:.2f}, {info['max']:.2f}] {unit}")
    print(f"红移点: {redshifts}")
    print(f"输出目录: {output_dir}")
    print(f"=" * 60)
    
    # 执行LHS采样 (4参数)
    print("\n执行拉丁超立方采样...")
    n_params = len(parameter_ranges)
    param_names = list(parameter_ranges.keys())
    
    sampler = qmc.LatinHypercube(d=n_params, seed=seed, scramble=True)
    samples_unit = sampler.random(n=n_samples)
    
    samples = np.zeros_like(samples_unit)
    for i, param_name in enumerate(param_names):
        p_min = parameter_ranges[param_name]['min']
        p_max = parameter_ranges[param_name]['max']
        samples[:, i] = p_min + samples_unit[:, i] * (p_max - p_min)
    
    lhs_samples = pd.DataFrame(samples, columns=param_names)
    print(f"采样完成! 形状: {lhs_samples.shape}")
    
    # 创建结果存储
    all_results = []
    
    # 为每个样本运行模拟
    print("\n开始CDM模拟...")
    for i, row in lhs_samples.iterrows():
        alpha = row['alpha']
        zeta = row['zeta']
        Tvir = row['Tvir']
        L_X = row['L_X']
        
        print(f"[{i+1}/{n_samples}] 运行模拟: alpha={alpha:.3f}, "
              f"zeta={zeta:.2f}, Tvir={Tvir:.2f}, L_X={L_X:.2f}")
        
        try:
            # 运行CDM模拟
            result = run_cdm_simulation_for_params(
                alpha=alpha,
                zeta=zeta,
                Tvir=Tvir,
                L_X=L_X,
                random_seed=seed + i,
                redshifts=redshifts,
                sim_config=DEFAULT_SIMULATION_CONFIG
            )
            
            # 提取功率谱数据
            for j, (z, ps) in enumerate(zip(redshifts, result['power_spectra'])):
                record = {
                    'sample_id': i,
                    'redshift': z,
                    'alpha': alpha,
                    'zeta': zeta,
                    'Tvir': Tvir,
                    'L_X': L_X,
                }
                
                # 添加功率谱的256个采样点
                for k_idx, pk_val in enumerate(ps):
                    record[f'ps_k{k_idx:03d}'] = pk_val
                
                record['bt_mean'] = result['brightness_temp_mean'][j]
                all_results.append(record)
                
        except Exception as e:
            print(f"  警告: 模拟失败 - {e}")
            continue
        
        # 每10个样本保存一次中间结果
        if (i + 1) % 10 == 0:
            intermediate_df = pd.DataFrame(all_results)
            intermediate_path = output_path / f'cdm_samples_intermediate_{i+1}.csv'
            intermediate_df.to_csv(intermediate_path, index=False)
            print(f"  -> 保存中间结果: {intermediate_path}")
    
    # 创建最终DataFrame
    df = pd.DataFrame(all_results)
    
    # 保存CSV
    csv_path = output_path / 'cdm_samples.csv'
    df.to_csv(csv_path, index=False)
    print(f"\n样本已保存: {csv_path}")
    
    # 保存配置信息
    config = {
        'n_samples': n_samples,
        'model': 'CDM',
        'parameter_ranges': {k: {kk: vv for kk, vv in v.items()} 
                           for k, v in parameter_ranges.items()},
        'redshifts': redshifts,
        'simulation_config': DEFAULT_SIMULATION_CONFIG,
        'seed': seed,
    }
    
    config_path = output_path / 'config.json'
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"配置已保存: {config_path}")
    
    print("\n" + "=" * 60)
    print("CDM数据集生成完成!")
    print(f"总样本数: {len(df)}")
    print("=" * 60)
    
    return df


def generate_fdm_dataset(n_samples: int = 100,
                        output_dir: str = './fdm_samples',
                        parameter_ranges: dict = None,
                        redshifts: list = None,
                        seed: int = None,
                        config_path: str = None) -> pd.DataFrame:
    """
    生成完整的FDM数据集
    
    Parameters
    ----------
    n_samples : int
        采样数量
    output_dir : str
        输出目录
    parameter_ranges : dict, optional
        参数范围，如果为None则从配置文件加载
    redshifts : list, optional
        输出红移列表
    seed : int, optional
        随机种子
    config_path : str, optional
        配置文件路径
        
    Returns
    -------
    pd.DataFrame
        包含所有样本的DataFrame
    """
    # 加载配置
    config = load_full_config(config_path) if config_path else CONFIG
    sim_config = config.get('simulation', {})
    
    if parameter_ranges is None:
        parameter_ranges = config.get('FDM', {}).get('parameter_ranges', {})
    
    # 创建输出目录
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"=" * 60)
    print(f"21cmFAST LHS采样生成器")
    print(f"=" * 60)
    print(f"采样数量: {n_samples}")
    print(f"参数范围:")
    for param, info in parameter_ranges.items():
        unit = info.get('unit', '')
        print(f"  {param}: [{info['min']:.2f}, {info['max']:.2f}] {unit}")
    print(f"红移点: {redshifts}")
    print(f"输出目录: {output_dir}")
    print(f"=" * 60)
    
    # 执行LHS采样
    print("\n执行拉丁超立方采样...")
    lhs_samples = lhs_sampling(n_samples, parameter_ranges, seed=seed)
    print(f"采样完成! 形状: {lhs_samples.shape}")
    
    # 创建结果存储
    all_results = []
    
    # 为每个样本运行模拟
    print("\n开始模拟...")
    for i, row in lhs_samples.iterrows():
        m22 = row['m22']
        alpha = row['alpha']
        zeta = row['zeta']
        Tvir = row['Tvir']
        L_X = row['L_X']
        
        print(f"[{i+1}/{n_samples}] 运行模拟: m22={m22:.3f}, alpha={alpha:.3f}, "
              f"zeta={zeta:.2f}, Tvir={Tvir:.2f}, L_X={L_X:.2f}")
        
        try:
            # 运行模拟
            result = run_simulation_for_params(
                m22=m22,
                alpha=alpha,
                zeta=zeta,
                Tvir=Tvir,
                L_X=L_X,
                random_seed=seed + i,
                redshifts=redshifts,
                sim_config=sim_config
            )
            
            # 提取功率谱数据
            for j, (z, ps) in enumerate(zip(redshifts, result['power_spectra'])):
                record = {
                    'sample_id': i,
                    'redshift': z,
                    'm22': m22,
                    'alpha': alpha,
                    'zeta': zeta,
                    'Tvir': Tvir,
                    'L_X': L_X,
                }
                
                # 添加功率谱的256个采样点
                for k_idx, pk_val in enumerate(ps):
                    record[f'ps_k{k_idx:03d}'] = pk_val
                
                record['bt_mean'] = result['brightness_temp_mean'][j]
                all_results.append(record)
                
        except Exception as e:
            print(f"  警告: 模拟失败 - {e}")
            continue
        
        # 每10个样本保存一次中间结果
        if (i + 1) % 10 == 0:
            intermediate_df = pd.DataFrame(all_results)
            intermediate_path = output_path / f'samples_intermediate_{i+1}.csv'
            intermediate_df.to_csv(intermediate_path, index=False)
            print(f"  -> 保存中间结果: {intermediate_path}")
    
    # 创建最终DataFrame
    df = pd.DataFrame(all_results)
    
    # 保存CSV
    csv_path = output_path / 'fdm_samples.csv'
    df.to_csv(csv_path, index=False)
    print(f"\n样本已保存: {csv_path}")
    
    # 同时保存参数范围和配置信息
    config = {
        'n_samples': n_samples,
        'parameter_ranges': {k: {kk: vv for kk, vv in v.items()} 
                           for k, v in parameter_ranges.items()},
        'redshifts': redshifts,
        'simulation_config': sim_config,
        'seed': seed,
    }
    
    import json
    config_path = output_path / 'config.json'
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"配置已保存: {config_path}")
    
    print("\n" + "=" * 60)
    print("生成完成!")
    print(f"总样本数: {len(df)}")
    print(f"功率谱维度: {sim_config['n_k_bins']}")
    print("=" * 60)
    
    return df


def load_and_plot_sample(sample_path: str, sample_id: int = 0, 
                         redshift_idx: int = 2):
    """
    加载并绘制一个样本的功率谱
    
    Parameters
    ----------
    sample_path : str
        CSV文件路径
    sample_id : int
        样本ID
    redshift_idx : int
        红移索引
    """
    import matplotlib.pyplot as plt
    
    df = pd.read_csv(sample_path)
    
    # 筛选特定样本和红移
    sample = df[(df['sample_id'] == sample_id) & (df['redshift'] == df['redshift'].unique()[redshift_idx])]
    
    if len(sample) == 0:
        print(f"未找到样本 ID={sample_id}, redshift_idx={redshift_idx}")
        return
    
    # 提取功率谱数据
    ps_cols = [col for col in df.columns if col.startswith('ps_k')]
    k_values = np.arange(len(ps_cols))
    ps_values = sample[ps_cols].values.flatten()
    
    # 绘图
    fig, ax = plt.subplots(1, 1, figsize=(8, 6))
    ax.loglog(k_values, ps_values, 'b-', linewidth=1.5)
    ax.set_xlabel('k [Mpc^-1]')
    ax.set_ylabel('P(k) [mK^2 Mpc^3]')
    ax.set_title(f"21cm功率谱 (Sample {sample_id}, z={sample['redshift'].values[0]:.1f})")
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(f'sample_{sample_id}_power_spectrum.png', dpi=150)
    print(f"图像已保存: sample_{sample_id}_power_spectrum.png")


# ============================================================================
# 主函数
# ============================================================================

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(
        description='21cmFAST LHS采样与功率谱生成工具 (支持 FDM 和 CDM)'
    )
    parser.add_argument(
        '-m', '--model',
        type=str,
        choices=['FDM', 'CDM'],
        default='CDM',
        help='选择模型: FDM (含m22参数) 或 CDM (标准冷暗物质)'
    )
    parser.add_argument(
        '-n', '--n_samples',
        type=int,
        default=None,
        help='采样数量 (默认: 从config.yaml读取)'
    )
    parser.add_argument(
        '-o', '--output',
        type=str,
        default=None,
        help='输出目录 (默认: ./fdm_samples 或 ./cdm_samples)'
    )
    parser.add_argument(
        '--seed',
        type=int,
        default=None,
        help='随机种子 (默认: 从config.yaml读取)'
    )
    parser.add_argument(
        '--test',
        action='store_true',
        help='运行测试模式 (只生成1个样本)'
    )
    parser.add_argument(
        '--show-config',
        action='store_true',
        help='显示当前配置并退出'
    )
    
    args = parser.parse_args()
    
    # 显示配置
    # 显示配置
    if args.show_config:
        print("=" * 70)
        print("当前配置 (config.yaml)")
        print("=" * 70)
        cd = get_model_config('CDM')
        fd = get_model_config('FDM')
        print(f"\n【CDM 参数范围】")
        for param, info in cd['parameter_ranges'].items():
            print(f"  {param}: [{info['min']}, {info['max']}] {info.get('unit', '')}")
        print(f"\n【FDM 参数范围】")
        for param, info in fd['parameter_ranges'].items():
            print(f"  {param}: [{info['min']}, {info['max']}] {info.get('unit', '')}")
        print(f"\n【模拟配置】")
        sim = get_simulation_config()
        for key, val in sim.items():
            print(f"  {key}: {val}")
        print(f"\n【红移演化配置】")
        evo = get_redshift_evolution_config()
        for key, val in evo.items():
            print(f"  {key}: {val}")
        exit(0)
    
    # 获取模型配置
    model_config = get_model_config(args.model)
    
    # 设置默认输出目录
    if args.output is None:
        args.output = f'./{args.model.lower()}_samples'
    
    # 设置采样数量
    if args.test:
        print(f"测试模式: 只生成1个样本 ({args.model})")
        n_samples = 1
    elif args.n_samples is not None:
        n_samples = args.n_samples
    else:
        n_samples = model_config['n_samples']
        print(f"使用配置文件中的采样数量: {n_samples}")
    
    # 根据模型生成数据集
    if args.model == 'FDM':
        print(f"\n{'='*60}")
        print(f"开始生成 FDM 数据集")
        print(f"{'='*60}")
        df = generate_fdm_dataset(
            n_samples=n_samples,
            output_dir=args.output,
            seed=args.seed
        )
    else:
        print(f"\n{'='*60}")
        print(f"开始生成 CDM 数据集")
        print(f"{'='*60}")
        df = generate_cdm_dataset(
            n_samples=n_samples,
            output_dir=args.output,
            seed=args.seed
        )
    
    # 打印数据概览
    print("\n数据概览:")
    print(df.head())
    print(f"\n数据形状: {df.shape}")
