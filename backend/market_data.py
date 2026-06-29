import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional
import logging

logger = logging.getLogger(__name__)

ETF_UNIVERSE = {
    # ── Broad Market ──────────────────────────────────────────────
    "SPY": {"name": "S&P 500 ETF", "asset_class": "US Equity", "sector": "Broad Market"},
    "QQQ": {"name": "Nasdaq 100 ETF", "asset_class": "US Equity", "sector": "Technology"},
    "IWM": {"name": "Russell 2000 ETF", "asset_class": "US Equity", "sector": "Small Cap"},
    # ── Sector ETFs (SPDR) ────────────────────────────────────────
    "XLK": {"name": "Technology Select Sector SPDR", "asset_class": "US Equity", "sector": "Technology"},
    "XLF": {"name": "Financial Select Sector SPDR", "asset_class": "US Equity", "sector": "Financials"},
    "XLE": {"name": "Energy Select Sector SPDR", "asset_class": "US Equity", "sector": "Energy"},
    "XLV": {"name": "Health Care Select Sector SPDR", "asset_class": "US Equity", "sector": "Healthcare"},
    "XLY": {"name": "Consumer Discretionary SPDR", "asset_class": "US Equity", "sector": "Consumer Discretionary"},
    "XLP": {"name": "Consumer Staples SPDR", "asset_class": "US Equity", "sector": "Consumer Staples"},
    "XLI": {"name": "Industrial Select Sector SPDR", "asset_class": "US Equity", "sector": "Industrials"},
    "XLU": {"name": "Utilities Select Sector SPDR", "asset_class": "US Equity", "sector": "Utilities"},
    "XLB": {"name": "Materials Select Sector SPDR", "asset_class": "US Equity", "sector": "Materials"},
    "XLC": {"name": "Communication Services SPDR", "asset_class": "US Equity", "sector": "Communication Services"},
    "SOXX": {"name": "iShares Semiconductor ETF", "asset_class": "US Equity", "sector": "Semiconductors"},
    "IBB": {"name": "iShares Biotech ETF", "asset_class": "US Equity", "sector": "Biotechnology"},
    # ── International ─────────────────────────────────────────────
    "EFA": {"name": "MSCI EAFE ETF", "asset_class": "International Equity", "sector": "Developed Markets"},
    "EEM": {"name": "MSCI Emerging Markets ETF", "asset_class": "International Equity", "sector": "Emerging Markets"},
    # ── Fixed Income ──────────────────────────────────────────────
    "BND": {"name": "Total Bond Market ETF", "asset_class": "Fixed Income", "sector": "Broad Bonds"},
    "TLT": {"name": "20+ Year Treasury ETF", "asset_class": "Fixed Income", "sector": "Long-Term Treasury"},
    "HYG": {"name": "High Yield Corporate Bond ETF", "asset_class": "Fixed Income", "sector": "High Yield"},
    "LQD": {"name": "Investment Grade Corporate Bond ETF", "asset_class": "Fixed Income", "sector": "Investment Grade"},
    "SHY": {"name": "1-3 Year Treasury ETF", "asset_class": "Fixed Income", "sector": "Short-Term Treasury"},
    "TIP": {"name": "TIPS ETF", "asset_class": "Fixed Income", "sector": "Inflation-Protected"},
    # ── Commodities & Alternatives ────────────────────────────────
    "GLD": {"name": "Gold ETF", "asset_class": "Commodities", "sector": "Precious Metals"},
    "SLV": {"name": "Silver ETF", "asset_class": "Commodities", "sector": "Precious Metals"},
    "USO": {"name": "Oil Fund ETF", "asset_class": "Commodities", "sector": "Energy"},
    "VNQ": {"name": "Real Estate ETF", "asset_class": "Real Estate", "sector": "REITs"},
    "DBC": {"name": "Commodity Index ETF", "asset_class": "Commodities", "sector": "Diversified Commodities"},
    # ── Geographic ETFs ───────────────────────────────────────────
    "VT":   {"name": "Vanguard Total World Stock ETF",       "asset_class": "Global Equity",        "sector": "Global"},
    "ACWI": {"name": "iShares MSCI ACWI ETF",               "asset_class": "Global Equity",        "sector": "Global"},
    "EWC":  {"name": "iShares MSCI Canada ETF",             "asset_class": "International Equity", "sector": "Canada"},
    "VGK":  {"name": "Vanguard FTSE Europe ETF",            "asset_class": "International Equity", "sector": "Europe"},
    "EWU":  {"name": "iShares MSCI United Kingdom ETF",     "asset_class": "International Equity", "sector": "United Kingdom"},
    "EWJ":  {"name": "iShares MSCI Japan ETF",              "asset_class": "International Equity", "sector": "Japan"},
    "MCHI": {"name": "iShares MSCI China ETF",              "asset_class": "International Equity", "sector": "China"},
    "INDA": {"name": "iShares MSCI India ETF",              "asset_class": "International Equity", "sector": "India"},
    "EWZ":  {"name": "iShares MSCI Brazil ETF",             "asset_class": "International Equity", "sector": "Latin America"},
    "EWW":  {"name": "iShares MSCI Mexico ETF",             "asset_class": "International Equity", "sector": "Latin America"},
    "ECH":  {"name": "iShares MSCI Chile ETF",              "asset_class": "International Equity", "sector": "Latin America"},
    "EZA":  {"name": "iShares MSCI South Africa ETF",       "asset_class": "International Equity", "sector": "Africa"},
    "EWY":  {"name": "iShares MSCI South Korea ETF",        "asset_class": "International Equity", "sector": "Asia"},
    "EWT":  {"name": "iShares MSCI Taiwan ETF",             "asset_class": "International Equity", "sector": "Asia"},
    "EIDO": {"name": "iShares MSCI Indonesia ETF",          "asset_class": "International Equity", "sector": "Southeast Asia"},
    "EWA":  {"name": "iShares MSCI Australia ETF",          "asset_class": "International Equity", "sector": "Asia Pacific"},
    "EWM":  {"name": "iShares MSCI Malaysia ETF",           "asset_class": "International Equity", "sector": "Southeast Asia"},
}

MOCK_RETURNS = {
    "SPY": 0.124, "QQQ": 0.178, "IWM": 0.087, "EFA": 0.072, "EEM": 0.063,
    "BND": 0.032, "TLT": 0.015, "GLD": 0.089, "SLV": 0.071, "USO": 0.045,
    "VNQ": 0.068, "HYG": 0.058, "LQD": 0.041, "SHY": 0.048, "TIP": 0.038, "DBC": 0.052,
}

MOCK_VOLS = {
    "SPY": 0.162, "QQQ": 0.228, "IWM": 0.198, "EFA": 0.151, "EEM": 0.189,
    "BND": 0.038, "TLT": 0.112, "GLD": 0.143, "SLV": 0.268, "USO": 0.342,
    "VNQ": 0.175, "HYG": 0.082, "LQD": 0.071, "SHY": 0.018, "TIP": 0.054, "DBC": 0.178,
}


def _download_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    """Download a batch of tickers; returns Close prices as a DataFrame indexed by ticker."""
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        raw = yf.download(tickers, start=start, end=end, progress=False,
                          auto_adjust=True, threads=False)
    if raw.empty:
        return pd.DataFrame()
    if len(tickers) == 1:
        close = raw[["Close"]].copy()
        close.columns = tickers
    else:
        close = raw["Close"].copy()
        if hasattr(close.columns, "tolist"):
            close.columns = [c if isinstance(c, str) else str(c) for c in close.columns]
    return close.dropna(how="all")


def fetch_market_data(tickers: list[str], period_years: int = 3) -> dict:
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365 * period_years)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    BATCH = 8   # download in groups of 8 to avoid yfinance bulk-download glitches
    all_prices: dict[str, pd.Series] = {}

    for i in range(0, len(tickers), BATCH):
        batch = tickers[i: i + BATCH]
        try:
            close = _download_batch(batch, start_str, end_str)
            if close.empty:
                continue
            for t in batch:
                if t in close.columns:
                    series = close[t].dropna()
                    if len(series) > 20:
                        all_prices[t] = series
        except Exception as e:
            logger.warning(f"Batch {batch} failed: {e}")

    result = {}
    for ticker in tickers:
        if ticker not in all_prices:
            result[ticker] = _mock_data(ticker)
            continue
        prices_series = all_prices[ticker]
        monthly_prices = prices_series.resample("ME").last()
        monthly_returns = monthly_prices.pct_change().dropna()
        if len(monthly_returns) < 12:
            result[ticker] = _mock_data(ticker)
            continue
        try:
            result[ticker] = _compute_metrics(ticker, monthly_returns, monthly_prices)
        except Exception as e:
            logger.warning(f"Metrics failed for {ticker}: {e}")
            result[ticker] = _mock_data(ticker)

    return result


def _compute_metrics(ticker: str, returns: pd.Series, prices: pd.Series) -> dict:
    ann_return = (1 + returns.mean()) ** 12 - 1
    ann_vol = returns.std() * np.sqrt(12)
    rf = 0.045
    sharpe = (ann_return - rf) / ann_vol if ann_vol > 0 else 0

    # Momentum: 3m and 12m price change
    prices_clean = prices.dropna()
    mom_3m = (prices_clean.iloc[-1] / prices_clean.iloc[-4] - 1) if len(prices_clean) >= 4 else 0
    mom_12m = (prices_clean.iloc[-1] / prices_clean.iloc[-13] - 1) if len(prices_clean) >= 13 else 0

    # Max drawdown
    cum = (1 + returns).cumprod()
    rolling_max = cum.cummax()
    drawdown = (cum - rolling_max) / rolling_max
    max_dd = drawdown.min()

    # Moving averages (on monthly)
    ma_3 = prices_clean.rolling(3).mean().iloc[-1] if len(prices_clean) >= 3 else prices_clean.iloc[-1]
    ma_12 = prices_clean.rolling(12).mean().iloc[-1] if len(prices_clean) >= 12 else prices_clean.iloc[-1]
    trend_score = 1 if prices_clean.iloc[-1] > ma_12 else -1

    return {
        "ticker": ticker,
        "ann_return": float(ann_return),
        "ann_vol": float(ann_vol),
        "sharpe": float(sharpe),
        "max_drawdown": float(max_dd),
        "mom_3m": float(mom_3m),
        "mom_12m": float(mom_12m),
        "trend": int(trend_score),
        "monthly_returns": returns.tolist(),
        "dates": [str(d.date()) for d in returns.index],
        "current_price": float(prices_clean.iloc[-1]),
        **ETF_UNIVERSE.get(ticker, {}),
    }


def _mock_data(ticker: str) -> dict:
    np.random.seed(hash(ticker) % 2**31)
    ann_r = MOCK_RETURNS.get(ticker, 0.07)
    ann_v = MOCK_VOLS.get(ticker, 0.15)
    monthly_r = ann_r / 12
    monthly_v = ann_v / np.sqrt(12)
    n = 36
    returns = np.random.normal(monthly_r, monthly_v, n).tolist()
    rf = 0.045
    sharpe = (ann_r - rf) / ann_v

    return {
        "ticker": ticker,
        "ann_return": ann_r,
        "ann_vol": ann_v,
        "sharpe": sharpe,
        "max_drawdown": -ann_v * 1.5,
        "mom_3m": ann_r * 0.25,
        "mom_12m": ann_r * 0.9,
        "trend": 1 if ann_r > 0.05 else -1,
        "monthly_returns": returns,
        "dates": [],
        "current_price": 100.0,
        **ETF_UNIVERSE.get(ticker, {}),
    }


def get_covariance_matrix(market_data: dict) -> pd.DataFrame:
    tickers = list(market_data.keys())
    min_len = min(len(market_data[t]["monthly_returns"]) for t in tickers)
    returns_matrix = pd.DataFrame(
        {t: market_data[t]["monthly_returns"][-min_len:] for t in tickers}
    )
    cov_monthly = returns_matrix.cov()
    return cov_monthly * 12


def get_correlation_matrix(market_data: dict) -> pd.DataFrame:
    tickers = list(market_data.keys())
    min_len = min(len(market_data[t]["monthly_returns"]) for t in tickers)
    returns_matrix = pd.DataFrame(
        {t: market_data[t]["monthly_returns"][-min_len:] for t in tickers}
    )
    return returns_matrix.corr()


def filter_by_exclusions(
    tickers: list[str],
    excluded_sectors: list[str] = None,
    excluded_assets: list[str] = None,
) -> list[str]:
    excluded_sectors = [s.lower() for s in (excluded_sectors or [])]
    excluded_assets = [a.upper() for a in (excluded_assets or [])]

    result = []
    for t in tickers:
        if t in excluded_assets:
            continue
        info = ETF_UNIVERSE.get(t, {})
        sector = info.get("sector", "").lower()
        asset_class = info.get("asset_class", "").lower()
        if any(exc in sector or exc in asset_class for exc in excluded_sectors):
            continue
        result.append(t)
    return result
