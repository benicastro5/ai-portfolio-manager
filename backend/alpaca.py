"""
Alpaca Broker Integration
=========================
Supports both paper (paper-api.alpaca.markets) and live (api.alpaca.markets) environments.
All credentials are passed per-request — nothing stored server-side.
"""

import urllib.request
import urllib.error
import json


PAPER_BASE = "https://paper-api.alpaca.markets"
LIVE_BASE  = "https://api.alpaca.markets"
DATA_BASE  = "https://data.alpaca.markets"


def _headers(key: str, secret: str) -> dict:
    return {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        "Content-Type": "application/json",
    }


def _get(url: str, key: str, secret: str) -> dict:
    req = urllib.request.Request(url, headers=_headers(key, secret))
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise ValueError(f"Alpaca API error {e.code}: {body}")


def _post(url: str, payload: dict, key: str, secret: str) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=_headers(key, secret), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise ValueError(f"Alpaca API error {e.code}: {body}")


def _base(paper: bool) -> str:
    return PAPER_BASE if paper else LIVE_BASE


def get_account(key: str, secret: str, paper: bool = True) -> dict:
    raw = _get(f"{_base(paper)}/v2/account", key, secret)
    return {
        "account_number": raw.get("account_number"),
        "status":         raw.get("status"),
        "cash":           float(raw.get("cash", 0)),
        "portfolio_value": float(raw.get("portfolio_value", 0)),
        "buying_power":   float(raw.get("buying_power", 0)),
        "paper":          paper,
        "currency":       raw.get("currency", "USD"),
    }


def get_positions(key: str, secret: str, paper: bool = True) -> list[dict]:
    raw = _get(f"{_base(paper)}/v2/positions", key, secret)
    positions = []
    for p in raw:
        positions.append({
            "ticker":         p.get("symbol"),
            "qty":            float(p.get("qty", 0)),
            "market_value":   float(p.get("market_value", 0)),
            "avg_entry_price": float(p.get("avg_entry_price", 0)),
            "unrealized_pl":  float(p.get("unrealized_pl", 0)),
            "unrealized_plpc": float(p.get("unrealized_plpc", 0)) * 100,
            "current_price":  float(p.get("current_price", 0)),
        })
    return sorted(positions, key=lambda x: x["market_value"], reverse=True)


def place_orders(trades: list[dict], key: str, secret: str, paper: bool = True) -> list[dict]:
    """
    trades: list of { ticker, action, dollar_amount }
    Places fractional notional market orders. Returns order results.
    """
    results = []
    base = _base(paper)
    for trade in trades:
        ticker = trade["ticker"]
        action = trade["action"]       # "Buy" or "Sell"
        amount = abs(float(trade["dollar_amount"]))

        if action not in ("Buy", "Sell") or amount < 1:
            results.append({"ticker": ticker, "status": "skipped", "reason": "Hold or amount < $1"})
            continue

        payload = {
            "symbol":        ticker,
            "notional":      round(amount, 2),
            "side":          "buy" if action == "Buy" else "sell",
            "type":          "market",
            "time_in_force": "day",
        }
        try:
            order = _post(f"{base}/v2/orders", payload, key, secret)
            results.append({
                "ticker":   ticker,
                "status":   "submitted",
                "order_id": order.get("id"),
                "side":     action,
                "notional": amount,
            })
        except ValueError as e:
            results.append({"ticker": ticker, "status": "error", "reason": str(e)})

    return results
