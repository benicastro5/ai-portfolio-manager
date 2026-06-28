from typing import Optional


def compute_rebalancing(
    target_allocations: list[dict],
    current_holdings: list[dict],
    portfolio_value: float,
    drift_threshold: float = 0.05,
) -> dict:
    """
    target_allocations: [{"ticker": "SPY", "weight_decimal": 0.30, ...}]
    current_holdings:   [{"ticker": "SPY", "current_value": 15000}]
    """
    target_map = {a["ticker"]: a["weight_decimal"] for a in target_allocations}
    current_map = {h["ticker"]: h["current_value"] for h in current_holdings}

    all_tickers = set(list(target_map.keys()) + list(current_map.keys()))

    current_total = sum(current_map.values())
    if current_total <= 0:
        current_total = portfolio_value

    rows = []
    total_buys = 0.0
    total_sells = 0.0

    for ticker in all_tickers:
        target_w = target_map.get(ticker, 0.0)
        current_val = current_map.get(ticker, 0.0)
        current_w = current_val / current_total if current_total > 0 else 0.0

        target_val = portfolio_value * target_w
        drift = target_w - current_w
        trade_amount = target_val - current_val

        if abs(drift) < drift_threshold and abs(trade_amount) < 100:
            action = "Hold"
        elif trade_amount > 0:
            action = "Buy"
            total_buys += trade_amount
        elif trade_amount < 0:
            action = "Sell"
            total_sells += abs(trade_amount)
        else:
            action = "Hold"

        rows.append({
            "ticker": ticker,
            "target_weight": round(target_w * 100, 2),
            "current_weight": round(current_w * 100, 2),
            "drift": round(drift * 100, 2),
            "target_value": round(target_val, 2),
            "current_value": round(current_val, 2),
            "trade_amount": round(trade_amount, 2),
            "action": action,
        })

    rows.sort(key=lambda x: abs(x["drift"]), reverse=True)

    portfolio_drift = sum(abs(r["drift"]) for r in rows) / max(len(rows), 1)
    needs_rebalance = portfolio_drift > drift_threshold * 100

    return {
        "rows": rows,
        "total_buys": round(total_buys, 2),
        "total_sells": round(total_sells, 2),
        "portfolio_drift_pct": round(portfolio_drift, 2),
        "needs_rebalance": needs_rebalance,
        "current_portfolio_value": round(current_total, 2),
    }


def compute_dollar_allocations(
    allocations: list[dict],
    investment_amount: float,
    monthly_contribution: float = 0.0,
) -> list[dict]:
    result = []
    for a in allocations:
        dollar_amount = investment_amount * a["weight_decimal"]
        monthly_add = monthly_contribution * a["weight_decimal"] if monthly_contribution else 0.0
        result.append({
            **a,
            "dollar_amount": round(dollar_amount, 2),
            "monthly_contribution": round(monthly_add, 2),
        })
    return result
