import { useState } from 'react'
import { rebalancePortfolio } from '../api'

const fmtDollar = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`

function recommendedDrift(horizon, vol) {
  const h = parseFloat(horizon) || 5
  const v = parseFloat(vol) || 15

  // Base from horizon
  let base = h < 0.5 ? 2 : h < 1 ? 3 : h < 3 ? 5 : h < 7 ? 7 : 10

  // Vol adjustment: high vol → tighter (drift happens faster); low vol → looser
  let volAdj = 0
  if (v >= 20) volAdj = -2
  else if (v >= 15) volAdj = -1
  else if (v <= 5) volAdj = +2
  else if (v <= 8) volAdj = +1

  const pct = Math.max(2, Math.min(12, base + volAdj))

  const horizonDesc = h < 0.5 ? 'short horizon' : h < 1 ? 'sub-year horizon' : h < 3 ? 'medium-term' : h < 7 ? 'long-term' : 'very long horizon'
  const volDesc = v >= 20 ? 'high vol — tighter control' : v <= 8 ? 'low vol — more tolerance' : `${v}% vol`

  return { pct, reason: `${horizonDesc}, ${volDesc}` }
}

export default function RebalancingPanel({ targetAllocations, targetVolAllocations, portfolioValue, horizon, vol }) {
  const buildHoldings = (allocs) =>
    allocs.map(a => ({ ticker: a.ticker, current_value: a.dollar_amount }))

  const [holdings, setHoldings] = useState(buildHoldings(targetAllocations))
  const [activeSource, setActiveSource] = useState('optimal')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [threshold, setThreshold] = useState(5)
  const [totalValue, setTotalValue] = useState(portfolioValue)

  const prefill = (source) => {
    const allocs = source === 'optimal' ? targetAllocations : targetVolAllocations
    const h = buildHoldings(allocs)
    setHoldings(h)
    setTotalValue(h.reduce((sum, x) => sum + (Number(x.current_value) || 0), 0))
    setActiveSource(source)
    setResult(null)
  }

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
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Enter your current holding values. Use a prefill button to load a portfolio as your starting point.
        </p>

        {/* Prefill buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '4px' }}>Prefill from:</span>
          <button
            type="button"
            onClick={() => prefill('optimal')}
            style={{
              padding: '6px 14px', borderRadius: '20px', border: '1.5px solid',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              borderColor: activeSource === 'optimal' ? 'var(--accent)' : 'var(--border)',
              background: activeSource === 'optimal' ? 'var(--accent-pale)' : 'var(--surface)',
              color: activeSource === 'optimal' ? 'var(--accent)' : 'var(--text-muted)',
            }}>
            ◆ Optimal Portfolio
          </button>
          {targetVolAllocations && (
            <button
              type="button"
              onClick={() => prefill('targetvol')}
              style={{
                padding: '6px 14px', borderRadius: '20px', border: '1.5px solid',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                borderColor: activeSource === 'targetvol' ? 'var(--accent)' : 'var(--border)',
                background: activeSource === 'targetvol' ? 'var(--accent-pale)' : 'var(--surface)',
                color: activeSource === 'targetvol' ? 'var(--accent)' : 'var(--text-muted)',
              }}>
              ◎ Target-Vol Portfolio
            </button>
          )}
          <button
            type="button"
            onClick={() => { setHoldings(h => h.map(x => ({ ...x, current_value: 0 }))); setTotalValue(0); setResult(null) }}
            style={{
              padding: '6px 14px', borderRadius: '20px', border: '1.5px solid var(--border)',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              background: 'var(--surface)', color: 'var(--text-muted)',
            }}>
            ✕ Clear All
          </button>
        </div>

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
            {(() => { const rec = recommendedDrift(horizon, vol); return (
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
