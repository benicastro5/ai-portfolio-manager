"""
Trend Scanner
=============
Sources (in reliability order):
  1. Yahoo Finance Trending Tickers  — same backend as yfinance, reliable from servers
  2. Yahoo Finance Most Active        — high-volume tickers today
  3. Yahoo Finance Gainers            — momentum picks
  4. StockTwits trending              — social sentiment (best-effort)
  5. Reddit public JSON               — best-effort; server IPs often rate-limited
  6. Universe Momentum Fallback       — always runs; ranks ETF_UNIVERSE by 1-month momentum
     so there are always results even when all external sources fail

Risk filtering:
  capital_preservation → ann_vol ≤ 18%, spec_score ≤ 30
  income               → ann_vol ≤ 22%, spec_score ≤ 40
  balanced             → ann_vol ≤ 35%, spec_score ≤ 65
  growth               → no gates
"""

import re
import time
import json
import urllib.request
import numpy as np
import yfinance as yf
from datetime import datetime
from collections import defaultdict
from market_data import ETF_UNIVERSE

try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False


# ── Constants ─────────────────────────────────────────────────────────────────

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PortfolioScanner/2.0)"}

TICKER_BLACKLIST = {
    "I", "A", "IT", "BE", "AT", "AM", "PM", "GO", "US", "THE", "FOR",
    "OR", "AND", "TO", "ON", "IN", "IF", "OF", "IS", "SO", "MY",
    "ALL", "CAN", "ARE", "HAS", "CEO", "EPS", "IPO", "SEC", "ETF",
    "GDP", "IMO", "DD", "OG", "OP", "AI", "TV", "OK", "RE",
    "ATH", "FUD", "WSB", "DCA", "YOY", "QOQ", "FCF", "ROI",
}

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


# ── Yahoo Finance sources ──────────────────────────────────────────────────────

def _yf_screener(scr_id: str, count: int = 25) -> list[dict]:
    """Call Yahoo Finance screener API. Returns list of {ticker, name, source_label}."""
    url = (
        f"https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved"
        f"?scrIds={scr_id}&count={count}&formatted=false"
    )
    try:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        rows = (data.get("finance", {})
                    .get("result", [{}])[0]
                    .get("quotes", []))
        return [
            {"ticker": q["symbol"], "name": q.get("longName", q["symbol"])}
            for q in rows if "symbol" in q
        ]
    except Exception:
        return []


def _yf_trending(count: int = 20) -> list[dict]:
    """Yahoo Finance trending tickers for the US."""
    url = f"https://query1.finance.yahoo.com/v1/finance/trending/US?count={count}"
    try:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        quotes = data.get("finance", {}).get("result", [{}])[0].get("quotes", [])
        return [{"ticker": q["symbol"], "name": q.get("longName", q["symbol"])} for q in quotes]
    except Exception:
        return []


def scan_yahoo() -> dict[str, dict]:
    """
    Merge trending + most_actives + day_gainers from Yahoo Finance.
    Returns {ticker: {score, sources, name}}
    """
    results: dict[str, dict] = {}

    sources = [
        ("Yahoo Finance Trending",    _yf_trending(20),              30),
        ("Yahoo Finance Most Active", _yf_screener("most_actives"),  20),
        ("Yahoo Finance Top Gainers", _yf_screener("day_gainers"),   25),
    ]

    for label, tickers, base_score in sources:
        for rank, item in enumerate(tickers):
            t = item["ticker"]
            if t in TICKER_BLACKLIST:
                continue
            recency_bonus = max(0, 10 - rank)  # higher rank → more points
            results.setdefault(t, {"score": 0.0, "sources": [], "name": item.get("name", t)})
            results[t]["score"] += base_score + recency_bonus
            if label not in results[t]["sources"]:
                results[t]["sources"].append(label)

    return results


# ── StockTwits ─────────────────────────────────────────────────────────────────

def scan_stocktwits() -> dict[str, dict]:
    url = "https://api.stocktwits.com/api/2/trending/symbols.json"
    try:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        return {
            s["symbol"]: {"watchlist_count": s.get("watchlist_count", 0), "title": s.get("title", "")}
            for s in data.get("symbols", [])
        }
    except Exception:
        return {}


# ── Reddit (best-effort) ───────────────────────────────────────────────────────

REDDIT_SUBREDDITS = ["investing", "stocks", "wallstreetbets", "smallcapstocks", "stockmarket"]

def _extract_tickers(text: str) -> list[str]:
    dollar = re.findall(r'\$([A-Z]{1,5})\b', text)
    caps   = re.findall(r'\b([A-Z]{2,5})\b', text)
    return list(set(dollar + caps) - TICKER_BLACKLIST)

def scan_reddit() -> dict[str, dict]:
    ticker_data: dict[str, dict] = defaultdict(lambda: {
        "mentions": 0, "score": 0.0, "subreddits": set(), "sample_titles": [],
    })
    now = time.time()
    for sub in REDDIT_SUBREDDITS:
        url = f"https://www.reddit.com/r/{sub}/hot.json?limit=40"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (PortfolioScanner)"})
            with urllib.request.urlopen(req, timeout=6) as r:
                data = json.loads(r.read())
            posts = data.get("data", {}).get("children", [])
            for post in posts:
                d = post.get("data", {})
                title    = d.get("title", "")
                selftext = d.get("selftext", "")
                ups      = max(1, d.get("ups", 1))
                age_h    = (now - d.get("created_utc", now)) / 3600
                recency  = 2.0 if age_h < 24 else (1.5 if age_h < 48 else 1.0)
                for t in _extract_tickers(title + " " + selftext[:400]):
                    ticker_data[t]["mentions"] += 1
                    ticker_data[t]["score"]    += ups * recency
                    ticker_data[t]["subreddits"].add(sub)
                    if len(ticker_data[t]["sample_titles"]) < 2:
                        ticker_data[t]["sample_titles"].append(title[:80])
            time.sleep(0.4)
        except Exception:
            continue  # skip subreddit if blocked — don't fail the whole scan

    for t in ticker_data:
        ticker_data[t]["subreddits"] = list(ticker_data[t]["subreddits"])
    return dict(ticker_data)


# ── Universe momentum fallback ─────────────────────────────────────────────────

def scan_universe_momentum(top_n: int = 20) -> dict[str, dict]:
    """
    Rank tickers in ETF_UNIVERSE by 1-month price momentum.
    This is the guaranteed fallback — always returns results.
    Uses batch download for speed.
    """
    tickers = list(ETF_UNIVERSE.keys())
    try:
        prices = yf.download(
            tickers, period="2mo", interval="1wk",
            auto_adjust=True, progress=False, threads=True,
        )["Close"]
    except Exception:
        return {}

    results: dict[str, dict] = {}
    for t in tickers:
        try:
            col = prices[t].dropna() if t in prices.columns else prices.dropna()
            if len(col) < 4:
                continue
            mom = float(col.iloc[-1] / col.iloc[-4] - 1) * 100  # ~1 month
            if mom > 2:  # only include positive momentum
                results[t] = {
                    "score":   min(40, mom * 1.5),  # cap at 40 so real trends rank higher
                    "sources": ["Universe Momentum (1-month price trend)"],
                    "name":    ETF_UNIVERSE[t].get("name", t),
                    "momentum": round(mom, 1),
                }
        except Exception:
            continue
    return results


# ── Market data enrichment ─────────────────────────────────────────────────────

def _enrich_ticker(ticker: str) -> dict | None:
    try:
        hist = yf.Ticker(ticker).history(period="3mo", interval="1d", auto_adjust=True)
        if hist.empty or len(hist) < 20:
            return None
        prices  = hist["Close"].dropna().values
        returns = np.diff(prices) / prices[:-1]
        ann_vol  = float(np.std(returns)) * np.sqrt(252) * 100
        mom_1m   = float(prices[-1] / prices[-21] - 1) * 100 if len(prices) >= 21 else 0.0
        mom_3m   = float(prices[-1] / prices[0]  - 1) * 100
        curr_px  = float(prices[-1])
        try:
            fi = yf.Ticker(ticker).fast_info
            market_cap = getattr(fi, "market_cap", None)
        except Exception:
            market_cap = None
        vol_score  = min(100, ann_vol * 1.5)
        cap_score  = 0  if (market_cap and market_cap > 10e9) else \
                    (20  if (market_cap and market_cap >  2e9) else \
                    (50  if (market_cap and market_cap > 300e6) else 80))
        # ETFs in our universe get a lower spec_score baseline
        if ticker in ETF_UNIVERSE:
            cap_score = min(cap_score, 20)
        spec_score = int(min(100, vol_score * 0.6 + cap_score * 0.4))
        return {
            "ticker": ticker, "current_price": round(curr_px, 2),
            "ann_vol": round(ann_vol, 1), "mom_1m": round(mom_1m, 1),
            "mom_3m": round(mom_3m, 1), "spec_score": spec_score,
            "market_cap": market_cap,
        }
    except Exception:
        return None


# ── Risk helpers ───────────────────────────────────────────────────────────────

def _risk_label(spec_score: int) -> str:
    if spec_score >= 70: return "high"
    if spec_score >= 40: return "moderate"
    return "low"

def _fits_profile(e: dict, goal: str, risk_tolerance: float) -> bool:
    return (e["ann_vol"] <= RISK_VOL_GATES.get(goal, 999) and
            e["spec_score"] <= RISK_SPEC_GATES.get(goal, 100))


# ── ETF fallback for uninvestable tickers ──────────────────────────────────────

_SECTOR_TO_ETF: dict[str, list[str]] = {
    "Technology":             ["XLK", "QQQ", "AIQ", "CLOU"],
    "Semiconductors":         ["SOXX", "XLK"],
    "Biotechnology":          ["IBB", "XBI"],
    "Healthcare":             ["XLV"],
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

def _etf_proxy(trending_ticker: str, meta: dict, goal: str, risk_tolerance: float,
               used: set) -> dict | None:
    try:
        sector = yf.Ticker(trending_ticker).info.get("sector", "")
    except Exception:
        sector = ""
    proxy_ticker = None
    for key, etfs in _SECTOR_TO_ETF.items():
        if key.lower() in sector.lower() or sector.lower() in key.lower():
            for e in etfs:
                if e in ETF_UNIVERSE and e not in used:
                    proxy_ticker = e
                    break
            if proxy_ticker:
                break
    if not proxy_ticker:
        fallback = "SPY" if goal in ("capital_preservation", "income") else None
        if not fallback or fallback in used:
            return None
        proxy_ticker = fallback
    enriched = _enrich_ticker(proxy_ticker)
    if not enriched:
        return None
    used.add(proxy_ticker)
    etf_info = ETF_UNIVERSE.get(proxy_ticker, {})
    fits     = _fits_profile(enriched, goal, risk_tolerance)
    return {
        "ticker": proxy_ticker, "name": etf_info.get("name", proxy_ticker),
        "current_price": enriched["current_price"], "ann_vol": enriched["ann_vol"],
        "mom_1m": enriched["mom_1m"], "mom_3m": enriched["mom_3m"],
        "spec_score": enriched["spec_score"], "risk_level": _risk_label(enriched["spec_score"]),
        "fits_profile": fits, "trend_score": round(meta["score"] * 0.8, 1),
        "sources": meta["sources"], "sample_titles": meta.get("sample_titles", []),
        "etf_proxy": True, "etf_proxy_for": trending_ticker,
        "etf_proxy_note": (f"ETF proxy — {proxy_ticker} ({etf_info.get('name', proxy_ticker)}) "
                           f"covers {sector or 'this theme'} "
                           f"(original {trending_ticker} outside investable universe)"),
    }


# ── Master scan ────────────────────────────────────────────────────────────────

def run_trend_scan(goal: str = "balanced", risk_tolerance: float = 15) -> dict:
    # 1. Gather signals from all sources
    yahoo_data      = scan_yahoo()           # primary — reliable
    stocktwits_data = scan_stocktwits()      # bonus
    reddit_data     = scan_reddit()          # best-effort

    # 2. Merge into unified candidates
    all_candidates: dict[str, dict] = {}

    for ticker, yd in yahoo_data.items():
        all_candidates.setdefault(ticker, {"score": 0.0, "sources": [], "name": yd.get("name", ticker)})
        all_candidates[ticker]["score"] += yd["score"]
        for s in yd["sources"]:
            if s not in all_candidates[ticker]["sources"]:
                all_candidates[ticker]["sources"].append(s)

    for ticker, sd in stocktwits_data.items():
        all_candidates.setdefault(ticker, {"score": 0.0, "sources": []})
        all_candidates[ticker]["score"] += 20
        lbl = f"StockTwits trending ({sd.get('watchlist_count', '?')} watchers)"
        if lbl not in all_candidates[ticker]["sources"]:
            all_candidates[ticker]["sources"].append(lbl)
        if not all_candidates[ticker].get("name"):
            all_candidates[ticker]["name"] = sd.get("title", ticker)

    for ticker, rd in reddit_data.items():
        if rd["mentions"] < 2:
            continue
        all_candidates.setdefault(ticker, {"score": 0.0, "sources": []})
        all_candidates[ticker]["score"] += min(40, rd["score"] / 500)
        lbl = f"Reddit ({rd['mentions']} mentions)"
        if lbl not in all_candidates[ticker]["sources"]:
            all_candidates[ticker]["sources"].append(lbl)
        all_candidates[ticker].setdefault("sample_titles", rd.get("sample_titles", []))

    # 3. Universe momentum fallback — merge in, lower weight so real trends rank first
    universe_mom = scan_universe_momentum(top_n=20)
    for ticker, um in universe_mom.items():
        # Only add if not already discovered by external sources
        if ticker not in all_candidates:
            all_candidates[ticker] = {
                "score": um["score"], "sources": um["sources"], "name": um["name"],
            }
        else:
            # Boost if already seen
            all_candidates[ticker]["score"] += um["score"] * 0.5
            if um["sources"][0] not in all_candidates[ticker]["sources"]:
                all_candidates[ticker]["sources"].append(um["sources"][0])

    if not all_candidates:
        return {"opportunities": [], "scanned": 0,
                "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}

    # 4. Enrich top 50 candidates
    top_candidates = sorted(all_candidates.items(), key=lambda x: x[1]["score"], reverse=True)[:50]

    results    = []
    proxy_used: set[str] = set()

    for ticker, meta in top_candidates:
        enriched = _enrich_ticker(ticker)
        if enriched:
            fits     = _fits_profile(enriched, goal, risk_tolerance)
            risk_lbl = _risk_label(enriched["spec_score"])
            mom_bonus   = max(0, enriched["mom_1m"]) * 0.3
            fit_bonus   = 10 if fits else 0
            final_score = min(100, meta["score"] + mom_bonus + fit_bonus)
            results.append({
                "ticker":        ticker,
                "name":          meta.get("name", ETF_UNIVERSE.get(ticker, {}).get("name", ticker)),
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
            # Ticker has no investable data — try ETF proxy
            proxy = _etf_proxy(ticker, meta, goal, risk_tolerance, proxy_used)
            if proxy:
                results.append(proxy)

    # 5. Sort: profile fits first, then by trend_score
    results.sort(key=lambda x: (not x["fits_profile"], -x["trend_score"]))

    return {
        "opportunities":   results[:25],
        "scanned":         len(all_candidates),
        "profile_matches": sum(1 for r in results if r["fits_profile"]),
        "goal":            goal,
        "risk_tolerance":  risk_tolerance,
        "as_of":           datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
