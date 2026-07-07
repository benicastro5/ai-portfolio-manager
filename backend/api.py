from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import logging
import os

import time
from market_data import (
    fetch_market_data, get_covariance_matrix, get_correlation_matrix,
    filter_by_exclusions, ETF_UNIVERSE, GOAL_UNIVERSE,
    load_cache_from_disk, refresh_all_cache,
)
from scoring_engine import rank_etfs
from optimizer import optimize_portfolio, optimize_target_vol_portfolio, compute_efficient_frontier
from rebalancing import compute_rebalancing, compute_dollar_allocations
from explanation_engine import generate_portfolio_explanation
from forecast_engine import ensemble_forecast
from fundamentals import fetch_fundamentals, score_fundamentals
from geography import filter_by_geography, build_geo_constraints, compute_geo_exposure
from stress_test import run_stress_tests
from health_score import compute_health_score
from alpaca import get_account, get_positions, place_orders as alpaca_place_orders
from macro_regime import compute_macro_regime
from backtest import run_backtest
from trend_scanner import run_trend_scan
import threading

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Institutional Portfolio Manager", version="1.0.0")

ADMIN_REFRESH_KEY = os.environ.get("ADMIN_REFRESH_KEY", "")

@app.on_event("startup")
async def startup_prewarm():
    """Load any disk-cached data, then top up in background — does not block startup."""
    from market_data import prewarm_cache
    load_cache_from_disk()
    t = threading.Thread(target=prewarm_cache, daemon=True)
    t.start()
    logger.info("Cache pre-warm started in background thread.")


@app.post("/admin/refresh-cache")
def admin_refresh_cache(x_admin_key: str = Header(default="")):
    """Force a full re-download of all tickers and persist to disk.
    Call this once per morning via an external scheduler (cron-job.org, GitHub Actions, etc.)
    so every user request during the day hits a warm cache instead of downloading live."""
    if not ADMIN_REFRESH_KEY or x_admin_key != ADMIN_REFRESH_KEY:
        raise HTTPException(403, "Invalid or missing admin key")
    t = threading.Thread(target=refresh_all_cache, daemon=True)
    t.start()
    return {"status": "refresh started"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str):
    return {}

ALL_TICKERS = list(ETF_UNIVERSE.keys())


class UserProfile(BaseModel):
    investment_amount: float = Field(..., gt=0)
    risk_tolerance: float = Field(..., gt=0, le=100, description="Target annual vol %")
    horizon: float = Field(..., gt=0, le=50, description="Investment horizon in years (e.g. 0.5 = 6 months)")
    goal: str = Field(..., pattern="^(growth|balanced|income|capital_preservation)$")
    max_drawdown: float = Field(..., le=0, description="Max drawdown tolerance % (negative)")
    base_currency: str = "USD"
    monthly_contribution: float = 0.0
    excluded_sectors: list[str] = []
    excluded_assets: list[str] = []
    existing_holdings: list[dict] = []
    # Geographic preferences
    geo_regions: list[str] = []         # e.g. ["us", "india", "brazil"]
    geo_excluded: list[str] = []        # e.g. ["china"]
    geo_min: dict[str, float] = {}      # e.g. {"india": 0.10}
    geo_max: dict[str, float] = {}      # e.g. {"india": 0.25}


class RebalanceRequest(BaseModel):
    target_allocations: list[dict]
    current_holdings: list[dict]
    portfolio_value: float
    drift_threshold: float = 5.0


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/etfs")
def get_etfs():
    return {"etfs": [{"ticker": k, **v} for k, v in ETF_UNIVERSE.items()]}


@app.post("/portfolio/generate")
def generate_portfolio(profile: UserProfile):
    try:
        t0 = time.time()

        # Goal-based pre-filter: only download tickers relevant to this goal
        goal_tickers = GOAL_UNIVERSE.get(profile.goal, ALL_TICKERS)
        # Still allow user's geographic ETFs (they may be outside the goal universe)
        candidate_pool = list(dict.fromkeys(goal_tickers + ALL_TICKERS[:45]))  # goal + all core ETFs

        # Filter universe: sector/asset exclusions first, then geography
        eligible = filter_by_exclusions(
            candidate_pool,
            excluded_sectors=profile.excluded_sectors,
            excluded_assets=profile.excluded_assets,
        )
        if profile.geo_regions or profile.geo_excluded:
            eligible = filter_by_geography(
                eligible,
                selected_regions=profile.geo_regions,
                excluded_countries=profile.geo_excluded,
            )

        if len(eligible) < 4:
            raise HTTPException(400, "Too few eligible assets after exclusions. Please relax geographic or sector constraints.")

        # Fetch live market data
        logger.info(f"[TIMING] Fetching {len(eligible)} tickers (goal={profile.goal})")
        t1 = time.time()
        market_data = fetch_market_data(eligible, period_years=3)
        logger.info(f"[TIMING] market_data fetch: {time.time()-t1:.1f}s")
        live_count = sum(1 for d in market_data.values() if d.get("dates"))
        data_source = "live" if live_count == len(eligible) else f"live ({live_count}/{len(eligible)}), mock fallback for rest"
        data_as_of = __import__("datetime").datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

        # Matrices
        t2 = time.time()
        cov_matrix = get_covariance_matrix(market_data)
        corr_matrix = get_correlation_matrix(market_data)
        logger.info(f"[TIMING] covariance matrices: {time.time()-t2:.1f}s")

        # Ensemble forecast (GARCH + EWMA + Momentum + Mean-Reversion + J-S shrinkage)
        t3 = time.time()
        logger.info("Running ensemble forecast models")
        forecasts = ensemble_forecast(market_data)
        logger.info(f"[TIMING] ensemble forecast: {time.time()-t3:.1f}s")

        # Score and rank WITHOUT fundamentals first (fast)
        ranked = rank_etfs(market_data, corr_matrix, forecasts=forecasts, fundamentals={})

        # Macro regime — fetch live VIX, yield curve, credit spread
        t_macro = time.time()
        try:
            macro = compute_macro_regime()
        except Exception as e:
            logger.warning(f"Macro regime fetch failed: {e}")
            macro = {"regime": "neutral", "regime_score": 0, "confidence": "low",
                     "equity_cap_adj": 0.0, "bond_floor_adj": 0.0, "signals": {}, "summary": ""}
        logger.info(f"[TIMING] macro regime ({macro['regime']}): {time.time()-t_macro:.1f}s")

        # Optimize using forecast returns + Ledoit-Wolf covariance
        t4 = time.time()
        geo_constraints = build_geo_constraints(
            list(market_data.keys()),
            geo_min={k: v / 100 for k, v in profile.geo_min.items()},
            geo_max={k: v / 100 for k, v in profile.geo_max.items()},
        )

        # Apply macro overlay: cap equities tighter in bear regime
        macro_max_weight = max(0.15, min(0.35, 0.25 + macro.get("equity_cap_adj", 0.0)))

        result = optimize_portfolio(
            market_data=market_data,
            cov_matrix=cov_matrix,
            user_risk_pct=profile.risk_tolerance / 100,
            goal=profile.goal,
            max_weight=macro_max_weight,
            min_assets=4,
            method="mpt",
            forecasts=forecasts,
            max_drawdown_pct=profile.max_drawdown,
            extra_constraints=geo_constraints,
        )
        logger.info(f"[TIMING] optimization: {time.time()-t4:.1f}s")

        # Fetch fundamentals ONLY for the final portfolio holdings (~10 tickers)
        t5 = time.time()
        final_tickers = [a["ticker"] for a in result["allocations"]]
        logger.info(f"Fetching fundamentals for {len(final_tickers)} final holdings")
        raw_fundamentals = fetch_fundamentals(final_tickers)
        fundamentals = {t: score_fundamentals(t, raw_fundamentals[t]) for t in raw_fundamentals}
        logger.info(f"[TIMING] fundamentals: {time.time()-t5:.1f}s")
        # Re-rank with fundamentals for the ETF ranking tab
        ranked = rank_etfs(market_data, corr_matrix, forecasts=forecasts, fundamentals=fundamentals)

        # Dollar allocations — optimal portfolio
        dollar_allocs = compute_dollar_allocations(
            result["allocations"],
            profile.investment_amount,
            profile.monthly_contribution,
        )

        # Target-vol portfolio: max return at exactly the user's stated vol
        target_result = optimize_target_vol_portfolio(
            market_data=market_data,
            cov_matrix=cov_matrix,
            target_vol=profile.risk_tolerance / 100,
            max_weight=0.25,
            min_assets=4,
            forecasts=forecasts,
        )
        target_dollar_allocs = compute_dollar_allocations(
            target_result["allocations"],
            profile.investment_amount,
            profile.monthly_contribution,
        )

        # Efficient frontier (using forecast returns)
        frontier = compute_efficient_frontier(market_data, cov_matrix, n_points=25, forecasts=forecasts)

        # Use macro regime as dominant (top-down), fall back to bottom-up portfolio vote
        dominant_regime = macro.get("regime", "neutral")
        if macro.get("confidence") == "low":
            regime_counts = {}
            for ticker in [a["ticker"] for a in result["allocations"]]:
                r = forecasts.get(ticker, {}).get("regime", {}).get("regime", "neutral")
                regime_counts[r] = regime_counts.get(r, 0) + 1
            dominant_regime = max(regime_counts, key=regime_counts.get) if regime_counts else "neutral"

        # Correlation matrix for response
        included_tickers = [a["ticker"] for a in result["allocations"]]
        corr_subset = corr_matrix.loc[included_tickers, included_tickers]
        corr_data = {
            "tickers": included_tickers,
            "matrix": corr_subset.round(3).values.tolist(),
        }

        # Explanations
        excluded_by_user = profile.excluded_assets + [
            t for t in ALL_TICKERS if t not in eligible
        ]
        explanation = generate_portfolio_explanation(
            allocations=dollar_allocs,
            portfolio_metrics=result,
            user_profile=profile.dict(),
            ranked_etfs=ranked,
            excluded_tickers=excluded_by_user,
        )

        geo_exposure = compute_geo_exposure(dollar_allocs)

        # Stress testing
        stress_results = run_stress_tests(dollar_allocs, profile.investment_amount)

        # Portfolio health score
        health = compute_health_score(
            portfolio={**result, "allocations": dollar_allocs},
            user_profile=profile.dict(),
            geo_exposure=geo_exposure,
        )

        # Benchmark comparison: SPY (100% equity) and 60/40 (SPY + BND)
        spy_data = market_data.get("SPY") or market_data.get(list(market_data.keys())[0])
        bnd_data = market_data.get("BND")
        spy_ret = forecasts.get("SPY", {}).get("forecasted_annual_return", 0) or 0
        spy_vol = spy_data.get("volatility", 0.18) if spy_data else 0.18
        bnd_ret = forecasts.get("BND", {}).get("forecasted_annual_return", 0) or 0.04
        bnd_vol = bnd_data.get("volatility", 0.07) if bnd_data else 0.07
        benchmarks = {
            "spy": {
                "label": "SPY (S&P 500)", "return": round(spy_ret, 2),
                "volatility": round(spy_vol * 100, 1),
                "sharpe": round((spy_ret - 0.045) / spy_vol, 2) if spy_vol else 0,
            },
            "sixty_forty": {
                "label": "60/40 (SPY+BND)",
                "return": round(spy_ret * 0.6 + bnd_ret * 0.4, 2),
                "volatility": round((spy_vol * 0.6 + bnd_vol * 0.4) * 100, 1),
                "sharpe": round(((spy_ret * 0.6 + bnd_ret * 0.4) - 0.045) / (spy_vol * 0.6 + bnd_vol * 0.4), 2) if spy_vol else 0,
            },
        }

        logger.info(f"[TIMING] total generate_portfolio: {time.time()-t0:.1f}s")

        return {
            "portfolio": {
                **result,
                "allocations": dollar_allocs,
            },
            "target_vol_portfolio": {
                **target_result,
                "allocations": target_dollar_allocs,
            },
            "geo_exposure": geo_exposure,
            "stress_tests": stress_results,
            "health_score": health,
            "benchmarks": benchmarks,
            "data_source": data_source,
            "data_as_of": data_as_of,
            "dominant_regime": dominant_regime,
            "macro_regime": macro,
            "ranked_etfs": ranked,
            "efficient_frontier": frontier,
            "correlation_matrix": corr_data,
            "explanation": explanation,
            "user_profile": profile.dict(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Portfolio generation failed")
        raise HTTPException(500, f"Portfolio generation failed: {str(e)}")


@app.post("/portfolio/rebalance")
def rebalance(req: RebalanceRequest):
    try:
        result = compute_rebalancing(
            target_allocations=req.target_allocations,
            current_holdings=req.current_holdings,
            portfolio_value=req.portfolio_value,
            drift_threshold=req.drift_threshold / 100,
        )
        return result
    except Exception as e:
        raise HTTPException(500, f"Rebalancing failed: {str(e)}")


@app.get("/portfolio/news")
def get_portfolio_news(tickers: str):
    """Fetch recent news for comma-separated list of tickers via yfinance."""
    import yfinance as yf
    import time
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()][:6]
    articles = []
    seen_titles = set()
    for ticker in ticker_list:
        try:
            news = yf.Ticker(ticker).news or []
            for item in news[:3]:
                title = item.get("title", "")
                if title in seen_titles:
                    continue
                seen_titles.add(title)
                content = item.get("content") or {}
                thumbnail = None
                thumb_data = content.get("thumbnail") or item.get("thumbnail") or {}
                resolutions = thumb_data.get("resolutions", []) if isinstance(thumb_data, dict) else []
                if resolutions:
                    thumbnail = resolutions[0].get("url")
                articles.append({
                    "ticker": ticker,
                    "title": title,
                    "publisher": item.get("publisher") or (content.get("provider") or {}).get("displayName", ""),
                    "link": item.get("link") or content.get("canonicalUrl", {}).get("url", ""),
                    "published": item.get("providerPublishTime") or content.get("pubDate", ""),
                    "thumbnail": thumbnail,
                })
        except Exception:
            pass
    articles.sort(key=lambda x: x.get("published", 0), reverse=True)
    return {"articles": articles[:12]}


@app.get("/market/scan")
def market_scan():
    try:
        market_data = fetch_market_data(ALL_TICKERS, period_years=2)
        corr_matrix = get_correlation_matrix(market_data)
        ranked = rank_etfs(market_data, corr_matrix)
        return {"ranked_etfs": ranked, "timestamp": __import__("datetime").datetime.utcnow().isoformat()}
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Alpaca Broker Endpoints ───────────────────────────────────────────────────

class BacktestRequest(BaseModel):
    allocations: list[dict]      # [{ticker, weight_decimal}]
    initial_value: float = 10000
    period_years: int = 3
    rebalance_freq: str = "none"  # "none" | "quarterly" | "annual"
    monthly_contribution: float = 0.0

@app.post("/portfolio/backtest")
def portfolio_backtest(req: BacktestRequest):
    try:
        result = run_backtest(
            allocations=req.allocations,
            initial_value=req.initial_value,
            period_years=req.period_years,
            rebalance_freq=req.rebalance_freq,
            monthly_contribution=req.monthly_contribution,
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


class AlpacaCredentials(BaseModel):
    api_key: str
    api_secret: str
    paper: bool = True

class AlpacaExecuteRequest(BaseModel):
    api_key: str
    api_secret: str
    paper: bool = True
    trades: list[dict]  # [{ticker, action, dollar_amount}]

@app.post("/broker/alpaca/connect")
def alpaca_connect(creds: AlpacaCredentials):
    try:
        account = get_account(creds.api_key, creds.api_secret, creds.paper)
        return account
    except ValueError as e:
        raise HTTPException(401, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/broker/alpaca/positions")
def alpaca_positions(creds: AlpacaCredentials):
    try:
        positions = get_positions(creds.api_key, creds.api_secret, creds.paper)
        return {"positions": positions}
    except ValueError as e:
        raise HTTPException(401, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/broker/alpaca/execute")
def alpaca_execute(req: AlpacaExecuteRequest):
    try:
        results = alpaca_place_orders(req.trades, req.api_key, req.api_secret, req.paper)
        submitted = sum(1 for r in results if r["status"] == "submitted")
        errors    = sum(1 for r in results if r["status"] == "error")
        return {"results": results, "submitted": submitted, "errors": errors}
    except ValueError as e:
        raise HTTPException(401, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Live Prices ─────────────────────────────────────────────────────────────

class PricesRequest(BaseModel):
    tickers: list[str]

@app.post("/market/prices")
def market_prices(req: PricesRequest):
    """Return current price for each ticker, fetched fresh from yfinance."""
    import yfinance as yf
    import numpy as np
    result = {}
    try:
        raw = yf.download(req.tickers, period="2d", interval="1d",
                          auto_adjust=True, progress=False, threads=True)
        close = raw["Close"] if len(req.tickers) > 1 else raw[["Close"]].rename(columns={"Close": req.tickers[0]})
        for t in req.tickers:
            try:
                col = close[t].dropna()
                if len(col) >= 1:
                    result[t] = {"current_price": round(float(col.iloc[-1]), 4)}
            except Exception:
                pass
    except Exception as e:
        raise HTTPException(500, str(e))
    return result


# ─── Trend Scanner ────────────────────────────────────────────────────────────

class TrendScanRequest(BaseModel):
    goal: str = "balanced"
    risk_tolerance: float = 15.0

@app.post("/market/trend-scan")
def market_trend_scan(req: TrendScanRequest):
    try:
        result = run_trend_scan(goal=req.goal, risk_tolerance=req.risk_tolerance)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))
