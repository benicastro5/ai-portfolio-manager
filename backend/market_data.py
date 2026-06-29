import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import threading
import logging

logger = logging.getLogger(__name__)

# ── In-memory cache ───────────────────────────────────────────────────────────
# Market data: refreshed every 60 minutes
# Fundamentals: refreshed every 24 hours
_cache: dict = {}          # ticker -> {data, fetched_at}
_cache_lock = threading.Lock()
_PRICE_TTL = 3600          # 1 hour
_FUND_TTL  = 86400         # 24 hours

def _cache_get(key: str, ttl: int):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (datetime.now() - entry["fetched_at"]).total_seconds() < ttl:
            return entry["data"]
    return None

def _cache_set(key: str, data):
    with _cache_lock:
        _cache[key] = {"data": data, "fetched_at": datetime.now()}

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
    # ── Individual Stocks — Technology ───────────────────────────
    "AAPL":  {"name": "Apple Inc.",                    "asset_class": "US Equity", "sector": "Technology"},
    "MSFT":  {"name": "Microsoft Corp.",               "asset_class": "US Equity", "sector": "Technology"},
    "NVDA":  {"name": "NVIDIA Corp.",                  "asset_class": "US Equity", "sector": "Semiconductors"},
    "GOOGL": {"name": "Alphabet Inc.",                 "asset_class": "US Equity", "sector": "Technology"},
    "META":  {"name": "Meta Platforms Inc.",           "asset_class": "US Equity", "sector": "Technology"},
    "AMZN":  {"name": "Amazon.com Inc.",               "asset_class": "US Equity", "sector": "Technology"},
    "TSLA":  {"name": "Tesla Inc.",                    "asset_class": "US Equity", "sector": "Consumer Discretionary"},
    "AVGO":  {"name": "Broadcom Inc.",                 "asset_class": "US Equity", "sector": "Semiconductors"},
    "ORCL":  {"name": "Oracle Corp.",                  "asset_class": "US Equity", "sector": "Technology"},
    "CRM":   {"name": "Salesforce Inc.",               "asset_class": "US Equity", "sector": "Technology"},
    "AMD":   {"name": "Advanced Micro Devices",        "asset_class": "US Equity", "sector": "Semiconductors"},
    "INTC":  {"name": "Intel Corp.",                   "asset_class": "US Equity", "sector": "Semiconductors"},
    "ADBE":  {"name": "Adobe Inc.",                    "asset_class": "US Equity", "sector": "Technology"},
    "NOW":   {"name": "ServiceNow Inc.",               "asset_class": "US Equity", "sector": "Technology"},
    "UBER":  {"name": "Uber Technologies",             "asset_class": "US Equity", "sector": "Technology"},
    # ── Individual Stocks — Financials ───────────────────────────
    "JPM":   {"name": "JPMorgan Chase & Co.",          "asset_class": "US Equity", "sector": "Financials"},
    "BAC":   {"name": "Bank of America Corp.",         "asset_class": "US Equity", "sector": "Financials"},
    "GS":    {"name": "Goldman Sachs Group",           "asset_class": "US Equity", "sector": "Financials"},
    "MS":    {"name": "Morgan Stanley",                "asset_class": "US Equity", "sector": "Financials"},
    "BRK-B": {"name": "Berkshire Hathaway B",         "asset_class": "US Equity", "sector": "Financials"},
    "V":     {"name": "Visa Inc.",                     "asset_class": "US Equity", "sector": "Financials"},
    "MA":    {"name": "Mastercard Inc.",               "asset_class": "US Equity", "sector": "Financials"},
    "BLK":   {"name": "BlackRock Inc.",                "asset_class": "US Equity", "sector": "Financials"},
    "SCHW":  {"name": "Charles Schwab Corp.",          "asset_class": "US Equity", "sector": "Financials"},
    "AXP":   {"name": "American Express Co.",          "asset_class": "US Equity", "sector": "Financials"},
    # ── Individual Stocks — Healthcare ───────────────────────────
    "JNJ":   {"name": "Johnson & Johnson",             "asset_class": "US Equity", "sector": "Healthcare"},
    "UNH":   {"name": "UnitedHealth Group",            "asset_class": "US Equity", "sector": "Healthcare"},
    "LLY":   {"name": "Eli Lilly and Co.",             "asset_class": "US Equity", "sector": "Healthcare"},
    "ABBV":  {"name": "AbbVie Inc.",                   "asset_class": "US Equity", "sector": "Healthcare"},
    "PFE":   {"name": "Pfizer Inc.",                   "asset_class": "US Equity", "sector": "Healthcare"},
    "MRK":   {"name": "Merck & Co.",                   "asset_class": "US Equity", "sector": "Healthcare"},
    "TMO":   {"name": "Thermo Fisher Scientific",      "asset_class": "US Equity", "sector": "Healthcare"},
    "ABT":   {"name": "Abbott Laboratories",           "asset_class": "US Equity", "sector": "Healthcare"},
    "ISRG":  {"name": "Intuitive Surgical",            "asset_class": "US Equity", "sector": "Healthcare"},
    # ── Individual Stocks — Consumer ─────────────────────────────
    "WMT":   {"name": "Walmart Inc.",                  "asset_class": "US Equity", "sector": "Consumer Staples"},
    "COST":  {"name": "Costco Wholesale Corp.",        "asset_class": "US Equity", "sector": "Consumer Staples"},
    "PG":    {"name": "Procter & Gamble Co.",          "asset_class": "US Equity", "sector": "Consumer Staples"},
    "KO":    {"name": "Coca-Cola Co.",                 "asset_class": "US Equity", "sector": "Consumer Staples"},
    "PEP":   {"name": "PepsiCo Inc.",                  "asset_class": "US Equity", "sector": "Consumer Staples"},
    "MCD":   {"name": "McDonald's Corp.",              "asset_class": "US Equity", "sector": "Consumer Discretionary"},
    "NKE":   {"name": "Nike Inc.",                     "asset_class": "US Equity", "sector": "Consumer Discretionary"},
    "SBUX":  {"name": "Starbucks Corp.",               "asset_class": "US Equity", "sector": "Consumer Discretionary"},
    "HD":    {"name": "Home Depot Inc.",               "asset_class": "US Equity", "sector": "Consumer Discretionary"},
    "TGT":   {"name": "Target Corp.",                  "asset_class": "US Equity", "sector": "Consumer Discretionary"},
    # ── Individual Stocks — Energy ───────────────────────────────
    "XOM":   {"name": "Exxon Mobil Corp.",             "asset_class": "US Equity", "sector": "Energy"},
    "CVX":   {"name": "Chevron Corp.",                 "asset_class": "US Equity", "sector": "Energy"},
    "COP":   {"name": "ConocoPhillips",                "asset_class": "US Equity", "sector": "Energy"},
    "SLB":   {"name": "SLB (Schlumberger)",            "asset_class": "US Equity", "sector": "Energy"},
    # ── Individual Stocks — Industrials ──────────────────────────
    "CAT":   {"name": "Caterpillar Inc.",              "asset_class": "US Equity", "sector": "Industrials"},
    "HON":   {"name": "Honeywell International",       "asset_class": "US Equity", "sector": "Industrials"},
    "UPS":   {"name": "United Parcel Service",         "asset_class": "US Equity", "sector": "Industrials"},
    "BA":    {"name": "Boeing Co.",                    "asset_class": "US Equity", "sector": "Industrials"},
    "RTX":   {"name": "RTX Corp. (Raytheon)",          "asset_class": "US Equity", "sector": "Industrials"},
    "GE":    {"name": "GE Aerospace",                  "asset_class": "US Equity", "sector": "Industrials"},
    "LMT":   {"name": "Lockheed Martin Corp.",         "asset_class": "US Equity", "sector": "Industrials"},
    # ── Individual Stocks — Communication ────────────────────────
    "NFLX":  {"name": "Netflix Inc.",                  "asset_class": "US Equity", "sector": "Communication Services"},
    "DIS":   {"name": "Walt Disney Co.",               "asset_class": "US Equity", "sector": "Communication Services"},
    "T":     {"name": "AT&T Inc.",                     "asset_class": "US Equity", "sector": "Communication Services"},
    "VZ":    {"name": "Verizon Communications",        "asset_class": "US Equity", "sector": "Communication Services"},
    "TMUS":  {"name": "T-Mobile US Inc.",              "asset_class": "US Equity", "sector": "Communication Services"},
    "SPOT":  {"name": "Spotify Technology",            "asset_class": "US Equity", "sector": "Communication Services"},
    # ── Individual Stocks — Real Estate ──────────────────────────
    "PLD":   {"name": "Prologis Inc.",                 "asset_class": "Real Estate", "sector": "REITs"},
    "AMT":   {"name": "American Tower Corp.",          "asset_class": "Real Estate", "sector": "REITs"},
    "EQIX":  {"name": "Equinix Inc.",                  "asset_class": "Real Estate", "sector": "REITs"},
    # ── Individual Stocks — Materials ────────────────────────────
    "LIN":   {"name": "Linde PLC",                     "asset_class": "US Equity", "sector": "Materials"},
    "APD":   {"name": "Air Products & Chemicals",      "asset_class": "US Equity", "sector": "Materials"},
    "NEM":   {"name": "Newmont Corp.",                 "asset_class": "US Equity", "sector": "Materials"},
    # ── Individual Stocks — International ADRs ───────────────────
    "TSM":   {"name": "Taiwan Semiconductor (ADR)",    "asset_class": "International Equity", "sector": "Semiconductors"},
    "ASML":  {"name": "ASML Holding (ADR)",            "asset_class": "International Equity", "sector": "Semiconductors"},
    "SAP":   {"name": "SAP SE (ADR)",                  "asset_class": "International Equity", "sector": "Technology"},
    "TM":    {"name": "Toyota Motor (ADR)",            "asset_class": "International Equity", "sector": "Consumer Discretionary"},
    "BABA":  {"name": "Alibaba Group (ADR)",           "asset_class": "International Equity", "sector": "Technology"},
    "NVO":   {"name": "Novo Nordisk (ADR)",            "asset_class": "International Equity", "sector": "Healthcare"},
    "SHEL":  {"name": "Shell PLC (ADR)",               "asset_class": "International Equity", "sector": "Energy"},
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


def _download_batch_safe(batch: list[str], start_str: str, end_str: str) -> dict[str, pd.Series]:
    """Download a batch of tickers, return {ticker: daily_close_series}."""
    import warnings
    prices = {}
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            raw = yf.download(
                batch, start=start_str, end=end_str,
                progress=False, auto_adjust=True, threads=True,
            )
        if raw.empty:
            return prices

        # yfinance returns MultiIndex (field, ticker) for multiple tickers
        # and flat columns for single ticker
        if len(batch) == 1:
            t = batch[0]
            if "Close" in raw.columns:
                s = raw["Close"].dropna()
                if len(s) > 20:
                    prices[t] = s
        else:
            close = raw["Close"] if "Close" in raw.columns else raw.xs("Close", axis=1, level=0)
            for t in batch:
                if t in close.columns:
                    s = close[t].dropna()
                    if len(s) > 20:
                        prices[t] = s
    except Exception as e:
        logger.warning(f"Batch download failed {batch[:3]}...: {e}")
    return prices


def fetch_market_data(tickers: list[str], period_years: int = 2) -> dict:
    # 1 year of data is enough for MPT — 3x faster download
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365 * period_years)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    # Serve cached tickers immediately
    result = {}
    uncached = []
    for t in tickers:
        cached = _cache_get(f"price:{t}", _PRICE_TTL)
        if cached:
            result[t] = cached
        else:
            uncached.append(t)

    if not uncached:
        logger.info("All tickers served from cache.")
        return result

    logger.info(f"Downloading {len(uncached)} uncached tickers in batches of 25...")
    all_prices: dict[str, pd.Series] = {}
    BATCH = 25
    for i in range(0, len(uncached), BATCH):
        batch = uncached[i:i + BATCH]
        all_prices.update(_download_batch_safe(batch, start_str, end_str))

    for t in uncached:
        if t not in all_prices:
            data = _mock_data(t)
        else:
            try:
                monthly = all_prices[t].resample("ME").last()
                rets = monthly.pct_change().dropna()
                data = _compute_metrics(t, rets, monthly) if len(rets) >= 12 else _mock_data(t)
            except Exception:
                data = _mock_data(t)
        _cache_set(f"price:{t}", data)
        result[t] = data

    logger.info(f"Done. {sum(1 for d in result.values() if d.get('dates'))} live / {len(result)} total")
    return result


def prewarm_cache():
    """Pre-fetch all tickers on server startup so the first user request is fast."""
    logger.info("Pre-warming market data cache for all tickers...")
    all_tickers = list(ETF_UNIVERSE.keys())
    fetch_market_data(all_tickers, period_years=2)
    logger.info(f"Cache pre-warm complete — {len(all_tickers)} tickers cached.")


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
