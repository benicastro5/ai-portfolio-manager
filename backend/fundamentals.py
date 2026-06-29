"""
Fundamental data layer for ETFs.

Pulls per-ETF fundamentals from yfinance (P/E, P/B, dividend yield, earnings growth)
and macro data (yield curve, credit spreads via price proxies).

All values are cached for the lifetime of the request — this module is stateless.
"""

import yfinance as yf
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Asset class of each ticker — drives which fundamental signals apply
ASSET_CLASS = {
    "SPY": "equity", "QQQ": "equity", "IWM": "equity",
    "XLK": "equity", "XLF": "equity", "XLE": "equity", "XLV": "equity",
    "XLY": "equity", "XLP": "equity", "XLI": "equity", "XLU": "equity",
    "XLB": "equity", "XLC": "equity", "SOXX": "equity", "IBB": "equity",
    "EFA": "equity", "EEM": "equity", "VNQ": "equity",
    "BND": "bond", "TLT": "bond", "HYG": "bond", "LQD": "bond",
    "SHY": "bond", "TIP": "bond",
    "GLD": "commodity", "SLV": "commodity", "USO": "commodity", "DBC": "commodity",
}

# Macro tickers we fetch alongside ETF data
MACRO_TICKERS = {
    "^TNX": "yield_10y",    # 10-year treasury yield
    "^IRX": "yield_3m",     # 3-month treasury yield
    "^TYX": "yield_30y",    # 30-year treasury yield
}


def fetch_fundamentals(tickers: list[str]) -> dict:
    """
    Returns a dict keyed by ticker with fundamental metrics.
    Gracefully returns empty dict per ticker on failure.
    """
    result = {}

    # ── Per-ETF fundamentals from yfinance info ──────────────────────────────
    for ticker in tickers:
        result[ticker] = _fetch_etf_fundamentals(ticker)

    # ── Macro: yield curve ────────────────────────────────────────────────────
    macro = _fetch_macro()
    for ticker in tickers:
        result[ticker]["macro"] = macro

    return result


def _fetch_etf_fundamentals(ticker: str) -> dict:
    """Fetch per-ETF fundamental data from yfinance .info dict."""
    ac = ASSET_CLASS.get(ticker, "equity")
    out = {
        "pe_ratio": None,
        "pb_ratio": None,
        "dividend_yield": None,
        "earnings_growth": None,
        "asset_class_type": ac,
    }
    try:
        info = yf.Ticker(ticker).info
        if not info:
            return out

        # P/E — trailingPE or forwardPE
        pe = info.get("trailingPE") or info.get("forwardPE")
        if pe and 0 < pe < 200:
            out["pe_ratio"] = float(pe)

        # P/B
        pb = info.get("priceToBook")
        if pb and 0 < pb < 50:
            out["pb_ratio"] = float(pb)

        # Dividend yield (yfinance returns as decimal, e.g. 0.015 = 1.5%)
        dy = info.get("dividendYield") or info.get("yield") or info.get("trailingAnnualDividendYield")
        if dy and 0 < dy < 0.30:
            out["dividend_yield"] = float(dy)

        # Earnings growth (yfinance: earningsGrowth or earningsQuarterlyGrowth)
        eg = info.get("earningsGrowth") or info.get("earningsQuarterlyGrowth")
        if eg and -1.0 < eg < 5.0:
            out["earnings_growth"] = float(eg)

    except Exception as e:
        logger.debug(f"Fundamentals fetch failed for {ticker}: {e}")

    return out


def _fetch_macro() -> dict:
    """Fetch yield curve and derive spread signals."""
    macro = {
        "yield_10y": None,
        "yield_3m": None,
        "yield_30y": None,
        "yield_curve_slope": None,   # 10y - 3m (negative = inverted = bearish)
        "yield_curve_signal": "neutral",
    }
    try:
        for sym, key in MACRO_TICKERS.items():
            try:
                t = yf.Ticker(sym)
                hist = t.history(period="5d")
                if not hist.empty:
                    macro[key] = float(hist["Close"].iloc[-1]) / 100  # convert % to decimal
            except Exception:
                pass

        y10 = macro.get("yield_10y")
        y3m = macro.get("yield_3m")
        if y10 is not None and y3m is not None:
            slope = y10 - y3m
            macro["yield_curve_slope"] = round(slope * 100, 2)  # in bps
            if slope > 0.01:
                macro["yield_curve_signal"] = "normal"   # upward slope → growth
            elif slope > -0.005:
                macro["yield_curve_signal"] = "flat"     # flat → caution
            else:
                macro["yield_curve_signal"] = "inverted" # inverted → recession risk
    except Exception as e:
        logger.warning(f"Macro fetch failed: {e}")

    return macro


def score_fundamentals(ticker: str, fund: dict) -> dict:
    """
    Converts raw fundamental data into 0-100 scores.
    Returns scores dict + a composite fundamental_score (0-100).
    """
    ac = fund.get("asset_class_type", "equity")
    macro = fund.get("macro", {})
    scores = {}

    if ac == "equity":
        # ── Valuation: P/E ────────────────────────────────────────────────────
        pe = fund.get("pe_ratio")
        if pe is not None:
            # Lower P/E = better value; scale 8 (cheap) to 40 (expensive)
            scores["pe_score"] = float(np.clip((40 - pe) / (40 - 8) * 100, 0, 100))
        else:
            scores["pe_score"] = 50.0  # neutral when unavailable

        # ── Valuation: P/B ────────────────────────────────────────────────────
        pb = fund.get("pb_ratio")
        if pb is not None:
            # Lower P/B = better value; scale 1 (cheap) to 8 (expensive)
            scores["pb_score"] = float(np.clip((8 - pb) / (8 - 1) * 100, 0, 100))
        else:
            scores["pb_score"] = 50.0

        # ── Dividend yield ────────────────────────────────────────────────────
        dy = fund.get("dividend_yield")
        if dy is not None:
            # Higher yield = better income; scale 0% to 5%
            scores["dividend_score"] = float(np.clip(dy / 0.05 * 100, 0, 100))
        else:
            scores["dividend_score"] = 40.0  # slight penalty for no yield data

        # ── Earnings growth ───────────────────────────────────────────────────
        eg = fund.get("earnings_growth")
        if eg is not None:
            # Scale -20% to +40% growth
            scores["earnings_score"] = float(np.clip((eg + 0.20) / 0.60 * 100, 0, 100))
        else:
            scores["earnings_score"] = 50.0

        # ── Macro: yield curve effect on equities ─────────────────────────────
        yc = macro.get("yield_curve_signal", "neutral")
        scores["macro_score"] = 65.0 if yc == "normal" else 50.0 if yc == "flat" else 30.0

        # Composite for equity
        composite = (
            scores["pe_score"] * 0.25 +
            scores["pb_score"] * 0.15 +
            scores["dividend_score"] * 0.15 +
            scores["earnings_score"] * 0.25 +
            scores["macro_score"] * 0.20
        )

    elif ac == "bond":
        # ── Dividend yield = coupon proxy ─────────────────────────────────────
        dy = fund.get("dividend_yield")
        if dy is not None:
            scores["yield_score"] = float(np.clip(dy / 0.08 * 100, 0, 100))
        else:
            scores["yield_score"] = 50.0

        # ── Yield curve for bonds ─────────────────────────────────────────────
        yc = macro.get("yield_curve_signal", "neutral")
        # Inverted curve = good for long bonds (prices up), bad for HY
        if ticker in ("TLT", "BND", "LQD"):
            scores["macro_score"] = 70.0 if yc == "inverted" else 50.0 if yc == "flat" else 40.0
        elif ticker in ("HYG",):
            scores["macro_score"] = 65.0 if yc == "normal" else 45.0 if yc == "flat" else 25.0
        else:  # SHY, TIP
            scores["macro_score"] = 55.0

        composite = scores["yield_score"] * 0.50 + scores["macro_score"] * 0.50

    elif ac == "commodity":
        # ── Macro: inflation / yield curve ───────────────────────────────────
        yc = macro.get("yield_curve_signal", "neutral")
        # Commodities and gold do well when yield curve is flat/inverted (inflation hedge)
        if ticker in ("GLD", "SLV", "TIP"):
            scores["macro_score"] = 70.0 if yc in ("flat", "inverted") else 50.0
        else:
            scores["macro_score"] = 55.0 if yc == "normal" else 45.0

        # Dividend/yield (most commodities have none)
        dy = fund.get("dividend_yield")
        scores["yield_score"] = float(np.clip((dy or 0) / 0.03 * 100, 0, 100))

        composite = scores["macro_score"] * 0.70 + scores["yield_score"] * 0.30

    else:
        composite = 50.0

    return {
        **scores,
        "fundamental_score": round(float(np.clip(composite, 0, 100)), 1),
        "pe_ratio": fund.get("pe_ratio"),
        "pb_ratio": fund.get("pb_ratio"),
        "dividend_yield": round(fund.get("dividend_yield") * 100, 2) if fund.get("dividend_yield") else None,
        "earnings_growth": round(fund.get("earnings_growth") * 100, 1) if fund.get("earnings_growth") else None,
        "yield_curve_signal": macro.get("yield_curve_signal", "neutral"),
        "yield_curve_slope_bps": macro.get("yield_curve_slope"),
    }
