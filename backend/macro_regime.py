"""
Macro Regime Detection
======================
Derives a top-down market regime from three live macro signals:

  1. VIX level       — fear gauge; >25 = elevated risk
  2. Yield curve     — 10Y minus 3M spread; negative = inverted = recession risk
  3. Credit spread   — HYG vs LQD price momentum; underperformance = risk-off

Outputs:
  - regime:       "bull" | "neutral" | "bear"
  - regime_score: -100 (deep bear) → +100 (strong bull)
  - signals:      per-indicator readings for display
  - optimizer_overlay: weight bound adjustments to pass to the optimizer
"""

import numpy as np
import yfinance as yf
from datetime import datetime, timedelta


_MACRO_CACHE: dict = {}
_MACRO_TS: float = 0.0
_MACRO_TTL: float = 3600  # 1 hour


def _fetch_series(ticker: str, period: str = "6mo") -> np.ndarray:
    """Return monthly-sampled closing prices as numpy array."""
    try:
        df = yf.download(ticker, period=period, interval="1d", progress=False, auto_adjust=True)
        if df is None or df.empty:
            return np.array([])
        closes = df["Close"].dropna()
        # Resample to monthly (last trading day of each month)
        monthly = closes.resample("ME").last().dropna()
        return monthly.values.flatten()
    except Exception:
        return np.array([])


def _vix_signal(vix_prices: np.ndarray) -> dict:
    """
    VIX level signal. Uses latest close.
    <15 = bull, 15-20 = neutral-bull, 20-25 = neutral-bear, >25 = bear
    """
    if len(vix_prices) == 0:
        return {"value": None, "signal": 0, "label": "unavailable", "interpretation": "No VIX data"}

    level = float(vix_prices[-1])
    if level < 15:
        signal, label = 40, "Low"
    elif level < 20:
        signal, label = 15, "Moderate"
    elif level < 25:
        signal, label = -15, "Elevated"
    elif level < 30:
        signal, label = -35, "High"
    else:
        signal, label = -55, "Extreme"

    return {
        "value": round(level, 1),
        "signal": signal,
        "label": label,
        "interpretation": f"VIX at {level:.1f} — {label.lower()} fear",
    }


def _yield_curve_signal(t10_prices: np.ndarray, t3m_prices: np.ndarray) -> dict:
    """
    10Y minus 3M yield spread.
    yfinance ^TNX = 10Y yield (quoted as %, e.g. 4.25), ^IRX = 13-week T-bill.
    Positive spread = normal, negative = inverted (recession risk).
    """
    if len(t10_prices) == 0 or len(t3m_prices) == 0:
        return {"value": None, "signal": 0, "label": "unavailable", "interpretation": "No yield data"}

    spread = float(t10_prices[-1]) - float(t3m_prices[-1])

    if spread > 1.5:
        signal, label = 35, "Steep"
    elif spread > 0.5:
        signal, label = 20, "Normal"
    elif spread > 0.0:
        signal, label = 5, "Flat"
    elif spread > -0.5:
        signal, label = -20, "Slightly inverted"
    else:
        signal, label = -45, "Inverted"

    return {
        "value": round(spread, 2),
        "signal": signal,
        "label": label,
        "interpretation": f"10Y−3M spread: {spread:+.2f}% — {label.lower()}",
    }


def _credit_spread_signal(hyg_prices: np.ndarray, lqd_prices: np.ndarray) -> dict:
    """
    HYG/LQD relative performance over past 3 months.
    HYG = high-yield corp bonds; LQD = investment-grade corp bonds.
    When HYG underperforms LQD, credit stress is rising (bearish).
    """
    if len(hyg_prices) < 4 or len(lqd_prices) < 4:
        return {"value": None, "signal": 0, "label": "unavailable", "interpretation": "No credit data"}

    # 3-month relative return: HYG vs LQD
    hyg_ret = float(hyg_prices[-1] / hyg_prices[-4] - 1)
    lqd_ret = float(lqd_prices[-1] / lqd_prices[-4] - 1)
    rel = hyg_ret - lqd_ret  # positive = HYG outperforming = risk-on

    if rel > 0.03:
        signal, label = 35, "Risk-on"
    elif rel > 0.01:
        signal, label = 15, "Mild risk-on"
    elif rel > -0.01:
        signal, label = 0, "Neutral"
    elif rel > -0.03:
        signal, label = -20, "Mild risk-off"
    else:
        signal, label = -40, "Risk-off"

    return {
        "value": round(rel * 100, 2),
        "signal": signal,
        "label": label,
        "interpretation": f"HYG vs LQD (3m): {rel*100:+.2f}% — {label.lower()}",
    }


def compute_macro_regime() -> dict:
    """
    Fetch live macro data and compute composite regime.
    Results cached for 1 hour.
    """
    import time
    global _MACRO_CACHE, _MACRO_TS

    if _MACRO_CACHE and (time.time() - _MACRO_TS) < _MACRO_TTL:
        return _MACRO_CACHE

    # Fetch all series in parallel would be nicer but keep it simple
    vix   = _fetch_series("^VIX", "3mo")
    t10   = _fetch_series("^TNX", "3mo")
    t3m   = _fetch_series("^IRX", "3mo")
    hyg   = _fetch_series("HYG",  "6mo")
    lqd   = _fetch_series("LQD",  "6mo")

    vix_sig    = _vix_signal(vix)
    curve_sig  = _yield_curve_signal(t10, t3m)
    credit_sig = _credit_spread_signal(hyg, lqd)

    # Weighted composite score: VIX 40%, curve 35%, credit 25%
    weights = [0.40, 0.35, 0.25]
    signals = [vix_sig["signal"], curve_sig["signal"], credit_sig["signal"]]
    composite = sum(w * s for w, s in zip(weights, signals))
    composite = max(-100, min(100, composite))

    if composite >= 20:
        regime, confidence = "bull", "high" if composite >= 40 else "moderate"
    elif composite <= -20:
        regime, confidence = "bear", "high" if composite <= -40 else "moderate"
    else:
        regime, confidence = "neutral", "moderate"

    # Optimizer overlay: adjust max equity weight based on regime
    # Bear → cap equities tighter; bull → allow more equity
    if regime == "bear":
        equity_cap_adj = -0.05   # reduce max_weight by 5ppt for equities
        bond_floor_adj = +0.05   # nudge bonds up
    elif regime == "bull":
        equity_cap_adj = +0.03
        bond_floor_adj = -0.02
    else:
        equity_cap_adj = 0.0
        bond_floor_adj = 0.0

    result = {
        "regime":        regime,
        "regime_score":  round(composite, 1),
        "confidence":    confidence,
        "equity_cap_adj": equity_cap_adj,
        "bond_floor_adj": bond_floor_adj,
        "signals": {
            "vix":          vix_sig,
            "yield_curve":  curve_sig,
            "credit_spread": credit_sig,
        },
        "summary": _build_summary(regime, composite, vix_sig, curve_sig, credit_sig),
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    _MACRO_CACHE = result
    _MACRO_TS = time.time()
    return result


def _build_summary(regime: str, score: float, vix: dict, curve: dict, credit: dict) -> str:
    emoji = {"bull": "▲", "neutral": "◆", "bear": "▼"}[regime]
    parts = []
    if vix["value"] is not None:
        parts.append(vix["interpretation"])
    if curve["value"] is not None:
        parts.append(curve["interpretation"])
    if credit["value"] is not None:
        parts.append(credit["interpretation"])
    return f"{emoji} {regime.capitalize()} regime (score {score:+.0f}). " + " · ".join(parts)
