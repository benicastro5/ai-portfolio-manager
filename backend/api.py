from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import logging

from market_data import (
    fetch_market_data, get_covariance_matrix, get_correlation_matrix,
    filter_by_exclusions, ETF_UNIVERSE,
)
from scoring_engine import rank_etfs
from optimizer import optimize_portfolio, optimize_target_vol_portfolio, compute_efficient_frontier
from rebalancing import compute_rebalancing, compute_dollar_allocations
from explanation_engine import generate_portfolio_explanation
from forecast_engine import ensemble_forecast
from fundamentals import fetch_fundamentals, score_fundamentals

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Institutional Portfolio Manager", version="1.0.0")

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
        # Filter universe
        eligible = filter_by_exclusions(
            ALL_TICKERS,
            excluded_sectors=profile.excluded_sectors,
            excluded_assets=profile.excluded_assets,
        )

        if len(eligible) < 4:
            raise HTTPException(400, "Too few eligible assets after exclusions. Please relax constraints.")

        # Fetch live market data
        logger.info(f"Fetching live data for {eligible}")
        market_data = fetch_market_data(eligible, period_years=3)
        live_count = sum(1 for d in market_data.values() if d.get("dates"))
        data_source = "live" if live_count == len(eligible) else f"live ({live_count}/{len(eligible)}), mock fallback for rest"
        data_as_of = __import__("datetime").datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

        # Matrices
        cov_matrix = get_covariance_matrix(market_data)
        corr_matrix = get_correlation_matrix(market_data)

        # Ensemble forecast (GARCH + EWMA + Momentum + Mean-Reversion + J-S shrinkage)
        logger.info("Running ensemble forecast models")
        forecasts = ensemble_forecast(market_data)

        # Fundamental data (P/E, P/B, dividend yield, earnings growth, macro)
        raw_fundamentals = fetch_fundamentals(list(market_data.keys()))
        fundamentals = {t: score_fundamentals(t, raw_fundamentals[t]) for t in raw_fundamentals}

        # Score and rank (use forecast returns for scoring)
        ranked = rank_etfs(market_data, corr_matrix, forecasts=forecasts, fundamentals=fundamentals)

        # Optimize using forecast returns + Ledoit-Wolf covariance
        result = optimize_portfolio(
            market_data=market_data,
            cov_matrix=cov_matrix,
            user_risk_pct=profile.risk_tolerance / 100,
            goal=profile.goal,
            max_weight=0.25,
            min_assets=4,
            method="mpt",
            forecasts=forecasts,
            max_drawdown_pct=profile.max_drawdown,
        )

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

        # Regime summary across portfolio
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

        return {
            "portfolio": {
                **result,
                "allocations": dollar_allocs,
            },
            "target_vol_portfolio": {
                **target_result,
                "allocations": target_dollar_allocs,
            },
            "data_source": data_source,
            "data_as_of": data_as_of,
            "dominant_regime": dominant_regime,
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


@app.get("/market/scan")
def market_scan():
    try:
        market_data = fetch_market_data(ALL_TICKERS, period_years=2)
        corr_matrix = get_correlation_matrix(market_data)
        ranked = rank_etfs(market_data, corr_matrix)
        return {"ranked_etfs": ranked, "timestamp": __import__("datetime").datetime.utcnow().isoformat()}
    except Exception as e:
        raise HTTPException(500, str(e))
