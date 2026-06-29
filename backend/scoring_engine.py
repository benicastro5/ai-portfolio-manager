import numpy as np
import pandas as pd


def score_etf(data: dict, corr_matrix: pd.DataFrame = None, portfolio_tickers: list = None) -> dict:
    scores = {}
    if data.get("fundamental_score") is not None:
        scores["fundamental_score"] = data["fundamental_score"]

    # 1. Return score (0-100): map ann_return from -20% to +30%
    ret = data["ann_return"]
    scores["return_score"] = _scale(ret, -0.20, 0.30)

    # 2. Volatility score (inverse): lower vol = higher score
    vol = data["ann_vol"]
    scores["volatility_score"] = _scale(-vol, -0.50, -0.05)

    # 3. Sharpe score
    sharpe = data["sharpe"]
    scores["sharpe_score"] = _scale(sharpe, -1.0, 3.0)

    # 4. Momentum score (blend 3m and 12m)
    mom = 0.4 * data["mom_3m"] + 0.6 * data["mom_12m"]
    scores["momentum_score"] = _scale(mom, -0.40, 0.60)

    # 5. Drawdown score (inverse)
    dd = data["max_drawdown"]
    scores["drawdown_score"] = _scale(-abs(dd), -0.80, -0.02)

    # 6. Trend score: binary 0 or 100
    scores["trend_score"] = 75.0 if data.get("trend", 0) == 1 else 25.0

    # 7. Diversification score: average |corr| with others (lower = more diversifying)
    if corr_matrix is not None and portfolio_tickers:
        ticker = data["ticker"]
        others = [t for t in portfolio_tickers if t != ticker and t in corr_matrix.columns]
        if others and ticker in corr_matrix.index:
            avg_corr = corr_matrix.loc[ticker, others].abs().mean()
            scores["diversification_score"] = _scale(-avg_corr, -1.0, -0.1)
        else:
            scores["diversification_score"] = 50.0
    else:
        scores["diversification_score"] = 50.0

    # Technical composite (80% of final score)
    tech_weights = {
        "sharpe_score": 0.30,
        "return_score": 0.15,
        "volatility_score": 0.15,
        "momentum_score": 0.20,
        "drawdown_score": 0.10,
        "trend_score": 0.05,
        "diversification_score": 0.05,
    }
    tech_composite = sum(scores[k] * tech_weights[k] for k in tech_weights)
    scores["technical_score"] = round(tech_composite, 1)

    # Fundamental score blended in if provided (20% weight)
    fund_score = scores.pop("fundamental_score", None)
    if fund_score is not None:
        composite = tech_composite * 0.80 + fund_score * 0.20
    else:
        composite = tech_composite

    scores["composite_score"] = round(composite, 1)
    return scores


def rank_etfs(market_data: dict, corr_matrix: pd.DataFrame = None, forecasts: dict = None, fundamentals: dict = None) -> list[dict]:
    tickers = list(market_data.keys())
    ranked = []

    for ticker, data in market_data.items():
        fc = forecasts.get(ticker, {}) if forecasts else {}
        # Use forecast return/vol for scoring if available
        score_data = dict(data)
        if fc:
            score_data["ann_return"] = fc.get("forecasted_annual_return", data["ann_return"])
            score_data["ann_vol"] = fc.get("forecasted_annual_vol", data["ann_vol"])
            score_data["sharpe"] = fc.get("forecasted_sharpe", data["sharpe"])

        fund_info = (fundamentals or {}).get(ticker, {})
        if fund_info:
            score_data["fundamental_score"] = fund_info.get("fundamental_score", None)
        scores = score_etf(score_data, corr_matrix, tickers)
        regime = fc.get("regime", {}) if fc else {}
        garch = fc.get("garch", {}) if fc else {}
        mom = fc.get("momentum", {}) if fc else {}

        row = {
            "ticker": ticker,
            "name": data.get("name", ticker),
            "asset_class": data.get("asset_class", "Unknown"),
            "sector": data.get("sector", "Unknown"),
            "composite_score": scores["composite_score"],
            # Historical
            "ann_return": round(data["ann_return"] * 100, 2),
            "ann_vol": round(data["ann_vol"] * 100, 2),
            "sharpe": round(data["sharpe"], 2),
            # Forecast
            "forecast_return": round(float(fc.get("forecasted_annual_return", data["ann_return"])) * 100, 2),
            "forecast_vol": round(float(fc.get("forecasted_annual_vol", data["ann_vol"])) * 100, 2),
            "forecast_sharpe": round(float(fc.get("forecasted_sharpe", data["sharpe"])), 2),
            "garch_vol_regime": garch.get("vol_regime", "normal"),
            "garch_persistence": garch.get("persistence", None),
            "regime": regime.get("regime", "neutral"),
            "regime_confidence": regime.get("confidence", "low"),
            # Market data
            "max_drawdown": round(data["max_drawdown"] * 100, 2),
            "momentum_3m": round(float(mom.get("m3", data["mom_3m"]) or data["mom_3m"]) * 100, 2),
            "momentum_12m": round(float(mom.get("m12", 0) or 0) * 100, 2),
            "trend": "Bullish" if data.get("trend", 0) == 1 else "Bearish",
            "current_price": round(data.get("current_price", 0), 2),
            "data_source": "live" if data.get("dates") else "mock",
            "scores": scores,
            # Fundamentals
            "pe_ratio": fund_info.get("pe_ratio"),
            "pb_ratio": fund_info.get("pb_ratio"),
            "dividend_yield": fund_info.get("dividend_yield"),
            "earnings_growth": fund_info.get("earnings_growth"),
            "yield_curve_signal": fund_info.get("yield_curve_signal"),
            "fundamental_score": fund_info.get("fundamental_score"),
            "technical_score": scores.get("technical_score"),
        }
        row["recommendation"] = _get_recommendation(scores["composite_score"])
        ranked.append(row)

    ranked.sort(key=lambda x: x["composite_score"], reverse=True)
    for i, r in enumerate(ranked):
        r["rank"] = i + 1

    return ranked


def _scale(value: float, min_val: float, max_val: float) -> float:
    if max_val == min_val:
        return 50.0
    score = (value - min_val) / (max_val - min_val) * 100
    return float(np.clip(score, 0, 100))


def _get_recommendation(score: float) -> str:
    if score >= 75:
        return "Strong Buy"
    elif score >= 60:
        return "Buy"
    elif score >= 45:
        return "Hold"
    elif score >= 30:
        return "Underweight"
    else:
        return "Avoid"
