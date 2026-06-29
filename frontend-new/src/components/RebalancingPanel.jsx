import { useState } from 'react'
import { rebalancePortfolio } from '../api'

const fmtDollar = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`

function recommendedDrift(horizon) {
  const h = parseFloat(horizon) || 5
  if (h < 0.5)  return { pct: 2,  reason: 'Short horizon — tight control needed' }
  if (h < 1)    return { pct: 3,  reason: 'Under 1 year — rebalance frequently' }
  if (h < 3)    return { pct: 5,  reason: 'Medium-term — standard threshold' }
  if (h < 7)    return { pct: 7,  reason: 'Long-term — allow more natural drift' }
  return        { pct: 10, reason: 'Very long horizon — rebalance sparingly' }
}

export default function RebalancingPanel({ targetAllocations, portfolioValue, horizon }) {
  const [holdings, setHoldings] = useState(
    targetAllocations.map(a => ({ ticker: a.ticker, current_value: a.dollar_amount }))
  )
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [threshold, setThreshold] = useState(5)
  const [totalValue, setTotalValue] = useState(portfolioValue)

  const updateHolding = (ticker, val) => {
    setHoldings(h => {
      const updated = h.map(x => x.ticker === ticker ? { ...x, current_value: Number(val) } : x)
      setTotalValue(updated.reduce((sum, x) => sum + (Number(x.current_value) || 0), 0))
      return updated
    })
  }

  const runRebalance = async () => {
    setLoading(true)
    try {
      const data = await rebalancePortfolio({
        target_allocations: targetAllocations.map(a => ({
          ticker: a.ticker, weight_decimal: a.weight_decimal
        })),
        current_holdings: holdings,
        portfolio_value: Number(totalValue),
        drift_threshold: Number(threshold),
      })
      setResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const actionColor = { Buy: 'var(--green)', Sell: 'var(--red)', Hold: 'var(--text-muted)' }

  return (
    <div>
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">Current Holdings</div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Enter your current holding values to see rebalancing recommendations. Pre-filled with target allocations as a starting point.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {holdings.map(h => (
            <div key={h.ticker} className="form-group">
              <label>{h.ticker} Current Value ($)</label>
              <input type="number" min="0" value={h.current_value}
                onChange={e => updateHolding(h.ticker, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="rebal-form">
          <div className="form-group">
            <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>
              Total Portfolio Value ($) <span style={{ color: 'var(--accent)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— auto-updated</span>
            </label>
            <input type="number" value={Math.round(totalValue)} readOnly
              style={{ background: 'var(--surface2)', cursor: 'default', fontWeight: 700, color: 'var(--accent)' }} />
          </div>
          <div className="form-group">
            <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Drift Threshold (%)</label>
            <input type="number" min="1" max="20" value={threshold} onChange={e => setThreshold(e.target.value)} />
            {(() => { const rec = recommendedDrift(horizon); return (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Recommended: <strong style={{ color: 'var(--accent)', cursor: 'pointer' }}
                  onClick={() => setThreshold(rec.pct)}>{rec.pct}%</strong> — {rec.reason}
              </span>
            )})()}
          </div>
          <button onClick={runRebalance} disabled={loading}>
            {loading ? '⟳ Computing…' : '⟳ Run Rebalance'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div className="card-title" style={{ margin: 0 }}>Rebalancing Recommendations</div>
            <div>
              <span className={`rebal-badge ${result.needs_rebalance ? 'rebal-needed' : 'rebal-ok'}`}>
                {result.needs_rebalance ? '⚠ Rebalance Needed' : '✓ Portfolio Balanced'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '12px' }}>
                Avg drift: {result.portfolio_drift_pct?.toFixed(1)}%
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div className="metric-tile">
              <div className="metric-label">Portfolio Value</div>
              <div className="metric-value">{fmtDollar(result.current_portfolio_value)}</div>
            </div>
            <div className="metric-tile">
              <div className="metric-label">Total Buys</div>
              <div className="metric-value" style={{ color: 'var(--green)' }}>{fmtDollar(result.total_buys)}</div>
            </div>
            <div className="metric-tile">
              <div className="metric-label">Total Sells</div>
              <div className="metric-value" style={{ color: 'var(--red)' }}>{fmtDollar(result.total_sells)}</div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th><th>Target Wt</th><th>Current Wt</th><th>Drift</th>
                  <th>Target $</th><th>Current $</th><th>Trade $</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map(r => (
                  <tr key={r.ticker}>
                    <td><strong style={{ color: 'var(--accent)' }}>{r.ticker}</strong></td>
                    <td>{r.target_weight?.toFixed(1)}%</td>
                    <td>{r.current_weight?.toFixed(1)}%</td>
                    <td style={{ color: Math.abs(r.drift) > threshold ? 'var(--red)' : 'var(--text-muted)', fontWeight: Math.abs(r.drift) > threshold ? 700 : 400 }}>
                      {r.drift > 0 ? '+' : ''}{r.drift?.toFixed(1)}%
                    </td>
                    <td>{fmtDollar(r.target_value)}</td>
                    <td>{fmtDollar(r.current_value)}</td>
                    <td style={{ color: r.trade_amount > 0 ? 'var(--green)' : r.trade_amount < 0 ? 'var(--red)' : 'var(--text-muted)', fontWeight: 600 }}>
                      {r.trade_amount > 0 ? '+' : ''}{fmtDollar(r.trade_amount)}
                    </td>
                    <td>
                      <span className={`tag ${r.action === 'Buy' ? 'tag-green' : r.action === 'Sell' ? 'tag-red' : 'tag-gray'}`}>
                        {r.action}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
