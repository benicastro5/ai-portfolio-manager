"""
Portfolio Health Score
======================
Produces a 0-100 overall score with 5 sub-dimensions.
"""

import numpy as np


def _score_return_quality(portfolio: dict, goal: str) -> dict:
    sharpe = portfolio.get("sharpe_ratio", 0) or 0
    exp_ret = portfolio.get("portfolio_return", 0) or 0

    # Sharpe: 0→0, 0.5→40, 1.0→70, 1.5→85, 2.0→100
    sharpe_score = min(100, max(0, sharpe * 55))

    # Return adequacy vs goal
    goal_thresholds = {
        "growth": 10,
        "balanced": 7,
        "income": 5,
        "capital_preservation": 3,
    }
    threshold = goal_thresholds.get(goal, 7)
    ret_score = min(100, max(0, (exp_ret / threshold) * 80))

    score = round(sharpe_score * 0.6 + ret_score * 0.4)
    if sharpe >= 1.5:
        label = "Excellent"
    elif sharpe >= 1.0:
        label = "Good"
    elif sharpe >= 0.5:
        label = "Moderate"
    else:
        label = "Below Average"
    return {"score": score, "label": label, "sharpe": round(sharpe, 2), "expected_return": round(exp_ret, 1)}


def _score_risk_management(portfolio: dict, risk_tolerance: float, max_drawdown: float) -> dict:
    actual_vol = portfolio.get("portfolio_volatility", 0) or 0
    est_dd = abs(portfolio.get("max_drawdown_estimate", 0) or 0)
    limit_dd = abs(max_drawdown)

    # How close is actual vol to target?
    vol_diff = abs(actual_vol - risk_tolerance)
    vol_score = max(0, 100 - vol_diff * 5)

    # Drawdown headroom
    dd_ratio = est_dd / limit_dd if limit_dd else 1
    dd_score = max(0, min(100, (1 - dd_ratio) * 100 + 20))

    score = round(vol_score * 0.5 + dd_score * 0.5)
    label = "Strong" if score >= 75 else "Good" if score >= 55 else "Moderate" if score >= 35 else "Weak"
    return {"score": score, "label": label, "actual_vol": round(actual_vol, 1), "target_vol": round(risk_tolerance, 1),
            "drawdown_est": round(est_dd, 1), "drawdown_limit": round(limit_dd, 1)}


def _score_diversification(portfolio: dict, geo_exposure: dict | None) -> dict:
    n_assets = portfolio.get("num_assets", 0) or 0
    div_ratio = portfolio.get("diversification_ratio", 1) or 1
    allocations = portfolio.get("allocations", [])

    # Asset count score
    count_score = min(100, n_assets * 10)

    # Diversification ratio (>1.3 is good, >1.6 is excellent)
    dr_score = min(100, max(0, (div_ratio - 1) * 100))

    # Concentration: penalize if any single holding > 30%
    max_weight = max((a.get("weight", 0) for a in allocations), default=0)
    conc_score = max(0, 100 - max(0, max_weight - 20) * 2)

    # Asset class diversity
    classes = set(a.get("asset_class", "") for a in allocations)
    class_score = min(100, len(classes) * 25)

    # Geo diversity bonus
    geo_score = geo_exposure.get("geo_diversification_score", 50) if geo_exposure else 50

    score = round(count_score * 0.2 + dr_score * 0.25 + conc_score * 0.2 + class_score * 0.15 + geo_score * 0.2)
    label = "Excellent" if score >= 80 else "Good" if score >= 60 else "Moderate" if score >= 40 else "Concentrated"
    return {"score": score, "label": label, "n_assets": n_assets, "div_ratio": round(div_ratio, 2),
            "asset_classes": list(classes)}


def _score_goal_alignment(portfolio: dict, goal: str, horizon: float, risk_tolerance: float) -> dict:
    exp_ret = portfolio.get("portfolio_return", 0) or 0
    vol = portfolio.get("portfolio_volatility", 0) or 0
    allocations = portfolio.get("allocations", [])

    # Categorize holdings
    equity_pct = sum(a.get("weight", 0) for a in allocations
                     if a.get("asset_class", "") in ("US Equity", "International Equity", "Emerging Markets",
                                                      "Sector Equity", "Real Estate", "Small Cap"))
    bond_pct = sum(a.get("weight", 0) for a in allocations
                   if a.get("asset_class", "") in ("Fixed Income", "Bonds"))
    alt_pct = 100 - equity_pct - bond_pct

    ideal = {
        "growth":               {"equity": (70, 100), "bond": (0, 20)},
        "balanced":             {"equity": (40, 70),  "bond": (20, 50)},
        "income":               {"equity": (20, 50),  "bond": (40, 70)},
        "capital_preservation": {"equity": (0, 30),   "bond": (50, 90)},
    }.get(goal, {"equity": (40, 70), "bond": (20, 50)})

    eq_lo, eq_hi = ideal["equity"]
    bd_lo, bd_hi = ideal["bond"]
    equity_score = 100 if eq_lo <= equity_pct <= eq_hi else max(0, 100 - min(abs(equity_pct - eq_lo), abs(equity_pct - eq_hi)) * 3)
    bond_score = 100 if bd_lo <= bond_pct <= bd_hi else max(0, 100 - min(abs(bond_pct - bd_lo), abs(bond_pct - bd_hi)) * 3)

    # Horizon alignment
    horizon_score = 80
    if goal == "growth" and horizon < 3:
        horizon_score = 40
    elif goal == "capital_preservation" and horizon > 10:
        horizon_score = 60
    else:
        horizon_score = 85

    score = round(equity_score * 0.4 + bond_score * 0.3 + horizon_score * 0.3)
    label = "Excellent" if score >= 80 else "Good" if score >= 60 else "Needs Review"
    return {"score": score, "label": label, "equity_pct": round(equity_pct, 1), "bond_pct": round(bond_pct, 1), "alt_pct": round(alt_pct, 1)}


# Approximate ETF expense ratios
EXPENSE_RATIOS = {
    "SPY": 0.09, "QQQ": 0.20, "IWM": 0.19, "EFA": 0.32, "EEM": 0.68,
    "BND": 0.03, "TLT": 0.15, "HYG": 0.48, "LQD": 0.14, "SHY": 0.15, "TIP": 0.19,
    "GLD": 0.40, "SLV": 0.50, "USO": 0.79, "VNQ": 0.13, "DBC": 0.85,
    "XLK": 0.10, "XLF": 0.10, "XLE": 0.10, "XLV": 0.10, "XLY": 0.10,
    "XLP": 0.10, "XLI": 0.10, "XLU": 0.10, "XLB": 0.10, "XLC": 0.10,
    "SOXX": 0.35, "IBB": 0.44, "VT": 0.06, "ACWI": 0.32,
    "EWC": 0.50, "VGK": 0.08, "EWU": 0.50, "EWJ": 0.50, "MCHI": 0.59,
    "INDA": 0.65, "EWZ": 0.59, "EWW": 0.50, "ECH": 0.59, "EZA": 0.59,
    "EWY": 0.50, "EWT": 0.57, "EIDO": 0.59, "EWA": 0.50, "EWM": 0.50,
}

def _score_cost_efficiency(allocations: list[dict]) -> dict:
    if not allocations:
        return {"score": 50, "label": "Unknown", "weighted_expense_ratio": 0}
    total_er = sum((EXPENSE_RATIOS.get(a["ticker"], 0.40) * a.get("weight", 0) / 100) for a in allocations)
    total_er_pct = total_er * 100

    # < 0.10% = excellent, 0.10-0.25% = good, 0.25-0.50% = moderate, > 0.50% = expensive
    if total_er_pct < 0.10:
        score, label = 95, "Excellent"
    elif total_er_pct < 0.25:
        score, label = 80, "Good"
    elif total_er_pct < 0.50:
        score, label = 60, "Moderate"
    else:
        score, label = 35, "Expensive"
    return {"score": score, "label": label, "weighted_expense_ratio": round(total_er_pct, 3)}


def compute_health_score(portfolio: dict, user_profile: dict, geo_exposure: dict | None = None) -> dict:
    goal = user_profile.get("goal", "balanced")
    risk = float(user_profile.get("risk_tolerance", 15))
    horizon = float(user_profile.get("horizon", 5))
    max_dd = float(user_profile.get("max_drawdown", -20))
    allocations = portfolio.get("allocations", [])

    rq = _score_return_quality(portfolio, goal)
    rm = _score_risk_management(portfolio, risk, max_dd)
    div = _score_diversification(portfolio, geo_exposure)
    ga = _score_goal_alignment(portfolio, goal, horizon, risk)
    ce = _score_cost_efficiency(allocations)

    overall = round(
        rq["score"] * 0.25 +
        rm["score"] * 0.25 +
        div["score"] * 0.20 +
        ga["score"] * 0.20 +
        ce["score"] * 0.10
    )

    if overall >= 85:
        overall_label = "Excellent"
        overall_color = "#16a34a"
    elif overall >= 70:
        overall_label = "Good"
        overall_color = "#22c55e"
    elif overall >= 55:
        overall_label = "Moderate"
        overall_color = "#d97706"
    elif overall >= 40:
        overall_label = "Needs Improvement"
        overall_color = "#f97316"
    else:
        overall_label = "Poor"
        overall_color = "#dc2626"

    return {
        "overall": overall,
        "overall_label": overall_label,
        "overall_color": overall_color,
        "dimensions": {
            "return_quality":    {**rq,  "title": "Return Quality",    "icon": "◆"},
            "risk_management":   {**rm,  "title": "Risk Management",   "icon": "◉"},
            "diversification":   {**div, "title": "Diversification",   "icon": "⊞"},
            "goal_alignment":    {**ga,  "title": "Goal Alignment",    "icon": "◎"},
            "cost_efficiency":   {**ce,  "title": "Cost Efficiency",   "icon": "◇"},
        }
    }
