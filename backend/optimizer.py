import numpy as np
import pandas as pd
from scipy.optimize import minimize
from typing import Optional

RF_RATE = 0.045


def ledoit_wolf_cov(market_data: dict, tickers: list) -> np.ndarray:
    """Ledoit-Wolf analytical shrinkage — more stable than sample covariance."""
    try:
        from sklearn.covariance import LedoitWolf
        min_len = min(len(market_data[t]["monthly_returns"]) for t in tickers)
        X = np.column_stack([market_data[t]["monthly_returns"][-min_len:] for t in tickers])
        lw = LedoitWolf().fit(X)
        return lw.covariance_ * 12   # annualise
    except Exception:
        return None   # caller falls back to sample covariance


def optimize_portfolio(
    market_data: dict,
    cov_matrix: pd.DataFrame,
    user_risk_pct: float,
    goal: str = "balanced",
    max_weight: float = 0.25,
    min_assets: int = 4,
    scores: dict = None,
    method: str = "mpt",
    forecasts: dict = None,
    max_drawdown_pct: float = None,   # e.g. -20 means max -20% drawdown
) -> dict:
    tickers = [t for t in market_data.keys() if t in cov_matrix.columns]
    n = len(tickers)

    if n < min_assets:
        raise ValueError(f"Need at least {min_assets} assets, got {n}")

    # Use forecast returns if available, else fall back to historical
    if forecasts:
        expected_returns = np.array([
            forecasts[t]["forecasted_annual_return"] if t in forecasts
            else market_data[t]["ann_return"]
            for t in tickers
        ])
        forecast_vols = np.array([
            forecasts[t]["forecasted_annual_vol"] if t in forecasts
            else market_data[t]["ann_vol"]
            for t in tickers
        ])
    else:
        expected_returns = np.array([market_data[t]["ann_return"] for t in tickers])
        forecast_vols = np.array([market_data[t]["ann_vol"] for t in tickers])

    # Ledoit-Wolf covariance (more stable than sample covariance for MPT)
    lw_cov = ledoit_wolf_cov(market_data, tickers)
    cov = lw_cov if lw_cov is not None else cov_matrix.loc[tickers, tickers].values

    # Derive vol ceiling from max_drawdown: DD ≈ vol * 2.33 (Cornish-Fisher, 95th pctile)
    dd_vol_ceiling = abs(max_drawdown_pct) / 100 / 2.33 if max_drawdown_pct else None
    effective_vol = min(user_risk_pct, dd_vol_ceiling) if dd_vol_ceiling else user_risk_pct

    weights = _mpt_optimize(expected_returns, cov, effective_vol, goal, max_weight, min_assets, dd_vol_ceiling)
    weights = np.maximum(weights, 0)

    # Trim to top 10 holdings and renormalize
    MAX_ASSETS = 10
    if np.sum(weights > 0.001) > MAX_ASSETS:
        threshold = np.sort(weights)[-MAX_ASSETS]
        weights = np.where(weights >= threshold, weights, 0.0)

    weights = weights / weights.sum()

    port_return = float(expected_returns @ weights)
    port_vol = float(np.sqrt(weights @ cov @ weights))
    sharpe = (port_return - RF_RATE) / port_vol if port_vol > 0 else 0

    # Risk contributions
    marginal = cov @ weights
    risk_contrib = weights * marginal / port_vol if port_vol > 0 else weights
    risk_contrib = risk_contrib / risk_contrib.sum()

    # Max drawdown estimate (Cornish-Fisher approximation)
    skewness = _portfolio_skewness(market_data, tickers, weights)
    z = 1.645  # 95th pctile
    cf_z = z + (z**2 - 1) * skewness / 6
    max_dd_est = -port_vol * cf_z * np.sqrt(2)

    # Diversification ratio
    weighted_vol = sum(weights[i] * market_data[tickers[i]]["ann_vol"] for i in range(n))
    div_ratio = weighted_vol / port_vol if port_vol > 0 else 1.0

    allocations = []
    for i, ticker in enumerate(tickers):
        if weights[i] > 0.001:
            info = market_data[ticker]
            fc = forecasts.get(ticker, {}) if forecasts else {}
            regime_info = fc.get("regime", {})
            allocations.append({
                "ticker": ticker,
                "name": info.get("name", ticker),
                "asset_class": info.get("asset_class", "Unknown"),
                "sector": info.get("sector", "Unknown"),
                "weight": round(float(weights[i]) * 100, 2),
                "weight_decimal": float(weights[i]),
                # Historical
                "historical_return": round(info["ann_return"] * 100, 2),
                "historical_vol": round(info["ann_vol"] * 100, 2),
                # Forecast (ensemble model output)
                "expected_return": round(float(fc.get("forecasted_annual_return", info["ann_return"])) * 100, 2),
                "volatility": round(float(fc.get("forecasted_annual_vol", info["ann_vol"])) * 100, 2),
                "sharpe": round(float(fc.get("forecasted_sharpe", info["sharpe"])), 2),
                "risk_contribution": round(float(risk_contrib[i]) * 100, 2),
                "regime": regime_info.get("regime", "neutral"),
                "regime_score": regime_info.get("regime_score", 0),
                "vol_regime": fc.get("garch", {}).get("vol_regime", "normal"),
                "momentum_3m": round(float(fc.get("momentum", {}).get("m3", 0) or 0) * 100, 2),
                "momentum_12m": round(float(fc.get("momentum", {}).get("m12", 0) or 0) * 100, 2),
            })

    allocations.sort(key=lambda x: x["weight"], reverse=True)

    return {
        "allocations": allocations,
        "portfolio_return": round(port_return * 100, 2),
        "portfolio_volatility": round(port_vol * 100, 2),
        "sharpe_ratio": round(sharpe, 2),
        "max_drawdown_estimate": round(max_dd_est * 100, 2),
        "diversification_ratio": round(div_ratio, 2),
        "method": method,
        "num_assets": len([a for a in allocations if a["weight"] > 0.1]),
    }


def optimize_target_vol_portfolio(
    market_data: dict,
    cov_matrix: pd.DataFrame,
    target_vol: float,
    max_weight: float = 0.25,
    min_assets: int = 4,
    forecasts: dict = None,
) -> dict:
    """
    Construct the max-return portfolio with volatility as close as possible to
    exactly target_vol — the efficient frontier point at the user's stated risk level.
    """
    tickers = [t for t in market_data.keys() if t in cov_matrix.columns]
    n = len(tickers)

    expected_returns = np.array([
        forecasts[t]["forecasted_annual_return"] if forecasts and t in forecasts
        else market_data[t]["ann_return"]
        for t in tickers
    ])

    lw_cov = ledoit_wolf_cov(market_data, tickers)
    cov = lw_cov if lw_cov is not None else cov_matrix.loc[tickers, tickers].values

    def neg_return(w):
        return -expected_returns @ w

    # Solve for multiple tolerance bands and take the one closest to target
    best_weights = None
    best_actual_vol = None

    for tol in [0.005, 0.01, 0.02, 0.03, 0.05]:
        constraints = [
            {"type": "eq",  "fun": lambda w: w.sum() - 1.0},
            {"type": "ineq","fun": lambda w: np.sum(w > 0.01) - min_assets},
            {"type": "ineq","fun": lambda w: target_vol * (1 + tol) - np.sqrt(w @ cov @ w)},
            {"type": "ineq","fun": lambda w: np.sqrt(w @ cov @ w) - target_vol * (1 - tol)},
        ]
        bounds = [(0.0, max_weight)] * n

        asset_vols = np.sqrt(np.diag(cov))
        x0s = [
            np.ones(n) / n,
            np.clip(asset_vols / asset_vols.sum(), 0, max_weight),
        ]
        x0s = [w / w.sum() for w in x0s]

        for x0 in x0s:
            try:
                res = minimize(neg_return, x0, method="SLSQP",
                               bounds=bounds, constraints=constraints,
                               options={"maxiter": 1000, "ftol": 1e-9})
                if res.success:
                    w = np.maximum(res.x, 0)
                    w = w / w.sum()
                    actual_vol = float(np.sqrt(w @ cov @ w))
                    dist = abs(actual_vol - target_vol)
                    if best_weights is None or dist < abs(best_actual_vol - target_vol):
                        best_weights = w
                        best_actual_vol = actual_vol
            except Exception:
                continue

        if best_weights is not None and abs(best_actual_vol - target_vol) < 0.01:
            break

    if best_weights is None:
        best_weights = np.ones(n) / n
        best_actual_vol = float(np.sqrt(best_weights @ cov @ best_weights))

    weights = best_weights
    # Trim to top 10 holdings
    MAX_ASSETS = 10
    if np.sum(weights > 0.001) > MAX_ASSETS:
        threshold = np.sort(weights)[-MAX_ASSETS]
        weights = np.where(weights >= threshold, weights, 0.0)
    weights = weights / weights.sum()

    port_return = float(expected_returns @ weights)
    port_vol = float(np.sqrt(weights @ cov @ weights))
    sharpe = (port_return - RF_RATE) / port_vol if port_vol > 0 else 0

    marginal = cov @ weights
    risk_contrib = weights * marginal / port_vol if port_vol > 0 else weights
    risk_contrib = risk_contrib / risk_contrib.sum()

    skewness = _portfolio_skewness(market_data, tickers, weights)
    z = 1.645
    cf_z = z + (z**2 - 1) * skewness / 6
    max_dd_est = -port_vol * cf_z * np.sqrt(2)

    weighted_vol = sum(weights[i] * market_data[tickers[i]]["ann_vol"] for i in range(n))
    div_ratio = weighted_vol / port_vol if port_vol > 0 else 1.0

    allocations = []
    for i, ticker in enumerate(tickers):
        if weights[i] > 0.001:
            info = market_data[ticker]
            fc = forecasts.get(ticker, {}) if forecasts else {}
            regime_info = fc.get("regime", {})
            allocations.append({
                "ticker": ticker,
                "name": info.get("name", ticker),
                "asset_class": info.get("asset_class", "Unknown"),
                "sector": info.get("sector", "Unknown"),
                "weight": round(float(weights[i]) * 100, 2),
                "weight_decimal": float(weights[i]),
                "historical_return": round(info["ann_return"] * 100, 2),
                "historical_vol": round(info["ann_vol"] * 100, 2),
                "expected_return": round(float(fc.get("forecasted_annual_return", info["ann_return"])) * 100, 2),
                "volatility": round(float(fc.get("forecasted_annual_vol", info["ann_vol"])) * 100, 2),
                "sharpe": round(float(fc.get("forecasted_sharpe", info["sharpe"])), 2),
                "risk_contribution": round(float(risk_contrib[i]) * 100, 2),
                "regime": regime_info.get("regime", "neutral"),
                "vol_regime": fc.get("garch", {}).get("vol_regime", "normal"),
            })

    allocations.sort(key=lambda x: x["weight"], reverse=True)

    return {
        "allocations": allocations,
        "portfolio_return": round(port_return * 100, 2),
        "portfolio_volatility": round(port_vol * 100, 2),
        "sharpe_ratio": round(sharpe, 2),
        "max_drawdown_estimate": round(max_dd_est * 100, 2),
        "diversification_ratio": round(div_ratio, 2),
        "method": "target_vol",
        "num_assets": len([a for a in allocations if a["weight"] > 0.1]),
    }


def _mpt_optimize(
    expected_returns: np.ndarray,
    cov: np.ndarray,
    target_vol: float,
    goal: str,
    max_weight: float,
    min_assets: int,
    dd_vol_ceiling: float = None,
) -> np.ndarray:
    n = len(expected_returns)

    # Objective: maximize risk-adjusted return with goal bias
    def objective(w):
        ret = expected_returns @ w
        vol = np.sqrt(w @ cov @ w)
        if goal == "growth":
            return -ret  # maximize return
        elif goal == "income":
            return -(ret - 0.5 * vol)
        elif goal == "capital_preservation":
            return vol  # minimize vol
        else:  # balanced
            return -(ret - RF_RATE) / (vol + 1e-8)  # maximize sharpe

    constraints = [
        {"type": "eq", "fun": lambda w: w.sum() - 1.0},
        {"type": "ineq", "fun": lambda w: np.sum(w > 0.01) - min_assets},
    ]

    # Vol constraints depend on goal:
    #   capital_preservation → ceiling only (stay AT OR BELOW target)
    #   income               → ceiling with loose floor (use up to target, can go lower)
    #   balanced / growth    → two-sided band (must be NEAR target — use the risk budget)
    if goal == "capital_preservation":
        # Hard ceiling: portfolio vol must not exceed target
        constraints.append({
            "type": "ineq",
            "fun": lambda w: target_vol - np.sqrt(w @ cov @ w)
        })
    elif goal == "income":
        # Ceiling only — income investors prefer less vol
        constraints.append({
            "type": "ineq",
            "fun": lambda w: target_vol * 1.10 - np.sqrt(w @ cov @ w)
        })
    else:
        # growth / balanced: two-sided band ±20% of target
        # Upper bound: vol ≤ target × 1.20
        constraints.append({
            "type": "ineq",
            "fun": lambda w: target_vol * 1.20 - np.sqrt(w @ cov @ w)
        })
        # Lower bound: vol ≥ target × 0.80  — force optimizer to USE the risk budget
        constraints.append({
            "type": "ineq",
            "fun": lambda w: np.sqrt(w @ cov @ w) - target_vol * 0.80
        })

    # Hard drawdown ceiling: always enforce regardless of goal
    if dd_vol_ceiling is not None:
        constraints.append({
            "type": "ineq",
            "fun": lambda w: dd_vol_ceiling - np.sqrt(w @ cov @ w)
        })

    bounds = [(0.0, max_weight)] * n

    # Multiple starting points for robustness
    best_result = None
    best_val = np.inf

    # Volatility-biased start: overweight high-vol assets to land inside the feasible region
    asset_vols = np.sqrt(np.diag(cov))
    vol_weights = asset_vols / asset_vols.sum()

    starts = [
        np.ones(n) / n,
        _goal_biased_start(expected_returns, n, goal),
        np.clip(vol_weights, 0, max_weight),
    ]
    starts = [w / w.sum() for w in starts]

    for x0 in starts:
        try:
            res = minimize(
                objective, x0, method="SLSQP",
                bounds=bounds, constraints=constraints,
                options={"maxiter": 1000, "ftol": 1e-9}
            )
            if res.success and res.fun < best_val:
                best_val = res.fun
                best_result = res.x
        except Exception:
            continue

    if best_result is None:
        # fallback: equal weight
        return np.ones(n) / n

    return best_result


def _goal_biased_start(expected_returns: np.ndarray, n: int, goal: str) -> np.ndarray:
    if goal == "growth":
        idx = np.argsort(expected_returns)[-max(1, n // 3):]
    elif goal == "capital_preservation":
        idx = np.arange(n)  # equal
    else:
        idx = np.arange(n)
    w = np.zeros(n)
    w[idx] = 1.0 / len(idx)
    return w


def _portfolio_skewness(market_data: dict, tickers: list, weights: np.ndarray) -> float:
    try:
        min_len = min(len(market_data[t]["monthly_returns"]) for t in tickers)
        returns_matrix = np.array([market_data[t]["monthly_returns"][-min_len:] for t in tickers])
        port_returns = weights @ returns_matrix
        mean = port_returns.mean()
        std = port_returns.std()
        if std == 0:
            return 0.0
        return float(((port_returns - mean) ** 3).mean() / std ** 3)
    except Exception:
        return 0.0


def compute_efficient_frontier(
    market_data: dict,
    cov_matrix: pd.DataFrame,
    n_points: int = 30,
    forecasts: dict = None,
) -> list[dict]:
    tickers = [t for t in market_data.keys() if t in cov_matrix.columns]
    if forecasts:
        expected_returns = np.array([
            forecasts[t]["forecasted_annual_return"] if t in forecasts
            else market_data[t]["ann_return"]
            for t in tickers
        ])
    else:
        expected_returns = np.array([market_data[t]["ann_return"] for t in tickers])
    lw_cov = ledoit_wolf_cov(market_data, tickers)
    cov = lw_cov if lw_cov is not None else cov_matrix.loc[tickers, tickers].values
    n = len(tickers)

    min_ret = expected_returns.min()
    max_ret = expected_returns.max()
    target_returns = np.linspace(min_ret * 0.8, max_ret * 0.95, n_points)

    frontier = []
    for target_ret in target_returns:
        def objective(w):
            return w @ cov @ w

        constraints = [
            {"type": "eq", "fun": lambda w: w.sum() - 1.0},
            {"type": "eq", "fun": lambda w: expected_returns @ w - target_ret},
        ]
        bounds = [(0.0, 0.40)] * n

        try:
            res = minimize(objective, np.ones(n) / n, method="SLSQP",
                           bounds=bounds, constraints=constraints,
                           options={"maxiter": 500})
            if res.success:
                vol = np.sqrt(res.fun)
                frontier.append({
                    "return": round(float(target_ret) * 100, 2),
                    "volatility": round(float(vol) * 100, 2),
                    "sharpe": round((float(target_ret) - RF_RATE) / float(vol), 2) if vol > 0 else 0,
                })
        except Exception:
            continue

    return frontier
