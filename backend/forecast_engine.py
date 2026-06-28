"""
Forecast Engine — multi-model ensemble for expected return and volatility forecasting.

Models:
  1. GARCH(1,1)          — time-varying volatility forecast
  2. EWMA Returns        — exponentially weighted mean return (recency-biased)
  3. Momentum Forecast   — cross-sectional 1/3/6/12-month momentum signals
  4. Mean Reversion      — Ornstein-Uhlenbeck speed-of-reversion signal
  5. Regime Detection    — bull / neutral / bear classification via rolling metrics
  6. James-Stein Shrinkage — shrink individual means toward cross-sectional grand mean
  Ensemble: weighted blend of models 2-5, volatility from GARCH vs historical blend.
"""

import numpy as np
import pandas as pd
from typing import Optional


# ─────────────────────────────────────────────────────────────
# 1. GARCH(1,1) — manual implementation (variance targeting)
# ─────────────────────────────────────────────────────────────
def garch_forecast(returns: np.ndarray, alpha: float = 0.10, beta: float = 0.85) -> dict:
    """
    Fit GARCH(1,1) via variance targeting and produce 1-step-ahead vol forecast.
    sigma2_t = omega + alpha * r2_{t-1} + beta * sigma2_{t-1}
    omega is pinned so unconditional variance = historical variance.
    """
    r = np.asarray(returns, dtype=float)
    n = len(r)
    if n < 12:
        hist_vol = float(np.std(r))
        return {
            "forecast_monthly_vol": hist_vol,
            "longrun_monthly_vol": hist_vol,
            "current_monthly_vol": hist_vol,
            "persistence": alpha + beta,
            "vol_regime": "unknown",
        }

    var_hist = float(np.var(r))
    persistence = alpha + beta
    if persistence >= 1.0:
        alpha, beta = 0.09, 0.84
        persistence = alpha + beta

    omega = var_hist * (1.0 - persistence)

    sigma2 = np.empty(n)
    sigma2[0] = var_hist
    for t in range(1, n):
        sigma2[t] = omega + alpha * r[t - 1] ** 2 + beta * sigma2[t - 1]

    # 1-step-ahead forecast
    forecast_var = omega + alpha * r[-1] ** 2 + beta * sigma2[-1]
    longrun_var = omega / (1.0 - persistence)

    current_vol = float(np.sqrt(sigma2[-1]))
    forecast_vol = float(np.sqrt(forecast_var))
    longrun_vol = float(np.sqrt(longrun_var))

    # Vol regime: compare current to long-run
    ratio = current_vol / longrun_vol if longrun_vol > 0 else 1.0
    vol_regime = "elevated" if ratio > 1.25 else "compressed" if ratio < 0.75 else "normal"

    return {
        "forecast_monthly_vol": forecast_vol,
        "longrun_monthly_vol": longrun_vol,
        "current_monthly_vol": current_vol,
        "persistence": round(persistence, 4),
        "vol_regime": vol_regime,
        "sigma2_series": sigma2.tolist(),
    }


# ─────────────────────────────────────────────────────────────
# 2. EWMA Return Forecast
# ─────────────────────────────────────────────────────────────
def ewma_return_forecast(returns: np.ndarray, halflife: int = 6) -> float:
    """Exponentially weighted mean — recent returns count more."""
    r = np.asarray(returns, dtype=float)
    n = len(r)
    decay = 0.5 ** (1.0 / halflife)
    weights = np.array([decay ** (n - 1 - i) for i in range(n)])
    weights /= weights.sum()
    return float(weights @ r)


# ─────────────────────────────────────────────────────────────
# 3. Momentum Forecast
# ─────────────────────────────────────────────────────────────
def momentum_forecast(returns: np.ndarray) -> dict:
    """
    Blend 1-, 3-, 6-, 12-month trailing returns into a momentum signal.
    Skips the most recent month (Jegadeesh-Titman reversal avoidance).
    """
    r = np.asarray(returns, dtype=float)

    def trailing(months):
        if len(r) < months + 1:
            return None
        window = r[-(months + 1):-1]   # skip last month
        return float((1 + window).prod() - 1)

    m1  = trailing(1)
    m3  = trailing(3)
    m6  = trailing(6)
    m12 = trailing(12)

    valid = [v for v in [m1, m3, m6, m12] if v is not None]
    weights = [0.10, 0.20, 0.30, 0.40][4 - len(valid):]

    if not valid:
        return {"signal": 0.0, "m1": None, "m3": None, "m6": None, "m12": None}

    blended = sum(w * v for w, v in zip(weights, valid))
    # Annualise the blended signal
    annualised = blended * 12 / 6  # rough annualisation of ~6m momentum

    return {
        "signal": float(annualised),
        "m1": m1, "m3": m3, "m6": m6, "m12": m12,
    }


# ─────────────────────────────────────────────────────────────
# 4. Mean-Reversion Signal (Ornstein-Uhlenbeck style)
# ─────────────────────────────────────────────────────────────
def mean_reversion_signal(returns: np.ndarray, lookback: int = 24) -> dict:
    """
    Estimate how far the asset is from its long-run mean return.
    Positive signal = below mean → upward reversion expected.
    Uses z-score of trailing cumulative return vs long-run cum. return.
    """
    r = np.asarray(returns, dtype=float)
    if len(r) < lookback:
        return {"signal": 0.0, "z_score": 0.0}

    window = r[-lookback:]
    cum_ret = float((1 + window).prod() - 1)
    mu = float(window.mean()) * lookback
    sigma = float(window.std()) * np.sqrt(lookback)

    z = -(cum_ret - mu) / sigma if sigma > 0 else 0.0   # negative: expensive, positive: cheap
    # Convert z to annualised return signal (conservative scaling)
    signal = z * float(window.std()) * 2.0

    return {"signal": float(signal), "z_score": round(float(z), 3)}


# ─────────────────────────────────────────────────────────────
# 5. Regime Detector
# ─────────────────────────────────────────────────────────────
def detect_regime(returns: np.ndarray, market_returns: Optional[np.ndarray] = None) -> dict:
    """
    Classify market regime using rolling Sharpe, vol trend, and drawdown.
    Returns: bull | neutral | bear
    """
    r = np.asarray(returns, dtype=float)
    n = len(r)
    if n < 6:
        return {"regime": "neutral", "regime_score": 0.0, "confidence": "low"}

    RF_MONTHLY = 0.045 / 12

    # Rolling 6-month Sharpe
    recent6 = r[-6:]
    sharpe6 = (recent6.mean() - RF_MONTHLY) / (recent6.std() + 1e-8) * np.sqrt(12)

    # Vol trend: recent 3m vs prior 3m
    if n >= 6:
        vol_recent = r[-3:].std()
        vol_prior  = r[-6:-3].std()
        vol_trend  = vol_recent / (vol_prior + 1e-8)  # >1 = rising vol = bearish
    else:
        vol_trend = 1.0

    # Short-term momentum (3m)
    mom3 = float((1 + r[-3:]).prod() - 1) if n >= 3 else 0.0

    # Drawdown from peak
    cum = (1 + r).cumprod()
    drawdown = float((cum[-1] / cum.max()) - 1)

    # Score: +2 bull signals vs -2 bear signals → range [-4, +4]
    score = 0.0
    score += 1.5 if sharpe6 > 0.8  else (-1.5 if sharpe6 < -0.5 else 0.0)
    score += 1.0 if mom3 > 0.03    else (-1.0 if mom3 < -0.05 else 0.0)
    score += 0.5 if vol_trend < 0.9 else (-0.5 if vol_trend > 1.3 else 0.0)
    score += 1.0 if drawdown > -0.05 else (-1.0 if drawdown < -0.15 else 0.0)

    if score >= 1.5:
        regime = "bull"
    elif score <= -1.0:
        regime = "bear"
    else:
        regime = "neutral"

    confidence = "high" if abs(score) >= 2.5 else "medium" if abs(score) >= 1.5 else "low"

    return {
        "regime": regime,
        "regime_score": round(score, 2),
        "confidence": confidence,
        "sharpe_6m": round(sharpe6, 2),
        "vol_trend": round(vol_trend, 2),
        "drawdown_from_peak": round(drawdown * 100, 2),
        "momentum_3m": round(mom3 * 100, 2),
    }


# ─────────────────────────────────────────────────────────────
# 6. James-Stein Shrinkage for Return Estimates
# ─────────────────────────────────────────────────────────────
def james_stein_shrink(raw_forecasts: dict[str, float]) -> dict[str, float]:
    """
    Shrink individual return estimates toward the cross-sectional grand mean.
    Reduces estimation error — heavily used in institutional PM.
    Shrinkage intensity derived analytically.
    """
    tickers = list(raw_forecasts.keys())
    mu = np.array([raw_forecasts[t] for t in tickers])
    n = len(mu)
    if n < 3:
        return raw_forecasts

    grand_mean = mu.mean()
    deviations = mu - grand_mean
    ss = float(deviations @ deviations)

    # James-Stein shrinkage factor (positive-part)
    shrink_factor = max(0.0, 1.0 - (n - 2) / (ss * n + 1e-8))
    shrunk = grand_mean + shrink_factor * deviations

    return {t: float(shrunk[i]) for i, t in enumerate(tickers)}


# ─────────────────────────────────────────────────────────────
# Master Ensemble Forecast
# ─────────────────────────────────────────────────────────────
def ensemble_forecast(market_data: dict) -> dict:
    """
    For each asset produce:
      - forecasted_annual_return   (ensemble of EWMA + momentum + mean-reversion)
      - forecasted_annual_vol      (GARCH-blended)
      - forecasted_sharpe          (derived)
      - regime                     (bull/neutral/bear)
      - garch_details              (vol_regime, persistence)
    """
    results = {}
    raw_returns: dict[str, float] = {}

    for ticker, data in market_data.items():
        r = np.array(data["monthly_returns"], dtype=float)
        if len(r) < 6:
            r = np.random.normal(data["ann_return"] / 12, data["ann_vol"] / np.sqrt(12), 36)

        # --- Volatility: 70% GARCH forecast, 30% historical ---
        garch = garch_forecast(r)
        hist_monthly_vol = float(np.std(r))
        blended_monthly_vol = 0.70 * garch["forecast_monthly_vol"] + 0.30 * hist_monthly_vol
        forecasted_vol = blended_monthly_vol * np.sqrt(12)

        # --- Return: blend 3 signals ---
        ewma_r   = ewma_return_forecast(r, halflife=6)           # 40% weight
        mom      = momentum_forecast(r)                           # 35% weight
        meanrev  = mean_reversion_signal(r, lookback=min(24, len(r)))  # 25% weight

        mom_signal  = mom["signal"] / 12   # monthly
        mrev_signal = meanrev["signal"]

        blended_monthly = (
            0.40 * ewma_r
            + 0.35 * mom_signal
            + 0.25 * mrev_signal
        )
        # Annualise and blend 60% forecast / 40% historical to avoid extremes
        hist_ann_return = data["ann_return"]
        forecast_ann_return = blended_monthly * 12
        final_ann_return = 0.60 * forecast_ann_return + 0.40 * hist_ann_return

        raw_returns[ticker] = final_ann_return

        # --- Regime ---
        regime = detect_regime(r)

        results[ticker] = {
            "forecasted_annual_return": final_ann_return,
            "forecasted_annual_vol": forecasted_vol,
            "garch": garch,
            "regime": regime,
            "momentum": mom,
            "mean_reversion": meanrev,
            "_raw_monthly_return": blended_monthly,
        }

    # --- James-Stein shrinkage across all assets ---
    shrunk = james_stein_shrink(raw_returns)
    for ticker in results:
        original = results[ticker]["forecasted_annual_return"]
        shrunk_r = shrunk[ticker]
        # Apply 50% shrinkage (blend original ensemble with J-S result)
        final = 0.50 * original + 0.50 * shrunk_r
        results[ticker]["forecasted_annual_return"] = final
        rf = 0.045
        vol = results[ticker]["forecasted_annual_vol"]
        results[ticker]["forecasted_sharpe"] = (final - rf) / vol if vol > 0 else 0.0

    return results
