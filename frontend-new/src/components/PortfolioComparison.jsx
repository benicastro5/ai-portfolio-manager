import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = [
  '#1e40af','#3b82f6','#60a5fa','#93c5fd',
  '#16a34a','#22c55e','#86efac',
  '#d97706','#f59e0b','#fcd34d',
  '#dc2626','#f87171','#7c3aed','#a78bfa','#0891b2',
]

const fmt$ = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0 })}`

function MiniPie({ allocations }) {
  const data = allocations.map(a => ({ name: a.ticker, value: a.weight }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={75} labelLine={false}
          label={({ name, value }) => value >= 9 ? name : ''}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => `${v?.toFixed(1)}%`} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function AllocationBars({ allocations }) {
  return (
    <div>
      {allocations.map((a, i) => (
        <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
          borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', flexShrink: 0,
            background: COLORS[i % COLORS.length] }} />
          <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--accent)', minWidth: '40px' }}>
            {a.ticker}
          </span>
          <div style={{ flex: 1, height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${a.weight}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: '4px' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '12px', minWidth: '38px', textAlign: 'right' }}>
            {a.weight?.toFixed(1)}%
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '68px', textAlign: 'right' }}>
            {fmt$(a.dollar_amount)}
          </span>
        </div>
      ))}
    </div>
  )
}

const METRICS = [
  { key: 'portfolio_return',       label: 'Exp. Return',   unit: '%',  higherIsBetter: true,  decimals: 1 },
  { key: 'portfolio_volatility',   label: 'Volatility',    unit: '%',  higherIsBetter: false, decimals: 1 },
  { key: 'sharpe_ratio',           label: 'Sharpe Ratio',  unit: '',   higherIsBetter: true,  decimals: 2 },
  { key: 'max_drawdown_estimate',  label: 'Max Drawdown',  unit: '%',  higherIsBetter: false, decimals: 1, abs: true },
  { key: 'num_assets',             label: '# Assets',      unit: '',   higherIsBetter: true,  decimals: 0 },
  { key: 'diversification_ratio',  label: 'Div. Ratio',    unit: 'x',  higherIsBetter: true,  decimals: 2 },
]

export default function PortfolioComparison({ optimal, targetVol, targetVolPct }) {
  const optAllocs = optimal.allocations
  const tvAllocs = targetVol.allocations

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Info banner */}
      <div style={{ background: 'var(--accent-pale)', border: '1px solid #bfdbfe', borderRadius: '10px',
        padding: '12px 16px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
        <strong>How to read this:</strong> The <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Optimal Portfolio</span> maximises
        risk-adjusted return for your goal. The <span style={{ color: '#7c3aed', fontWeight: 700 }}>Target Vol Portfolio</span> is anchored
        to exactly <strong>{targetVolPct}%</strong> volatility — the highest-return portfolio at that precise risk level.
      </div>

      {/* Metrics table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 800, color: 'var(--accent)',
                fontSize: '13px', borderBottom: '2px solid var(--border)', width: '35%' }}>
                ◆ Optimal Portfolio
              </th>
              <th style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)',
                fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px',
                borderBottom: '2px solid var(--border)', width: '30%' }}>
                Metric
              </th>
              <th style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 800, color: '#7c3aed',
                fontSize: '13px', borderBottom: '2px solid var(--border)', width: '35%' }}>
                ⊕ Target Vol ({targetVolPct}%)
              </th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map(({ key, label, unit, higherIsBetter, decimals, abs }) => {
              const aRaw = optimal[key]
              const bRaw = targetVol[key]
              const a = abs ? Math.abs(aRaw) : aRaw
              const b = abs ? Math.abs(bRaw) : bRaw
              const aWins = higherIsBetter ? a > b : a < b
              const bWins = higherIsBetter ? b > a : b < a
              const fmt = (v) => v == null ? '—' : `${Number(v).toFixed(decimals)}${unit}`
              return (
                <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 20px', textAlign: 'left',
                    fontWeight: aWins ? 800 : 500,
                    color: aWins ? 'var(--accent)' : 'var(--text)', fontSize: '14px' }}>
                    {fmt(a)}
                    {aWins && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--green)' }}>✓</span>}
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'center', fontSize: '11px',
                    color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                    {label}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right',
                    fontWeight: bWins ? 800 : 500,
                    color: bWins ? '#7c3aed' : 'var(--text)', fontSize: '14px' }}>
                    {bWins && <span style={{ marginRight: '6px', fontSize: '11px', color: 'var(--green)' }}>✓</span>}
                    {fmt(b)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Side-by-side allocations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase',
            letterSpacing: '.5px', marginBottom: '12px' }}>◆ Optimal — Allocation</div>
          <MiniPie allocations={optAllocs} />
          <div style={{ marginTop: '12px' }}><AllocationBars allocations={optAllocs} /></div>
        </div>
        <div className="card">
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase',
            letterSpacing: '.5px', marginBottom: '12px' }}>⊕ Target Vol — Allocation</div>
          <MiniPie allocations={tvAllocs} />
          <div style={{ marginTop: '12px' }}><AllocationBars allocations={tvAllocs} /></div>
        </div>
      </div>

      {/* Takeaway */}
      {(() => {
        const retDiff = (targetVol.portfolio_return - optimal.portfolio_return)
        const tvBetter = retDiff > 0.2
        const color = tvBetter ? '#bbf7d0' : '#fde68a'
        const bg = tvBetter ? 'var(--green-pale)' : 'var(--gold-pale)'
        return (
          <div style={{ padding: '14px 18px', borderRadius: '10px', background: bg,
            border: `1px solid ${color}`, fontSize: '13px', lineHeight: 1.7 }}>
            <strong>Takeaway:</strong>{' '}
            {tvBetter
              ? `Targeting exactly ${targetVolPct}% vol gives you ${retDiff.toFixed(1)}% more expected return vs the optimal. If you're comfortable using your full risk budget, the Target Vol Portfolio is worth considering.`
              : `The Optimal Portfolio already captures the best risk-adjusted return near your ${targetVolPct}% target. Forcing exactly ${targetVolPct}% makes ${Math.abs(retDiff) < 0.3 ? 'minimal difference' : `returns ${Math.abs(retDiff).toFixed(1)}% lower`} with a worse Sharpe ratio.`
            }
          </div>
        )
      })()}
    </div>
  )
}
