"""
Portfolio Backtester
====================
Simulates historical performance of a static-weight portfolio.
Supports buy-and-hold and periodic rebalancing.
Benchmarks against SPY.
"""

import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta


def _download_prices(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    """Download adjusted daily closes for all tickers."""
    all_tickers = list(set(tickers + ["SPY"]))
    df = yf.download(all_tickers, start=start, end=end, auto_adjust=True, progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        prices = df["Close"]
    else:
        prices = df[["Close"]] if "Close" in df.columns else df
    prices = prices.dropna(how="all")
    return prices


def _rebalance_weights(prices_row: pd.Series, weights: dict) -> dict:
    """Return dollar values after rebalancing to target weights at current prices."""
    total = sum(weights.values())
    return {t: w / total for t, w in weights.items()}


def run_backtest(
    allocations: list[dict],       # [{ticker, weight_decimal}]
    initial_value: float = 10000,
    period_years: int = 3,
    rebalance_freq: str = "none",  # "none" | "quarterly" | "annual"
) -> dict:
    tickers = [a["ticker"] for a in allocations]
    weights = {a["ticker"]: a["weight_decimal"] for a in allocations}

    end_dt   = datetime.utcnow()
    start_dt = end_dt - timedelta(days=int(period_years * 365.25))
    start    = start_dt.strftime("%Y-%m-%d")
    end      = end_dt.strftime("%Y-%m-%d")

    prices = _download_prices(tickers, start, end)

    # Check which tickers actually loaded
    available = [t for t in tickers if t in prices.columns and prices[t].notna().any()]
    missing   = [t for t in tickers if t not in available]

    if len(available) < 2:
        raise ValueError(f"Not enough price data. Missing: {missing}")

    # Re-normalise weights to available tickers only
    raw_w = {t: weights[t] for t in available}
    total_w = sum(raw_w.values())
    norm_w  = {t: w / total_w for t, w in raw_w.items()}

    # Align dates: forward-fill gaps up to 5 days
    prices_clean = prices[available + (["SPY"] if "SPY" in prices.columns else [])].ffill(limit=5).dropna()

    if len(prices_clean) < 10:
        raise ValueError("Insufficient price history after cleaning.")

    # ── Simulate portfolio ────────────────────────────────────────────────────
    dates       = prices_clean.index
    port_values = np.zeros(len(dates))
    spy_values  = np.zeros(len(dates))

    # Initial share counts at day-0 prices
    day0 = prices_clean.iloc[0]
    shares = {t: (initial_value * norm_w[t]) / float(day0[t]) for t in available}
    spy_shares = initial_value / float(day0["SPY"]) if "SPY" in day0 else None

    # Track rebalance dates
    last_rebal = dates[0]

    for i, (date, row) in enumerate(prices_clean.iterrows()):
        # Rebalance?
        if rebalance_freq != "none" and i > 0:
            months_since = (date.year - last_rebal.year) * 12 + (date.month - last_rebal.month)
            do_rebal = (rebalance_freq == "quarterly" and months_since >= 3) or \
                       (rebalance_freq == "annual"    and months_since >= 12)
            if do_rebal:
                current_val = sum(shares[t] * float(row[t]) for t in available)
                shares = {t: (current_val * norm_w[t]) / float(row[t]) for t in available}
                last_rebal = date

        port_values[i] = sum(shares[t] * float(row[t]) for t in available)
        spy_values[i]  = spy_shares * float(row["SPY"]) if spy_shares and "SPY" in row else np.nan

    # ── Compute metrics ───────────────────────────────────────────────────────
    def metrics(vals: np.ndarray, label: str) -> dict:
        vals = vals[~np.isnan(vals)]
        if len(vals) < 2:
            return {}
        returns_daily = np.diff(vals) / vals[:-1]
        total_ret     = (vals[-1] / vals[0] - 1) * 100
        n_years       = len(vals) / 252
        ann_ret       = ((vals[-1] / vals[0]) ** (1 / n_years) - 1) * 100 if n_years > 0.1 else total_ret
        ann_vol       = float(np.std(returns_daily)) * np.sqrt(252) * 100
        rf_daily      = 0.045 / 252
        sharpe        = float((np.mean(returns_daily) - rf_daily) / (np.std(returns_daily) + 1e-10) * np.sqrt(252))

        # Max drawdown
        running_max = np.maximum.accumulate(vals)
        drawdowns   = (vals - running_max) / running_max * 100
        max_dd      = float(np.min(drawdowns))

        # Sortino (downside deviation)
        neg_ret   = returns_daily[returns_daily < rf_daily]
        down_dev  = float(np.std(neg_ret)) * np.sqrt(252) if len(neg_ret) > 0 else 1e-10
        sortino   = float((np.mean(returns_daily) - rf_daily) / down_dev * np.sqrt(252))

        # Calmar
        calmar = ann_ret / abs(max_dd) if max_dd != 0 else 0

        return {
            "label":       label,
            "total_return": round(total_ret, 2),
            "ann_return":   round(ann_ret, 2),
            "ann_vol":      round(ann_vol, 2),
            "sharpe":       round(sharpe, 2),
            "sortino":      round(sortino, 2),
            "max_drawdown": round(max_dd, 2),
            "calmar":       round(calmar, 2),
            "final_value":  round(float(vals[-1]), 2),
        }

    port_metrics = metrics(port_values, "Portfolio")
    spy_metrics  = metrics(spy_values,  "SPY (Benchmark)")

    # ── Annual return breakdown ───────────────────────────────────────────────
    df_port = pd.Series(port_values, index=dates)
    annual_returns = []
    for year, grp in df_port.groupby(df_port.index.year):
        if len(grp) < 2:
            continue
        yr_ret = (grp.iloc[-1] / grp.iloc[0] - 1) * 100
        annual_returns.append({"year": int(year), "return": round(float(yr_ret), 2)})

    # ── Time series for chart (monthly sampling to keep payload small) ────────
    df_all = pd.DataFrame({"portfolio": port_values, "spy": spy_values}, index=dates)
    monthly = df_all.resample("ME").last().dropna(how="all")

    # Normalise to 100 at start
    p0 = float(monthly["portfolio"].iloc[0]) if len(monthly) > 0 else initial_value
    s0 = float(monthly["spy"].iloc[0])       if len(monthly) > 0 else initial_value

    chart_data = []
    for date, row in monthly.iterrows():
        chart_data.append({
            "date":      date.strftime("%Y-%m"),
            "portfolio": round(float(row["portfolio"]) / p0 * 100, 2),
            "spy":       round(float(row["spy"]) / s0 * 100, 2) if not np.isnan(row["spy"]) else None,
        })

    return {
        "portfolio_metrics": port_metrics,
        "spy_metrics":       spy_metrics,
        "annual_returns":    annual_returns,
        "chart_data":        chart_data,
        "period_years":      period_years,
        "rebalance_freq":    rebalance_freq,
        "initial_value":     initial_value,
        "missing_tickers":   missing,
        "start_date":        start,
        "end_date":          end,
    }
