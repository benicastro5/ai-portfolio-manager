def generate_portfolio_explanation(
    allocations: list[dict],
    portfolio_metrics: dict,
    user_profile: dict,
    ranked_etfs: list[dict],
    excluded_tickers: list[str] = None,
) -> dict:
    goal = user_profile.get("goal", "balanced")
    risk_pct = user_profile.get("risk_tolerance", 15)
    horizon = user_profile.get("horizon", 5)
    drawdown_tol = user_profile.get("max_drawdown", -20)
    amount = user_profile.get("investment_amount", 10000)

    included = {a["ticker"] for a in allocations if a["weight_decimal"] > 0.001}
    excluded_tickers = excluded_tickers or []

    goal_map = {
        "growth": "long-term capital appreciation",
        "balanced": "a balance of growth and income",
        "income": "regular income generation",
        "capital_preservation": "capital preservation with minimal risk",
    }

    # Summary
    top_holdings = sorted(allocations, key=lambda x: x["weight_decimal"], reverse=True)[:3]
    top_names = ", ".join(f"{a['ticker']} ({a['weight']:.1f}%)" for a in top_holdings)
    summary = (
        f"Your portfolio has been optimized for {goal_map.get(goal, goal)} "
        f"with a {risk_pct}% annual volatility target and a {horizon}-year investment horizon. "
        f"The portfolio achieves an expected annual return of {portfolio_metrics['portfolio_return']:.1f}% "
        f"with {portfolio_metrics['portfolio_volatility']:.1f}% volatility and a Sharpe ratio of "
        f"{portfolio_metrics['sharpe_ratio']:.2f}. "
        f"Top holdings: {top_names}."
    )

    # Per-asset explanations
    asset_reasons = []
    for alloc in allocations:
        ticker = alloc["ticker"]
        reason = _explain_asset(ticker, alloc, goal, risk_pct)
        asset_reasons.append({"ticker": ticker, "reason": reason})

    # Risk explanation
    risk_color = "low" if portfolio_metrics["portfolio_volatility"] < 10 else \
                 "moderate" if portfolio_metrics["portfolio_volatility"] < 18 else "elevated"
    risk_text = (
        f"The portfolio's {portfolio_metrics['portfolio_volatility']:.1f}% annual volatility is {risk_color}, "
        f"aligning with your {risk_pct}% risk tolerance. "
        f"The estimated maximum drawdown under adverse conditions is approximately "
        f"{abs(portfolio_metrics['max_drawdown_estimate']):.1f}% — "
        f"{'within' if abs(portfolio_metrics['max_drawdown_estimate']) <= abs(drawdown_tol) else 'exceeding'} "
        f"your {abs(drawdown_tol):.0f}% tolerance."
    )

    # Exclusion explanation
    excl_text = ""
    if excluded_tickers:
        excl_text = (
            f"The following assets were excluded per your preferences: {', '.join(excluded_tickers)}. "
            "Their characteristics were not factored into the optimization."
        )

    # Rebalancing guidance
    rebalance_text = _rebalancing_guidance(horizon, portfolio_metrics["portfolio_volatility"])

    # Market risks
    risks = _identify_risks(allocations, portfolio_metrics)

    return {
        "summary": summary,
        "asset_reasons": asset_reasons,
        "risk_explanation": risk_text,
        "exclusion_note": excl_text,
        "rebalancing_guidance": rebalance_text,
        "risks_to_watch": risks,
    }


def _explain_asset(ticker: str, alloc: dict, goal: str, risk_pct: float) -> str:
    asset_class = alloc.get("asset_class", "")
    weight = alloc.get("weight", 0)
    ret = alloc.get("expected_return", 0)
    vol = alloc.get("volatility", 0)

    templates = {
        "SPY": f"SPY provides broad U.S. equity exposure and is the core growth driver at {weight:.1f}%. "
               f"It offers strong long-term returns ({ret:.1f}% expected) with proven liquidity.",
        "QQQ": f"QQQ adds technology sector momentum. At {weight:.1f}%, it enhances growth potential "
               f"with {ret:.1f}% expected returns, though its {vol:.1f}% volatility reflects higher risk.",
        "IWM": f"IWM provides small-cap diversification at {weight:.1f}%, capturing domestic economic growth "
               f"with returns uncorrelated to large-cap indices.",
        "EFA": f"EFA offers developed market international exposure at {weight:.1f}%, "
               f"reducing U.S. home-country bias and providing geographic diversification.",
        "EEM": f"EEM captures emerging market growth at {weight:.1f}%. "
               f"Higher risk ({vol:.1f}% vol) is offset by superior long-term return potential.",
        "BND": f"BND anchors the fixed income sleeve at {weight:.1f}%, providing stability, "
               f"income, and negative correlation to equities during market stress.",
        "TLT": f"TLT (long-duration Treasuries) at {weight:.1f}% acts as a flight-to-safety hedge. "
               f"It tends to gain during equity market downturns, reducing portfolio drawdowns.",
        "GLD": f"Gold (GLD) at {weight:.1f}% provides inflation protection and acts as a portfolio hedge. "
               f"Its low correlation to both stocks and bonds improves diversification.",
        "SLV": f"Silver (SLV) at {weight:.1f}% provides commodity exposure with both "
               f"monetary and industrial demand drivers.",
        "USO": f"USO at {weight:.1f}% provides energy commodity exposure, "
               f"acting as an inflation hedge while adding diversification.",
        "VNQ": f"VNQ (REITs) at {weight:.1f}% provides real estate exposure with dividend income "
               f"and inflation protection characteristics.",
        "HYG": f"HYG at {weight:.1f}% adds high-yield credit exposure for enhanced income, "
               f"appropriate given your risk tolerance.",
        "LQD": f"LQD (investment-grade corporate bonds) at {weight:.1f}% provides higher yield "
               f"than Treasuries with lower risk than equities.",
        "SHY": f"SHY at {weight:.1f}% serves as a cash proxy — low-volatility short-term "
               f"Treasuries that preserve capital and provide liquidity.",
        "TIP": f"TIP (TIPS) at {weight:.1f}% provides inflation-linked protection, "
               f"crucial for preserving real purchasing power over your {goal} horizon.",
        "DBC": f"DBC at {weight:.1f}% provides diversified commodity exposure across energy, "
               f"metals, and agriculture, offering inflation protection.",
    }

    return templates.get(
        ticker,
        f"{ticker} ({asset_class}) at {weight:.1f}% contributes expected return of {ret:.1f}% "
        f"with {vol:.1f}% volatility, selected for its risk-return profile."
    )


def _rebalancing_guidance(horizon: float, portfolio_vol: float) -> str:
    if horizon < 0.25:
        freq = "weekly"
    elif horizon < 0.5:
        freq = "bi-weekly"
    elif horizon < 1:
        freq = "monthly"
    elif portfolio_vol < 8:
        freq = "annually"
    elif portfolio_vol < 15:
        freq = "semi-annually"
    else:
        freq = "quarterly"

    horizon_str = f"{round(horizon * 12)}-month" if horizon < 1 else f"{horizon:.0f}-year"

    return (
        f"Given your {horizon_str} horizon and portfolio volatility of {portfolio_vol:.1f}%, "
        f"we recommend rebalancing {freq} or whenever any position drifts more than 5% from its target weight. "
        "Major market regime changes (e.g., Fed policy shifts, recession signals) "
        "may warrant earlier tactical reviews."
    )


def _identify_risks(allocations: list[dict], metrics: dict) -> list[str]:
    risks = []
    equity_weight = sum(
        a["weight_decimal"] for a in allocations
        if a.get("asset_class") in ("US Equity", "International Equity")
    )
    if equity_weight > 0.70:
        risks.append(
            f"High equity concentration ({equity_weight*100:.0f}%): portfolio is sensitive to equity market downturns."
        )

    if metrics["portfolio_volatility"] > 20:
        risks.append("Elevated portfolio volatility may exceed comfort levels during market stress periods.")

    if metrics["sharpe_ratio"] < 0.5:
        risks.append("Risk-adjusted return (Sharpe) is below 0.5 — consider increasing allocation to higher-quality assets.")

    if abs(metrics["max_drawdown_estimate"]) > 30:
        risks.append(
            f"Estimated max drawdown of {abs(metrics['max_drawdown_estimate']):.1f}% suggests "
            "significant downside risk — consider adding defensive positions."
        )

    risks.append("Interest rate risk: rising rates may negatively impact bond and REIT holdings.")
    risks.append("Currency risk: international ETFs (EFA, EEM) are subject to USD/foreign exchange fluctuations.")

    return risks
