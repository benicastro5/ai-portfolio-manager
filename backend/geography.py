"""
Geographic Allocation Engine
============================
Maps regions/countries to investable ETFs, filters the universe by user geographic
preferences, builds optimizer constraints for min/max geographic allocations, and
computes geographic exposure from final portfolio weights.

Designed to be swappable: replace ETF lists with stocks, bonds, REITs, or FX
positions without changing the optimizer or API architecture.
"""

# ── ETF → geographic metadata ─────────────────────────────────────────────────
# continent: used for exposure aggregation in the dashboard
# regions: list of region keys this ETF covers
# countries: list of country keys this ETF covers
# always_include: if True, ETF is eligible regardless of geo filter (bonds, commodities)

ETF_GEO: dict[str, dict] = {
    # Global
    "VT":   {"continent": "Global",        "regions": ["global"],              "countries": ["global"],          "always_include": False},
    "ACWI": {"continent": "Global",        "regions": ["global"],              "countries": ["global"],          "always_include": False},
    # North America
    "SPY":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "QQQ":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "IWM":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLK":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLF":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLE":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLV":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLY":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLP":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLI":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLU":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLB":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "XLC":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "SOXX": {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "IBB":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "VNQ":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": False},
    "EWC":  {"continent": "North America", "regions": ["canada"],              "countries": ["canada"],          "always_include": False},
    # Europe
    "VGK":  {"continent": "Europe",        "regions": ["europe"],              "countries": ["europe"],          "always_include": False},
    "EWU":  {"continent": "Europe",        "regions": ["europe", "uk"],        "countries": ["uk"],              "always_include": False},
    "EFA":  {"continent": "International", "regions": ["europe", "japan", "australia_nz"], "countries": ["europe", "japan", "australia"], "always_include": False},
    # Asia Pacific
    "EWJ":  {"continent": "Asia",          "regions": ["japan"],               "countries": ["japan"],           "always_include": False},
    "EWA":  {"continent": "Asia Pacific",  "regions": ["australia_nz"],        "countries": ["australia"],       "always_include": False},
    "EWY":  {"continent": "Asia",          "regions": ["southeast_asia", "emerging_markets"], "countries": ["south_korea"], "always_include": False},
    "EWT":  {"continent": "Asia",          "regions": ["southeast_asia", "emerging_markets"], "countries": ["taiwan"],      "always_include": False},
    "EIDO": {"continent": "Asia",          "regions": ["southeast_asia", "emerging_markets"], "countries": ["indonesia"],   "always_include": False},
    "EWM":  {"continent": "Asia",          "regions": ["southeast_asia", "emerging_markets"], "countries": ["malaysia"],    "always_include": False},
    # China
    "MCHI": {"continent": "Asia",          "regions": ["china", "emerging_markets"], "countries": ["china"],    "always_include": False},
    # India
    "INDA": {"continent": "Asia",          "regions": ["india", "emerging_markets"], "countries": ["india"],    "always_include": False},
    # Emerging Markets broad
    "EEM":  {"continent": "Emerging",      "regions": ["emerging_markets"],    "countries": ["china", "india", "brazil", "taiwan", "south_korea"], "always_include": False},
    # Latin America
    "EWZ":  {"continent": "Latin America", "regions": ["latin_america", "emerging_markets"], "countries": ["brazil"],       "always_include": False},
    "EWW":  {"continent": "Latin America", "regions": ["latin_america", "emerging_markets"], "countries": ["mexico"],       "always_include": False},
    "ECH":  {"continent": "Latin America", "regions": ["latin_america", "emerging_markets"], "countries": ["chile"],        "always_include": False},
    # Africa
    "EZA":  {"continent": "Africa",        "regions": ["africa", "emerging_markets"],        "countries": ["south_africa"], "always_include": False},
    # Fixed income — always eligible (not geography-specific)
    "BND":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": True},
    "TLT":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": True},
    "HYG":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": True},
    "LQD":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": True},
    "SHY":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": True},
    "TIP":  {"continent": "North America", "regions": ["us"],                  "countries": ["us"],              "always_include": True},
    # Commodities — always eligible
    "GLD":  {"continent": "Global",        "regions": ["global"],              "countries": ["global"],          "always_include": True},
    "SLV":  {"continent": "Global",        "regions": ["global"],              "countries": ["global"],          "always_include": True},
    "USO":  {"continent": "Global",        "regions": ["global"],              "countries": ["global"],          "always_include": True},
    "DBC":  {"continent": "Global",        "regions": ["global"],              "countries": ["global"],          "always_include": True},
    # ── US Stocks (all tagged US / North America) ─────────────────
    **{t: {"continent": "North America", "regions": ["us"], "countries": ["us"], "always_include": False}
       for t in [
           "AAPL","MSFT","NVDA","GOOGL","META","AMZN","TSLA","AVGO","ORCL","CRM",
           "AMD","INTC","ADBE","NOW","UBER",
           "JPM","BAC","GS","MS","BRK-B","V","MA","BLK","SCHW","AXP",
           "JNJ","UNH","LLY","ABBV","PFE","MRK","TMO","ABT","ISRG",
           "WMT","COST","PG","KO","PEP","MCD","NKE","SBUX","HD","TGT",
           "XOM","CVX","COP","SLB",
           "CAT","HON","UPS","BA","RTX","GE","LMT",
           "NFLX","DIS","T","VZ","TMUS","SPOT",
           "PLD","AMT","EQIX",
           "LIN","APD","NEM",
       ]},
    # ── International ADRs ────────────────────────────────────────
    "TSM":   {"continent": "Asia",          "regions": ["southeast_asia", "emerging_markets"], "countries": ["taiwan"],  "always_include": False},
    "ASML":  {"continent": "Europe",        "regions": ["europe"],              "countries": ["europe"],          "always_include": False},
    "SAP":   {"continent": "Europe",        "regions": ["europe"],              "countries": ["europe"],          "always_include": False},
    "TM":    {"continent": "Asia",          "regions": ["japan"],               "countries": ["japan"],           "always_include": False},
    "BABA":  {"continent": "Asia",          "regions": ["china", "emerging_markets"], "countries": ["china"],    "always_include": False},
    "NVO":   {"continent": "Europe",        "regions": ["europe"],              "countries": ["europe"],          "always_include": False},
    "SHEL":  {"continent": "Europe",        "regions": ["europe", "uk"],        "countries": ["uk"],              "always_include": False},
}

# User-facing region labels → internal region keys
REGION_LABELS = {
    "global":           "Global",
    "us":               "United States",
    "canada":           "Canada",
    "europe":           "Europe",
    "uk":               "United Kingdom",
    "japan":            "Japan",
    "china":            "China",
    "india":            "India",
    "emerging_markets": "Emerging Markets",
    "latin_america":    "Latin America",
    "africa":           "Africa",
    "middle_east":      "Middle East",
    "southeast_asia":   "Southeast Asia",
    "australia_nz":     "Australia & New Zealand",
}

# Country keys → display labels
COUNTRY_LABELS = {
    "global": "Global", "us": "United States", "canada": "Canada",
    "uk": "United Kingdom", "europe": "Europe", "japan": "Japan",
    "china": "China", "india": "India", "brazil": "Brazil", "mexico": "Mexico",
    "chile": "Chile", "south_africa": "South Africa", "south_korea": "South Korea",
    "taiwan": "Taiwan", "indonesia": "Indonesia", "malaysia": "Malaysia",
    "australia": "Australia",
}

# Continent → display color (for dashboard)
CONTINENT_COLORS = {
    "Global":        "#1e40af",
    "North America": "#3b82f6",
    "Europe":        "#16a34a",
    "Asia":          "#d97706",
    "Asia Pacific":  "#f59e0b",
    "Emerging":      "#dc2626",
    "Latin America": "#7c3aed",
    "Africa":        "#0891b2",
    "International": "#64748b",
}


def filter_by_geography(
    tickers: list[str],
    selected_regions: list[str],     # e.g. ["us", "india", "brazil"]
    excluded_countries: list[str],   # e.g. ["china"]
) -> list[str]:
    """
    Return the subset of tickers eligible under the user's geographic preferences.
    - If selected_regions is empty → no geographic filter (all tickers eligible)
    - Fixed income + commodity ETFs (always_include=True) always pass through
    - Excluded countries are removed even if region is selected
    """
    if not selected_regions:
        # No geographic preference → filter only by exclusions
        if not excluded_countries:
            return tickers
        return [t for t in tickers if _not_excluded(t, excluded_countries)]

    selected = set(selected_regions)
    excluded = set(excluded_countries)
    result = []

    for ticker in tickers:
        geo = ETF_GEO.get(ticker)
        if geo is None:
            continue  # unknown ETF — exclude

        # Always-include assets (bonds, commodities) pass through
        if geo.get("always_include"):
            result.append(ticker)
            continue

        # Check country exclusion first
        if excluded and any(c in excluded for c in geo.get("countries", [])):
            continue

        # Check region match
        etf_regions = set(geo.get("regions", []))
        # "global" region selected → include everything not excluded
        if "global" in selected:
            result.append(ticker)
        elif etf_regions & selected:
            result.append(ticker)

    return result


def _not_excluded(ticker: str, excluded_countries: list[str]) -> bool:
    geo = ETF_GEO.get(ticker)
    if geo is None:
        return True
    excluded = set(excluded_countries)
    return not any(c in excluded for c in geo.get("countries", []))


def build_geo_constraints(
    tickers: list[str],
    geo_min: dict[str, float],   # {"india": 0.10, "brazil": 0.05}
    geo_max: dict[str, float],   # {"india": 0.25}
) -> list[dict]:
    """
    Build scipy-compatible constraints for geographic min/max allocations.
    geo_min and geo_max keys are country or region keys (e.g. "india", "latin_america").
    """
    constraints = []
    all_keys = set(list(geo_min.keys()) + list(geo_max.keys()))

    for key in all_keys:
        # Find indices of tickers matching this geo key
        indices = [
            i for i, t in enumerate(tickers)
            if _ticker_matches_geo(t, key)
        ]
        if not indices:
            continue

        if key in geo_min and geo_min[key] > 0:
            min_val = geo_min[key]
            def geo_min_constraint(w, idx=indices, mv=min_val):
                return sum(w[i] for i in idx) - mv
            constraints.append({"type": "ineq", "fun": geo_min_constraint})

        if key in geo_max and geo_max[key] < 1.0:
            max_val = geo_max[key]
            def geo_max_constraint(w, idx=indices, mv=max_val):
                return mv - sum(w[i] for i in idx)
            constraints.append({"type": "ineq", "fun": geo_max_constraint})

    return constraints


def _ticker_matches_geo(ticker: str, key: str) -> bool:
    geo = ETF_GEO.get(ticker)
    if geo is None:
        return False
    return key in geo.get("regions", []) or key in geo.get("countries", [])


def compute_geo_exposure(allocations: list[dict]) -> dict:
    """
    Compute geographic exposure from final portfolio allocations.
    Returns continent breakdown, country breakdown, and a diversification score.
    """
    continent_weights: dict[str, float] = {}
    country_weights: dict[str, float] = {}
    n_countries: set[str] = set()
    n_continents: set[str] = set()

    for alloc in allocations:
        ticker = alloc["ticker"]
        weight = alloc["weight"] / 100  # convert % to decimal
        geo = ETF_GEO.get(ticker, {})

        continent = geo.get("continent", "Other")
        countries = geo.get("countries", [ticker.lower()])

        continent_weights[continent] = continent_weights.get(continent, 0) + weight
        n_continents.add(continent)

        # Distribute weight equally across countries the ETF covers
        per_country = weight / max(len(countries), 1)
        for c in countries:
            label = COUNTRY_LABELS.get(c, c.title())
            country_weights[label] = country_weights.get(label, 0) + per_country
            if c not in ("global",):
                n_countries.add(c)

    # Sort by weight
    continent_breakdown = sorted(
        [{"continent": k, "weight": round(v * 100, 1), "color": CONTINENT_COLORS.get(k, "#64748b")}
         for k, v in continent_weights.items()],
        key=lambda x: -x["weight"]
    )
    country_breakdown = sorted(
        [{"country": k, "weight": round(v * 100, 1)} for k, v in country_weights.items()],
        key=lambda x: -x["weight"]
    )

    # Concentration: Herfindahl index on continents
    hhi = sum(v**2 for v in continent_weights.values())
    if hhi < 0.15:
        concentration = "Low"
    elif hhi < 0.35:
        concentration = "Moderate"
    else:
        concentration = "High"

    # Diversification score (0-100)
    country_score = min(len(n_countries) / 10, 1.0) * 40   # up to 40pts for 10+ countries
    continent_score = min(len(n_continents) / 5, 1.0) * 30  # up to 30pts for 5+ continents
    conc_score = (1 - hhi) * 30                              # up to 30pts for low concentration
    geo_div_score = round(country_score + continent_score + conc_score, 0)

    if geo_div_score >= 75:
        div_label = "Excellent"
    elif geo_div_score >= 50:
        div_label = "Good"
    elif geo_div_score >= 30:
        div_label = "Moderate"
    else:
        div_label = "Concentrated"

    return {
        "continent_breakdown": continent_breakdown,
        "country_breakdown": country_breakdown[:15],  # top 15 countries
        "n_countries": len(n_countries),
        "n_continents": len(n_continents),
        "concentration": concentration,
        "geo_diversification_score": int(geo_div_score),
        "geo_diversification_label": div_label,
    }
