"""
Trend Scanner
=============
Scans Reddit, StockTwits, and Google Trends for emerging investment ideas,
then filters and scores them against the investor's risk profile.

Sources:
  1. Reddit  — r/investing, r/stocks, r/wallstreetbets, r/smallcapstocks (public JSON)
  2. StockTwits — public trending tickers endpoint
  3. Google Trends — pytrends rising queries for finance-related terms

Risk filtering:
  capital_preservation → low-vol, established tickers only
  income              → dividend-proxy ETFs, low-vol
  balanced            → moderate vol, exclude pure meme picks
  growth              → all candidates including speculative
"""

import re
import time
import json
import urllib.request
import urllib.error
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from collections import defaultdict
from market_data import ETF_UNIVERSE

try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False


# ── Constants ─────────────────────────────────────────────────────────────────

REDDIT_SUBREDDITS = [
    "investing", "stocks", "wallstreetbets", "smallcapstocks",
    "stockmarket", "Superstonk", "options",
]

REDDIT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (AI Portfolio Scanner 1.0)"
}

# Tickers to always ignore (common English words / noise)
TICKER_BLACKLIST = {
    "I", "A", "IT", "BE", "AT", "AM", "PM", "GO", "US", "THE", "FOR",
    "OR", "AND", "TO", "ON", "IN", "IF", "OF", "IS", "SO", "MY",
    "ALL", "CAN", "ARE", "HAS", "CEO", "EPS", "IPO", "SEC", "ETF",
    "GDP", "IMO", "DD", "OG", "OP", "AI", "TV", "OK", "RE",
    "ATH", "FUD", "WSB", "DCA", "YOY", "QOQ", "FCF", "ROI",
}

# Risk profile volatility gates
RISK_VOL_GATES = {
    "capital_preservation": 18,
    "income":               22,
    "balanced":             35,
    "growth":               999,
}

RISK_SPEC_GATES = {
    "capital_preservation": 30,
    "income":               40,
    "balanced":             65,
    "growth":               100,
}


# ── Reddit scraper ─────────────────────────────────────────────────────────────

def _fetch_reddit(subreddit: str, sort: str = "hot", limit: int = 50) -> list[dict]:
    url = f"https://www.reddit.com/r/{subreddit}/{sort}.json?limit={limit}"
    req = urllib.request.Request(url, headers=REDDIT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        return data.get("data", {}).get("children", [])
    except Exception:
        return []


def _extract_tickers(text: str) -> list[str]:
    """Extract $TICKER or ALL-CAPS 1-5 letter words that look like tickers."""
    # $TICKER pattern (explicit)
    dollar_tickers = re.findall(r'\$([A-Z]{1,5})\b', text)
    # ALL-CAPS words 2-5 chars (heuristic)
    caps_words = re.findall(r'\b([A-Z]{2,5})\b', text)
    candidates = set(dollar_tickers + caps_words) - TICKER_BLACKLIST
    return list(candidates)


def scan_reddit(subreddits: list[str] = None, posts_per_sub: int = 40) -> dict[str, dict]:
    """
    Returns {ticker: {mentions, score, subreddits, sample_titles}}
    Score = sum of (upvotes + 1) * recency_weight per post mentioning the ticker.
    """
    subreddits = subreddits or REDDIT_SUBREDDITS
    ticker_data: dict[str, dict] = defaultdict(lambda: {
        "mentions": 0, "score": 0.0,
        "subreddits": set(), "sample_titles": [],
    })

    now = time.time()

    for sub in subreddits:
        posts = _fetch_reddit(sub, sort="hot", limit=posts_per_sub)
        for post in posts:
            d = post.get("data", {})
            title   = d.get("title", "")
            selftext = d.get("selftext", "")
            ups      = max(1, d.get("ups", 1))
            created  = d.get("created_utc", now)

            # Recency weight: posts in last 24h get 2x, last 48h 1.5x, else 1x
            age_hours = (now - created) / 3600
            recency   = 2.0 if age_hours < 24 else (1.5 if age_hours < 48 else 1.0)

            tickers = _extract_tickers(title + " " + selftext[:500])
            for t in tickers:
                ticker_data[t]["mentions"] += 1
                ticker_data[t]["score"]    += ups * recency
                ticker_data[t]["subreddits"].add(sub)
                if len(ticker_data[t]["sample_titles"]) < 2:
                    ticker_data[t]["sample_titles"].append(title[:80])

        time.sleep(0.3)  # be polite to Reddit

    # Convert sets to lists for JSON serialisation
    for t in ticker_data:
        ticker_data[t]["subreddits"] = list(ticker_data[t]["subreddits"])

    return dict(ticker_data)


# ── StockTwits ─────────────────────────────────────────────────────────────────

def scan_stocktwits() -> dict[str, dict]:
    """Fetch trending tickers from StockTwits public API."""
    url = "https://api.stocktwits.com/api/2/trending/symbols.json"
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read())
        symbols = data.get("symbols", [])
        return {
            s["symbol"]: {
                "watchlist_count": s.get("watchlist_count", 0),
                "title": s.get("title", ""),
            }
            for s in symbols
        }
    except Exception:
        return {}


# ── Google Trends ──────────────────────────────────────────────────────────────

def scan_google_trends(keywords: list[str] = None) -> list[str]:
    """Return list of rising finance-related search queries."""
    if not PYTRENDS_AVAILABLE:
        return []
    keywords = keywords or ["stock to buy", "best ETF", "small cap stock", "breakout stock"]
    rising_tickers = []
    try:
        pt = TrendReq(hl="en-US", tz=360, timeout=(5, 10))
        for kw in keywords[:2]:  # limit to avoid rate limits
            pt.build_payload([kw], timeframe="now 7-d", geo="US")
            related = pt.related_queries()
            rising_df = related.get(kw, {}).get("rising")
            if rising_df is not None and not rising_df.empty:
                for q in rising_df["query"].head(5):
                    tickers = _extract_tickers(q.upper())
                    rising_tickers.extend(tickers)
            time.sleep(1)
    except Exception:
        pass
    return list(set(rising_tickers) - TICKER_BLACKLIST)


# ── Market data enrichment ─────────────────────────────────────────────────────

def _enrich_ticker(ticker: str) -> dict | None:
    """Fetch price, vol, momentum, and basic info for a ticker."""
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(period="3mo", interval="1d", auto_adjust=True)
        if hist.empty or len(hist) < 20:
            return None

        prices = hist["Close"].dropna().values
        returns = np.diff(prices) / prices[:-1]

        ann_vol    = float(np.std(returns)) * np.sqrt(252) * 100
        mom_1m     = float(prices[-1] / prices[-21] - 1) * 100 if len(prices) >= 21 else 0.0
        mom_3m     = float(prices[-1] / prices[0]  - 1) * 100
        current_px = float(prices[-1])

        # Basic info (best-effort)
        info = {}
        try:
            info = tk.fast_info
        except Exception:
            pass

        market_cap = getattr(info, "market_cap", None)
        name       = getattr(info, "exchange", ticker)

        # Speculation score: 0 (safe) → 100 (very speculative)
        # High vol, micro-cap, negative momentum → more speculative
        vol_score  = min(100, ann_vol * 1.5)
        cap_score  = 0 if (market_cap and market_cap > 10e9) else \
                    (20 if (market_cap and market_cap > 2e9) else \
                    (50 if (market_cap and market_cap > 300e6) else 80))
        spec_score = int(min(100, vol_score * 0.6 + cap_score * 0.4))

        return {
            "ticker":      ticker,
            "current_price": round(current_px, 2),
            "ann_vol":     round(ann_vol, 1),
            "mom_1m":      round(mom_1m, 1),
            "mom_3m":      round(mom_3m, 1),
            "spec_score":  spec_score,
            "market_cap":  market_cap,
        }
    except Exception:
        return None


# ── Risk filtering ─────────────────────────────────────────────────────────────

def _risk_label(spec_score: int) -> str:
    if spec_score >= 70:
        return "high"
    if spec_score >= 40:
        return "moderate"
    return "low"


def _fits_profile(enriched: dict, goal: str, risk_tolerance: float) -> bool:
    vol_gate  = RISK_VOL_GATES.get(goal, 999)
    spec_gate = RISK_SPEC_GATES.get(goal, 100)
    return enriched["ann_vol"] <= vol_gate and enriched["spec_score"] <= spec_gate


# ── ETF fallback helpers ──────────────────────────────────────────────────────

# Maps sector keywords found in yfinance info to our ETF universe sectors
_SECTOR_TO_ETF: dict[str, list[str]] = {
    "Technology":             ["XLK", "QQQ", "AIQ", "CLOU"],
    "Semiconductors":         ["SOXX", "XLK"],
    "Biotechnology":          ["IBB", "XBI"],
    "Healthcare":             ["XLV", "IBB"],
    "Financials":             ["XLF", "FINX"],
    "Energy":                 ["XLE", "USO"],
    "Consumer Discretionary": ["XLY"],
    "Consumer Staples":       ["XLP"],
    "Industrials":            ["XLI", "PAVE"],
    "Materials":              ["XLB"],
    "Utilities":              ["XLU"],
    "Communication Services": ["XLC"],
    "Real Estate":            ["VNQ"],
    "Precious Metals":        ["GLD", "SLV"],
    "Cryptocurrency":         ["BITO"],
    "Emerging Markets":       ["EEM"],
    "China":                  ["MCHI"],
    "India":                  ["INDA"],
    "Southeast Asia":         ["EIDO", "VNM"],
    "Broad Market":           ["SPY", "QQQ", "IWM"],
}

def _etf_proxy_for_sector(sector: str) -> str | None:
    """Return the best-fit ETF ticker from our universe for a given sector."""
    for key, etfs in _SECTOR_TO_ETF.items():
        if key.lower() in sector.lower() or sector.lower() in key.lower():
            for etf in etfs:
                if etf in ETF_UNIVERSE:
                    return etf
    return None


def _get_ticker_sector(ticker: str) -> str:
    """Best-effort sector lookup from yfinance fast_info / info."""
    try:
        info = yf.Ticker(ticker).info
        return info.get("sector", "") or info.get("category", "")
    except Exception:
        return ""


def _build_etf_fallback(
    trending_ticker: str,
    meta: dict,
    goal: str,
    risk_tolerance: float,
) -> dict | None:
    """
    For a trending ticker that isn't in ETF_UNIVERSE and failed enrichment
    (delisted, no data, too speculative to show), find a proxy ETF from
    our universe that covers the same theme/sector.
    Returns a result dict flagged as etf_proxy=True, or None if no proxy found.
    """
    # Try to determine the sector from yfinance
    sector = _get_ticker_sector(trending_ticker)
    proxy_ticker = _etf_proxy_for_sector(sector) if sector else None

    # If no sector match, fall back to broad market ETF for conservative profiles,
    # or skip for growth (they can handle individual names)
    if not proxy_ticker:
        if goal in ("capital_preservation", "income"):
            proxy_ticker = "SPY"
        else:
            return None

    # Enrich the proxy ETF
    enriched = _enrich_ticker(proxy_ticker)
    if not enriched:
        return None

    fits     = _fits_profile(enriched, goal, risk_tolerance)
    risk_lbl = _risk_label(enriched["spec_score"])
    etf_info = ETF_UNIVERSE.get(proxy_ticker, {})

    return {
        "ticker":         proxy_ticker,
        "name":           etf_info.get("name", proxy_ticker),
        "current_price":  enriched["current_price"],
        "ann_vol":        enriched["ann_vol"],
        "mom_1m":         enriched["mom_1m"],
        "mom_3m":         enriched["mom_3m"],
        "spec_score":     enriched["spec_score"],
        "risk_level":     risk_lbl,
        "fits_profile":   fits,
        "trend_score":    round(meta["trend_score"] * 0.8, 1),  # slight discount vs direct ticker
        "sources":        meta["sources"],
        "sample_titles":  meta.get("sample_titles", []),
        "etf_proxy":      True,
        "etf_proxy_for":  trending_ticker,
        "etf_proxy_note": f"ETF proxy — {proxy_ticker} covers {sector or 'this theme'} "
                          f"(original ticker {trending_ticker} outside investable universe)",
    }


# ── Master scan ────────────────────────────────────────────────────────────────

def run_trend_scan(goal: str = "balanced", risk_tolerance: float = 15) -> dict:
    """
    Full pipeline: scrape → deduplicate → enrich → ETF fallback → filter → rank.

    For trending tickers that are outside our investable universe (no data,
    delisted, OTC micro-caps), we attempt to surface a related ETF from
    ETF_UNIVERSE so the investor still gets exposure to the theme.
    """
    # 1. Gather raw signals
    reddit_data     = scan_reddit()
    stocktwits_data = scan_stocktwits()
    google_tickers  = scan_google_trends()

    # 2. Merge into unified candidate set
    all_candidates: dict[str, dict] = {}

    for ticker, rd in reddit_data.items():
        if rd["mentions"] < 2:
            continue
        all_candidates.setdefault(ticker, {"sources": [], "trend_score": 0.0})
        all_candidates[ticker]["sources"].append(
            f"Reddit ({rd['mentions']} mentions across {', '.join(rd['subreddits'][:3])})"
        )
        all_candidates[ticker]["trend_score"] += min(50, rd["score"] / 500)
        all_candidates[ticker]["sample_titles"] = rd.get("sample_titles", [])

    for ticker, sd in stocktwits_data.items():
        all_candidates.setdefault(ticker, {"sources": [], "trend_score": 0.0})
        all_candidates[ticker]["sources"].append(
            f"StockTwits trending ({sd.get('watchlist_count', '?')} watchers)"
        )
        all_candidates[ticker]["trend_score"] += 20
        all_candidates[ticker]["stocktwits_name"] = sd.get("title", "")

    for ticker in google_tickers:
        all_candidates.setdefault(ticker, {"sources": [], "trend_score": 0.0})
        all_candidates[ticker]["sources"].append("Google Trends rising")
        all_candidates[ticker]["trend_score"] += 15

    if not all_candidates:
        return {"opportunities": [], "scanned": 0, "as_of": datetime.utcnow().isoformat()}

    # 3. Enrich with market data (top 40 by trend_score)
    top_candidates = sorted(all_candidates.items(), key=lambda x: x[1]["trend_score"], reverse=True)[:40]

    results = []
    etf_proxy_tickers_used: set[str] = set()  # avoid duplicate proxy ETFs

    for ticker, meta in top_candidates:
        enriched = _enrich_ticker(ticker)

        if enriched:
            # Direct ticker — use as-is
            fits     = _fits_profile(enriched, goal, risk_tolerance)
            risk_lbl = _risk_label(enriched["spec_score"])
            mom_bonus   = max(0, enriched["mom_1m"]) * 0.3
            fit_bonus   = 10 if fits else 0
            final_score = min(100, meta["trend_score"] + mom_bonus + fit_bonus)

            results.append({
                "ticker":        ticker,
                "name":          meta.get("stocktwits_name", ETF_UNIVERSE.get(ticker, {}).get("name", ticker)),
                "current_price": enriched["current_price"],
                "ann_vol":       enriched["ann_vol"],
                "mom_1m":        enriched["mom_1m"],
                "mom_3m":        enriched["mom_3m"],
                "spec_score":    enriched["spec_score"],
                "risk_level":    risk_lbl,
                "fits_profile":  fits,
                "trend_score":   round(final_score, 1),
                "sources":       meta["sources"],
                "sample_titles": meta.get("sample_titles", []),
                "etf_proxy":     False,
            })
        else:
            # Ticker failed enrichment (OTC, delisted, no data) → try ETF proxy
            proxy = _build_etf_fallback(ticker, meta, goal, risk_tolerance)
            if proxy and proxy["ticker"] not in etf_proxy_tickers_used:
                etf_proxy_tickers_used.add(proxy["ticker"])
                results.append(proxy)

    # 4. Sort: fits_profile first, then by trend_score
    results.sort(key=lambda x: (not x["fits_profile"], -x["trend_score"]))

    return {
        "opportunities":   results[:25],
        "scanned":         len(all_candidates),
        "profile_matches": sum(1 for r in results if r["fits_profile"]),
        "goal":            goal,
        "risk_tolerance":  risk_tolerance,
        "as_of":           datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
