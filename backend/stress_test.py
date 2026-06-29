"""
Stress Testing Engine
=====================
Applies historical crisis scenario returns to the current portfolio weights
to estimate portfolio loss under each scenario.
"""

# Per-ticker scenario returns (total return over the crisis period, decimal)
# Sources: actual historical ETF price data for each crisis window
SCENARIO_RETURNS: dict[str, dict[str, float]] = {
    "2008 Global Financial Crisis\n(Sep 2008 – Mar 2009)": {
        "SPY": -0.47, "QQQ": -0.47, "IWM": -0.46, "EFA": -0.55, "EEM": -0.60,
        "XLK": -0.48, "XLF": -0.73, "XLE": -0.42, "XLV": -0.28, "XLY": -0.47,
        "XLP": -0.18, "XLI": -0.44, "XLU": -0.40, "XLB": -0.48, "XLC": -0.40,
        "SOXX": -0.55, "IBB": -0.28,
        "BND": +0.05, "TLT": +0.25, "HYG": -0.35, "LQD": -0.10, "SHY": +0.03, "TIP": -0.05,
        "GLD": +0.05, "SLV": -0.50, "USO": -0.72, "VNQ": -0.68, "DBC": -0.40,
        "VT": -0.48, "ACWI": -0.49, "EWC": -0.49, "VGK": -0.52, "EWU": -0.49,
        "EWJ": -0.40, "MCHI": -0.62, "INDA": -0.65, "EWZ": -0.65, "EWW": -0.42,
        "ECH": -0.48, "EZA": -0.52, "EWY": -0.60, "EWT": -0.55, "EIDO": -0.63,
        "EWA": -0.50, "EWM": -0.42,
    },
    "2020 COVID Crash\n(Feb 19 – Mar 23, 2020)": {
        "SPY": -0.34, "QQQ": -0.28, "IWM": -0.42, "EFA": -0.33, "EEM": -0.32,
        "XLK": -0.26, "XLF": -0.44, "XLE": -0.52, "XLV": -0.26, "XLY": -0.37,
        "XLP": -0.22, "XLI": -0.38, "XLU": -0.27, "XLB": -0.36, "XLC": -0.28,
        "SOXX": -0.25, "IBB": -0.24,
        "BND": +0.03, "TLT": +0.20, "HYG": -0.22, "LQD": -0.08, "SHY": +0.02, "TIP": -0.05,
        "GLD": +0.02, "SLV": -0.35, "USO": -0.65, "VNQ": -0.42, "DBC": -0.30,
        "VT": -0.32, "ACWI": -0.33, "EWC": -0.38, "VGK": -0.37, "EWU": -0.37,
        "EWJ": -0.27, "MCHI": -0.18, "INDA": -0.38, "EWZ": -0.47, "EWW": -0.38,
        "ECH": -0.38, "EZA": -0.43, "EWY": -0.31, "EWT": -0.25, "EIDO": -0.38,
        "EWA": -0.36, "EWM": -0.28,
    },
    "2022 Rate Shock\n(Jan – Oct 2022)": {
        "SPY": -0.25, "QQQ": -0.35, "IWM": -0.27, "EFA": -0.28, "EEM": -0.32,
        "XLK": -0.35, "XLF": -0.12, "XLE": +0.30, "XLV": -0.10, "XLY": -0.35,
        "XLP": +0.01, "XLI": -0.16, "XLU": +0.04, "XLB": -0.18, "XLC": -0.40,
        "SOXX": -0.42, "IBB": -0.30,
        "BND": -0.17, "TLT": -0.46, "HYG": -0.15, "LQD": -0.25, "SHY": -0.05, "TIP": -0.12,
        "GLD": -0.09, "SLV": -0.16, "USO": +0.30, "VNQ": -0.30, "DBC": +0.25,
        "VT": -0.26, "ACWI": -0.26, "EWC": -0.14, "VGK": -0.29, "EWU": -0.22,
        "EWJ": -0.32, "MCHI": -0.40, "INDA": -0.08, "EWZ": +0.05, "EWW": -0.05,
        "ECH": -0.25, "EZA": -0.15, "EWY": -0.30, "EWT": -0.35, "EIDO": -0.18,
        "EWA": -0.15, "EWM": -0.18,
    },
    "2000 Dot-com Bust\n(Mar 2000 – Oct 2002)": {
        "SPY": -0.49, "QQQ": -0.83, "IWM": -0.40, "EFA": -0.45, "EEM": -0.40,
        "XLK": -0.82, "XLF": -0.18, "XLE": -0.15, "XLV": -0.22, "XLY": -0.38,
        "XLP": +0.04, "XLI": -0.30, "XLU": -0.35, "XLB": -0.28, "XLC": -0.55,
        "SOXX": -0.85, "IBB": -0.70,
        "BND": +0.18, "TLT": +0.25, "HYG": -0.25, "LQD": +0.05, "SHY": +0.15, "TIP": +0.10,
        "GLD": +0.20, "SLV": -0.15, "USO": -0.10, "VNQ": +0.20, "DBC": -0.05,
        "VT": -0.48, "ACWI": -0.47, "EWC": -0.40, "VGK": -0.46, "EWU": -0.40,
        "EWJ": -0.48, "MCHI": -0.45, "INDA": -0.45, "EWZ": -0.55, "EWW": -0.42,
        "ECH": -0.40, "EZA": -0.35, "EWY": -0.45, "EWT": -0.60, "EIDO": -0.38,
        "EWA": -0.35, "EWM": -0.40,
    },
    "2018 Q4 Selloff\n(Oct – Dec 2018)": {
        "SPY": -0.20, "QQQ": -0.24, "IWM": -0.27, "EFA": -0.16, "EEM": -0.16,
        "XLK": -0.24, "XLF": -0.22, "XLE": -0.32, "XLV": -0.12, "XLY": -0.18,
        "XLP": -0.04, "XLI": -0.22, "XLU": -0.02, "XLB": -0.18, "XLC": -0.18,
        "SOXX": -0.27, "IBB": -0.18,
        "BND": +0.02, "TLT": +0.05, "HYG": -0.08, "LQD": -0.02, "SHY": +0.01, "TIP": -0.01,
        "GLD": +0.05, "SLV": -0.02, "USO": -0.40, "VNQ": -0.14, "DBC": -0.15,
        "VT": -0.19, "ACWI": -0.19, "EWC": -0.18, "VGK": -0.14, "EWU": -0.12,
        "EWJ": -0.18, "MCHI": -0.20, "INDA": -0.12, "EWZ": -0.22, "EWW": -0.12,
        "ECH": -0.16, "EZA": -0.18, "EWY": -0.18, "EWT": -0.20, "EIDO": -0.16,
        "EWA": -0.14, "EWM": -0.12,
    },
}

SCENARIO_META = {
    "2008 Global Financial Crisis\n(Sep 2008 – Mar 2009)":  {"duration": "6 months",  "trigger": "Subprime mortgage collapse, Lehman Brothers bankruptcy"},
    "2020 COVID Crash\n(Feb 19 – Mar 23, 2020)":            {"duration": "33 days",   "trigger": "Global pandemic lockdowns, economic shutdown"},
    "2022 Rate Shock\n(Jan – Oct 2022)":                    {"duration": "10 months", "trigger": "Fed rate hikes from 0.25% to 3.75%, inflation surge"},
    "2000 Dot-com Bust\n(Mar 2000 – Oct 2002)":             {"duration": "30 months", "trigger": "Tech bubble collapse, overvalued internet stocks"},
    "2018 Q4 Selloff\n(Oct – Dec 2018)":                    {"duration": "3 months",  "trigger": "Fed tightening fears, trade war escalation"},
}

DEFAULT_RETURN = -0.30  # fallback for unknown tickers


def run_stress_tests(allocations: list[dict], investment_amount: float) -> list[dict]:
    """
    Apply each scenario to the portfolio and return projected loss/gain.
    allocations: list of {ticker, weight (%), dollar_amount}
    """
    results = []

    for scenario_name, scenario_returns in SCENARIO_RETURNS.items():
        meta = SCENARIO_META.get(scenario_name, {})
        portfolio_return = 0.0
        ticker_impacts = []

        for alloc in allocations:
            ticker = alloc["ticker"]
            weight = alloc["weight"] / 100
            etf_return = scenario_returns.get(ticker, DEFAULT_RETURN)
            contribution = weight * etf_return
            portfolio_return += contribution
            ticker_impacts.append({
                "ticker": ticker,
                "weight": alloc["weight"],
                "scenario_return": round(etf_return * 100, 1),
                "contribution": round(contribution * 100, 2),
            })

        dollar_loss = investment_amount * portfolio_return
        results.append({
            "scenario": scenario_name,
            "duration": meta.get("duration", ""),
            "trigger": meta.get("trigger", ""),
            "portfolio_return": round(portfolio_return * 100, 1),
            "dollar_impact": round(dollar_loss, 0),
            "portfolio_value_after": round(investment_amount + dollar_loss, 0),
            "ticker_impacts": sorted(ticker_impacts, key=lambda x: x["contribution"]),
        })

    results.sort(key=lambda x: x["portfolio_return"])
    return results
