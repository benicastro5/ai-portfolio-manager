import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'

const fmt = (v, suffix = '%') => `${v > 0 ? '+' : ''}${v?.toFixed(1)}${suffix}`
const win = (a, b, higher = true) => (higher ? a > b : a < b) ? 'var(--green)' : 'var(--text)'

export default function BenchmarkComparison({ portfolio, benchmarks }) {
  if (!benchmarks) return null

  const port = {
    label: 'Your Portfolio',
    return: portfolio.portfolio_return,
    volatility: portfolio.portfolio_volatility,
    sharpe: portfolio.sharpe_ratio,
    maxDD: Math.abs(portfolio.max_drawdown_estimate || 0),
    color: 'var(--accent)',
  }

  const spy = {
    label: benchmarks.spy.label,
    return: benchmarks.spy.return * 100,
    volatility: benchmarks.spy.volatility,
    sharpe: benchmarks.spy.sharpe,
    maxDD: 34,  // historical COVID crash approx
    color: '#f97316',
  }

  const s6040 = {
    label: benchmarks.sixty_forty.label,
    return: benchmarks.sixty_forty.return * 100,
    volatility: benchmarks.sixty_forty.volatility,
    sharpe: benchmarks.sixty_forty.sharpe,
    maxDD: 20,
    color: '#8b5cf6',
  }

  const comps = [spy, s6040]

  const metrics = [
    { key: 'return',     label: 'Expected Return (%)', higher: true,  fmt: v => `${v?.toFixed(1)}%` },
    { key: 'volatility', label: 'Annual Volatility (%)', higher: false, fmt: v => `${v?.toFixed(1)}%` },
    { key: 'sharpe',     label: 'Sharpe Ratio',          higher: true,  fmt: v => v?.toFixed(2) },
    { key: 'maxDD',      label: 'Est. Max Drawdown (%)', higher: false, fmt: v => `-${v?.toFixed(1)}%` },
  ]

  // Radar data — normalize each metric 0-100
  const normalize = (val, key) => {
    const all = [port, ...comps].map(p => p[key])
    const mn = Math.min(...all), mx = Math.max(...all)
    if (mx === mn) return 50
    const norm = (val - mn) / (mx - mn) * 100
    return metrics.find(m => m.key === key)?.higher ? norm : 100 - norm
  }

  const radarData = metrics.map(m => ({
    metric: m.label.split(' (')[0],
    Portfolio: Math.round(normalize(port[m.key], m.key)),
    SPY: Math.round(normalize(spy[m.key], m.key)),
    '60/40': Math.round(normalize(s6040[m.key], m.key)),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Comparison table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th style={{ color: 'var(--accent)' }}>◆ Your Portfolio</th>
              {comps.map(c => <th key={c.label} style={{ color: c.color }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key}>
                <td style={{ fontWeight: 600 }}>{m.label}</td>
                <td style={{ fontWeight: 700, color: comps.every(c => m.higher ? port[m.key] >= c[m.key] : port[m.key] <= c[m.key]) ? 'var(--green)' : 'var(--accent)' }}>
                  {m.fmt(port[m.key])}
                  {comps.every(c => m.higher ? port[m.key] >= c[m.key] : port[m.key] <= c[m.key]) && (
                    <span style={{ marginLeft: '6px', fontSize: '11px' }}>✓ best</span>
                  )}
                </td>
                {comps.map(c => (
                  <td key={c.label} style={{ color: c.color }}>{m.fmt(c[m.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Radar chart */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-muted)' }}>
          Risk-Return Profile — Normalized
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Radar name="Your Portfolio" dataKey="Portfolio" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} strokeWidth={2} />
            <Radar name="SPY" dataKey="SPY" stroke="#f97316" fill="#f97316" fillOpacity={0.12} strokeWidth={1.5} strokeDasharray="4 2" />
            <Radar name="60/40" dataKey="60/40" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.10} strokeWidth={1.5} strokeDasharray="2 2" />
          </RadarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '12px', flexWrap: 'wrap' }}>
          {[port, spy, s6040].map(p => (
            <span key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '3px', background: p.color, display: 'inline-block', borderRadius: '2px' }} />
              {p.label}
            </span>
          ))}
        </div>
      </div>

      {/* Interpretation */}
      <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '14px 18px', fontSize: '13px', lineHeight: 1.7 }}>
        <strong>vs Benchmarks:</strong>{' '}
        {port.sharpe > spy.sharpe
          ? `Your portfolio has a superior Sharpe ratio (${port.sharpe?.toFixed(2)} vs SPY's ${spy.sharpe?.toFixed(2)}), meaning better risk-adjusted returns.`
          : `SPY offers a higher Sharpe ratio. Consider whether the additional diversification justifies lower efficiency.`}
        {' '}
        {port.volatility < spy.volatility
          ? `Volatility is ${(spy.volatility - port.volatility).toFixed(1)}% lower than SPY, reflecting the diversification benefit.`
          : `Volatility is higher than SPY — this is expected if you're targeting growth above the market.`}
      </div>
    </div>
  )
}
