import { useState } from 'react'
import { runBacktest } from '../api'

const fmtPct   = (v, sign = true) => v == null ? '—' : `${sign && v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`
const fmtDollar = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Minimal SVG line chart — no external deps
function LineChart({ data }) {
  if (!data || data.length < 2) return null
  const W = 700, H = 260, PAD = { t: 20, r: 20, b: 40, l: 55 }
  const inner_w = W - PAD.l - PAD.r
  const inner_h = H - PAD.t - PAD.b

  const portVals = data.map(d => d.portfolio)
  const spyVals  = data.filter(d => d.spy != null).map(d => d.spy)
  const allVals  = [...portVals, ...spyVals]
  const minY = Math.min(...allVals) * 0.98
  const maxY = Math.max(...allVals) * 1.02
  const rangeY = maxY - minY || 1

  const xScale = (i) => PAD.l + (i / (data.length - 1)) * inner_w
  const yScale = (v) => PAD.t + inner_h - ((v - minY) / rangeY) * inner_h

  const toPath = (vals, key) => {
    const pts = data
      .map((d, i) => d[key] != null ? `${xScale(i).toFixed(1)},${yScale(d[key]).toFixed(1)}` : null)
      .filter(Boolean)
    return pts.length > 1 ? `M ${pts.join(' L ')}` : ''
  }

  // Y-axis gridlines (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (rangeY / 4) * i)

  // X-axis labels (show ~6 evenly spaced)
  const xStep = Math.max(1, Math.floor(data.length / 6))
  const xLabels = data.filter((_, i) => i % xStep === 0 || i === data.length - 1)

  const portPath = toPath(data, 'portfolio')
  const spyPath  = toPath(data, 'spy')

  const lastPort = data[data.length - 1]?.portfolio
  const lastSpy  = data[data.length - 1]?.spy
  const portColor = (lastPort ?? 100) >= 100 ? '#16a34a' : '#dc2626'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={yScale(v)} y2={yScale(v)}
            stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />
          <text x={PAD.l - 6} y={yScale(v) + 4} textAnchor="end"
            fontSize="10" fill="var(--text-muted)">{v.toFixed(0)}</text>
        </g>
      ))}

      {/* Baseline at 100 */}
      <line x1={PAD.l} x2={W - PAD.r} y1={yScale(100)} y2={yScale(100)}
        stroke="var(--border)" strokeWidth="1" strokeDasharray="6 3" />

      {/* SPY line */}
      {spyPath && <path d={spyPath} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" />}

      {/* Portfolio line */}
      {portPath && <path d={portPath} fill="none" stroke={portColor} strokeWidth="2.5" />}

      {/* X-axis labels */}
      {xLabels.map((d, i) => {
        const idx = data.indexOf(d)
        return (
          <text key={i} x={xScale(idx)} y={H - 8} textAnchor="middle"
            fontSize="9" fill="var(--text-muted)">{d.date}</text>
        )
      })}

      {/* Legend */}
      <g transform={`translate(${PAD.l + 10}, ${PAD.t + 8})`}>
        <line x1={0} x2={18} y1={0} y2={0} stroke={portColor} strokeWidth="2.5" />
        <text x={22} y={4} fontSize="11" fill="var(--text)">Portfolio</text>
        <line x1={80} x2={98} y1={0} y2={0} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" />
        <text x={102} y={4} fontSize="11" fill="var(--text-muted)">SPY</text>
      </g>

      {/* End value labels */}
      {portPath && lastPort != null && (
        <text x={W - PAD.r + 4} y={yScale(lastPort) + 4} fontSize="10" fontWeight="700" fill={portColor}>
          {lastPort.toFixed(0)}
        </text>
      )}
    </svg>
  )
}

function MetricCompare({ label, port, spy, lowerBetter = false }) {
  const portNum = parseFloat(port)
  const spyNum  = parseFloat(spy)
  const portWins = lowerBetter ? portNum > spyNum : portNum > spyNum
  return (
    <tr>
      <td style={{ padding: '8px 12px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</td>
      <td style={{ padding: '8px 12px', fontSize: '14px', fontWeight: 700,
        color: portWins ? 'var(--green)' : 'var(--text)', textAlign: 'right' }}>
        {port}{portWins ? ' ✓' : ''}
      </td>
      <td style={{ padding: '8px 12px', fontSize: '14px', fontWeight: 700,
        color: !portWins ? 'var(--green)' : 'var(--text-muted)', textAlign: 'right' }}>
        {spy}{!portWins ? ' ✓' : ''}
      </td>
    </tr>
  )
}

export default function BacktestPanel({ allocations, monthlyContribution = 0 }) {
  const [period, setPeriod]   = useState(3)
  const [rebal, setRebal]     = useState('none')
  const [contrib, setContrib] = useState(monthlyContribution)
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const handleRun = async () => {
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await runBacktest({
        allocations: allocations.map(a => ({ ticker: a.ticker, weight_decimal: a.weight_decimal })),
        initial_value: 10000,
        period_years: period,
        rebalance_freq: rebal,
        monthly_contribution: Number(contrib) || 0,
      })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const pm = result?.portfolio_metrics
  const sm = result?.spy_metrics

  return (
    <div>
      {/* Controls */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">Backtest Settings</div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Simulate how this portfolio would have performed historically using daily price data vs SPY benchmark.
          Initial investment: <strong>$10,000</strong>.
          {contrib > 0 && <span style={{ color: 'var(--green)', fontWeight: 600 }}> + ${Number(contrib).toLocaleString()}/mo contributions.</span>}
        </p>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Period</label>
            <select value={period} onChange={e => setPeriod(Number(e.target.value))}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px' }}>
              <option value={1}>1 Year</option>
              <option value={2}>2 Years</option>
              <option value={3}>3 Years</option>
              <option value={5}>5 Years</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Monthly Contribution ($)</label>
            <input type="number" min="0" value={contrib} onChange={e => setContrib(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px', width: '130px' }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Rebalancing</label>
            <select value={rebal} onChange={e => setRebal(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px' }}>
              <option value="none">Buy & Hold (no rebalance)</option>
              <option value="quarterly">Quarterly Rebalance</option>
              <option value="annual">Annual Rebalance</option>
            </select>
          </div>
          <button onClick={handleRun} disabled={loading}
            style={{ padding: '9px 24px', borderRadius: '8px', border: 'none',
              background: 'var(--accent)', color: 'white', fontWeight: 700,
              fontSize: '13px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? '⟳ Running…' : '▶ Run Backtest'}
          </button>
        </div>
        {error && <div className="error-msg" style={{ marginTop: '12px' }}>⚠ {error}</div>}
      </div>

      {result && (
        <>
          {/* Chart */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              <div>
                <div className="card-title" style={{ marginBottom: '2px' }}>
                  Cumulative Performance (normalised to 100)
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {result.start_date} → {result.end_date} · {period}Y · {rebal === 'none' ? 'Buy & Hold' : rebal.charAt(0).toUpperCase() + rebal.slice(1) + ' Rebalance'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Portfolio value</div>
                  <div style={{ fontSize: '18px', fontWeight: 800,
                    color: (pm?.total_return ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fmtDollar(pm?.final_value)}
                  </div>
                  {result.monthly_contribution > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Total invested: {fmtDollar(result.total_contributed)}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <LineChart data={result.chart_data} />
            {result.missing_tickers?.length > 0 && (
              <p style={{ fontSize: '11px', color: 'var(--gold)', marginTop: '8px' }}>
                ⚠ Missing data for: {result.missing_tickers.join(', ')} — weights renormalised
              </p>
            )}
          </div>

          {/* Metrics comparison */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-title">Performance Metrics vs SPY</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px',
                      fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Metric</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '11px',
                      fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)' }}>◆ Portfolio</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '11px',
                      fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>SPY Benchmark</th>
                  </tr>
                </thead>
                <tbody style={{ borderBottom: '1px solid var(--border)' }}>
                  <MetricCompare label="Total Return"       port={fmtPct(pm?.total_return)} spy={fmtPct(sm?.total_return)} />
                  <MetricCompare label="Ann. Return"        port={fmtPct(pm?.ann_return)}   spy={fmtPct(sm?.ann_return)} />
                  <MetricCompare label="Ann. Volatility"    port={fmtPct(pm?.ann_vol, false)} spy={fmtPct(sm?.ann_vol, false)} lowerBetter />
                  <MetricCompare label="Sharpe Ratio"       port={pm?.sharpe?.toFixed(2)}   spy={sm?.sharpe?.toFixed(2)} />
                  <MetricCompare label="Sortino Ratio"      port={pm?.sortino?.toFixed(2)}  spy={sm?.sortino?.toFixed(2)} />
                  <MetricCompare label="Max Drawdown"       port={fmtPct(pm?.max_drawdown)} spy={fmtPct(sm?.max_drawdown)} lowerBetter />
                  <MetricCompare label="Calmar Ratio"       port={pm?.calmar?.toFixed(2)}   spy={sm?.calmar?.toFixed(2)} />
                  <MetricCompare label="Final Value ($10k)" port={fmtDollar(pm?.final_value)} spy={fmtDollar(sm?.final_value)} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Annual returns */}
          {result.annual_returns?.length > 0 && (
            <div className="card">
              <div className="card-title">Annual Returns Breakdown</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                {result.annual_returns.map(yr => (
                  <div key={yr.year} style={{ padding: '12px 16px', borderRadius: '10px', minWidth: '80px',
                    background: yr.return >= 0 ? 'var(--green-pale)' : 'var(--red-pale)',
                    border: `1px solid ${yr.return >= 0 ? 'var(--green)' : 'var(--red)'}`,
                    textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{yr.year}</div>
                    <div style={{ fontSize: '18px', fontWeight: 800,
                      color: yr.return >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {yr.return > 0 ? '+' : ''}{yr.return.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
