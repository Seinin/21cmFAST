#!/usr/bin/env python
"""反解 mcrit_CDM = 3.314e7 (1+z)^-1.5 中系数的物理含义。

目的
----
1. 用 21cmFAST 的 TtoM（或等价解析式）反推：给定 z，使 TtoM(z,T,mu) 恰等于
   3.314e7 (1+z)^-1.5 的 T_vir 是多少？若 T 近似与 z 无关，则该系数对应一个
   "特征维里温度" —— 这就是 3.314e7 的物理来源。
2. 检验指数是否精确为 -1.5（TtoM 含 Omega_m(z)、Delta_c(z) 的 z 依赖，
   严格说不是纯幂律）。
3. 同时给出 mini-halo 常用的 mu=1.22（中性）与 mu=0.6（电离）两种情形。
"""
import numpy as np

# ---- 宇宙学参数（与 thermochem.c 默认一致）----
H = 0.6766
OMm = 0.3111
OMl = 1.0 - OMm
COEF = 7030.97


def Omega_m_z(z):
    a = 1.0 / (1.0 + z)
    return OMm * a ** -3 / (OMm * a ** -3 + OMl)


def delta_c(z):
    """Bryan & Norman (1998) 拟合：Delta_c(z) = 18pi^2 + 82x - 39x^2, x = Omega_m(z)-1."""
    x = Omega_m_z(z) - 1.0
    return 18.0 * np.pi ** 2 + 82.0 * x - 39.0 * x ** 2


def TtoM(z, T, mu):
    """21cmFAST cosmology.c 的 TtoM，单位 M_sun。"""
    return (COEF / H) * np.sqrt(Omega_m_z(z) / (OMm * delta_c(z))) * (T / (mu * (1 + z))) ** 1.5


def M_to_T_vir(z, M, mu):
    """TtoM 的反函数。"""
    return mu * (1 + z) * (M / ((COEF / H) * np.sqrt(Omega_m_z(z) / (OMm * delta_c(z))))) ** (2.0 / 3.0)


A_FIT = 3.314e7


def mcrit_fit(z):
    return A_FIT * (1 + z) ** -1.5


def main():
    print("=" * 96)
    print("反解 mcrit_CDM(z) = 3.314e7 (1+z)^-1.5  对应的特征维里温度 T_vir")
    print("=" * 96)
    print(f"宇宙学：h={H}, Omega_m={OMm}, Omega_L={OMl:.4f}")
    print()
    print(f"{'z':>5} {'mcrit_fit [Msun]':>17} {'T_vir(mu=1.22)':>15} {'T_vir(mu=0.6)':>13}")
    print("-" * 96)
    Ts122, Ts06 = [], []
    for z in (5, 10, 15, 20, 25, 30, 40):
        M = mcrit_fit(z)
        t122 = M_to_T_vir(z, M, 1.22)
        t06 = M_to_T_vir(z, M, 0.6)
        Ts122.append(t122)
        Ts06.append(t06)
        print(f"{z:>5} {M:>17.4e} {t122:>15.1f} {t06:>13.1f}")
    print("-" * 96)
    print(f"mu=1.22（中性气体）：T_vir = {np.mean(Ts122):7.1f} +/- {np.std(Ts122):5.1f} K")
    print(f"mu=0.60（电离气体）：T_vir = {np.mean(Ts06):7.1f} +/- {np.std(Ts06):5.1f} K")

    # ---- 检验幂律指数 ----
    print()
    print("=" * 96)
    print("检验指数：对 mcrit_fit 做 log-log 线性拟合 d lnM / d ln(1+z)")
    print("=" * 96)
    zz = np.logspace(np.log10(5), np.log10(40), 50)
    lnx = np.log(1 + zz)
    lny = np.log(mcrit_fit(zz))
    slope, intercept = np.polyfit(lnx, lny, 1)
    print(f"拟合斜率 = {slope:.6f}   （预期 -1.5）")
    print(f"截距 exp = {np.exp(intercept):.6e}  （预期 {A_FIT:.6e}）")

    # ---- 若用"真"TtoM 固定温度反算，指数偏离多少 ----
    print()
    print("=" * 96)
    print("对照：若以固定 T_vir 用 TtoM 计算 M(z)，实际指数偏离 -1.5 多少")
    print("（TtoM 含 Omega_m(z)、Delta_c(z) 的 z 依赖，故非严格幂律）")
    print("=" * 96)
    for Tfix in (600.0, 1000.0, 1400.0):
        Ms = np.array([TtoM(z, Tfix, 1.22) for z in zz])
        s, _ = np.polyfit(lnx, np.log(Ms), 1)
        print(f"  T_vir = {Tfix:6.0f} K (mu=1.22):  实际斜率 = {s:.4f}   偏离 -1.5 达 {abs(s+1.5):.4f}")

    print()
    print("=" * 96)
    print("结论提示：")
    print("  · 指数 -1.5 是维里标度 M ∝ T^{3/2}(1+z)^{-3/2} 在 T 固定时的结果（解析来源）")
    print("  · 前置因子 3.314e7 等价于在某个特征 T_vir 下由 TtoM 给出的归一化；")
    print("    上表即该特征温度 —— 它是 Fialkov+12 对 Stacy+11/Greif+11 模拟的拟合值，")
    print("    而非纯解析推导（解析只能给出指数，给不出绝对归一化）。")
    print("=" * 96)


if __name__ == "__main__":
    main()
