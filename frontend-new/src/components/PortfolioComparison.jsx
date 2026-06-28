import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = [
  '#1e40af','#3b82f6','#60a5fa','#93c5fd',
  '#16a34a','#22c55e','#86efac',
  '#d97706','#f59e0b','#fcd34d',
  '#dc2626','#f87171','#7c3aed','#a78bfa','#0891b2',
]

const fmt$ = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
const fmtPct = (v, sign = false) => `${sign && v > 0 ? '+' : ''}${v?.toFixed(1)}%`

function MiniPie({ allocations }) {
  const data = allocations.map(a => ({ name: a.ticker, value: a.weight }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={80} labelLine={false}
          label={({ name, value }) => value >= 8 ? `${name}` : ''}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => `${v?.toFixed(1)}%`} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function MetricRow({ label, a, b, better, unit = '%', higherIsBetter = true }) {
  const aWins = higherIsBetter ? a > b : a < b
  const bWins = higherIsBetter ? b > a : b < a
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, textAlign: 'right', fontWeight: aWins ? 700 : 400,
        color: aWins ? 'var(--accent)' : 'var(--text)', fontSize: '14px' }}>
        {unit === '$' ? fmt$(a) : `${a?.toFixed(1)}${unit}`}
        {aWins && <span style={{ marginLeft: '4px', fontSize: '11px', color: 'var(--green)' }}>✓</span>}
      </div>
      <div style={{ width: '140px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)',
        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', padding: '0 8px' }}>
        {label}
      </div>
      <div style={{ flex: 1, fontWeight: bWins ? 700 : 400,
        color: bWins ? 'var(--accent)' : 'var(--text)', fontSize: '14px' }}>
        {unit === '$' ? fmt$(b) : `${b?.toFixed(1)}${unit}`}
        {bWins && <span style={{ marginLeft: '4px', fontSize: '11px', color: 'var(--green)' }}>✓</span>}
      </div>
    </div>
  )
}

function AllocationBars({ allocations, colors }) {
  return (
    <div>
      {allocations.map((a, i) => (
        <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0',
          borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', flexShrink: 0,
            background: COLORS[i % COLORS.length] }} />
          <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--accent)', minWidth: '44px' }}>
            {a.ticker}
          </span>
          <div style={{ flex: 1, height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${a.weight}%`, height: '100%', background: COLORS[i % COLORS.length],
              borderRadius: '4px', transition: 'width .4s' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>
            {a.weight?.toFixed(1)}%
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '72px', textAlign: 'right' }}>
            {fmt$(a.dollar_amount)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PortfolioComparison({ optimal, targetVol, targetVolPct, investmentAmount }) {
  const optAllocs = optimal.allocations
  const tvAllocs = targetVol.allocations

  return (
    <div>
      <div style={{ background: 'var(--accent-pale)', border: '1px solid #bfdbfe', borderRadius: '10px',
        padding: '14px 20px', marginBottom: '20px', fontSize: '13px', color: 'var(--text)' }}>
        <strong>How to read this:</strong> The <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Optimal Portfolio</span> maximises
        risk-adjusted return for your goal — the model's best pick regardless of your exact vol target.
        The <span style={{ color: '#7c3aed', fontWeight: 700 }}>Target Vol Portfolio</span> is anchored to
        exactly <strong>{targetVolPct}%</strong> volatility — the highest-return portfolio available at that precise risk level.
        Use this to understand what extra return (if any) comes from accepting your full risk budget.
      </div>

      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr', gap: '0', marginBottom: '0' }}>
        <div className="card" style={{ borderRadius: '12px 0 0 0', borderRight: 'none', borderBottom: 'none', paddingBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent)', marginBottom: '2px' }}>
            ◆ Optimal Portfolio
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Best risk-adjusted allocation for your goal
          </div>
        </div>
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '.5px' }}>
          vs
        </div>
        <div className="card" style={{ borderRadius: '0 12px 0 0', borderLeft: 'none', borderBottom: 'none', paddingBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#7c3aed', marginBottom: '2px' }}>
            ⊕ Target Vol Portfolio
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Max return at exactly {targetVolPct}% volatility
          </div>
        </div>
      </div>

      {/* Metrics comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr' }}>
        <div className="card" style={{ borderRadius: '0', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}>
          {/* spacer */}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
          borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '0 8px' }}>
          <MetricRow label="Exp. Return" a={optimal.portfolio_return} b={targetVol.portfolio_return} />
          <MetricRow label="Volatility" a={optimal.portfolio_volatility} b={targetVol.portfolio_volatility} higherIsBetter={false} />
          <MetricRow label="Sharpe Ratio" a={optimal.sharpe_ratio} b={targetVol.sharpe_ratio} unit="" />
          <MetricRow label="Max Drawdown" a={Math.abs(optimal.max_drawdown_estimate)} b={Math.abs(targetVol.max_drawdown_estimate)} higherIsBetter={false} />
          <MetricRow label="# Assets" a={optimal.num_assets} b={targetVol.num_assets} unit="" />
          <MetricRow label="Div. Ratio" a={optimal.diversification_ratio} b={targetVol.diversification_ratio} unit="x" />
        </div>
        <div className="card" style={{ borderRadius: '0', borderTop: 'none', borderLeft: 'none', borderBottom: 'none' }}>
          {/* spacer */}
        </div>
      </div>

      {/* Pie charts + allocation bars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr' }}>
        <div className="card" style={{ borderRadius: '0', borderTop: 'none', borderRight: 'none' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
            color: 'var(--text-muted)', letterSpacing: '.5px', marginBottom: '12px' }}>
            Allocation
          </div>
          <MiniPie allocations={optAllocs} />
          <div style={{ marginTop: '16px' }}>
            <AllocationBars allocations={optAllocs} />
          </div>
        </div>

        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
          borderTop: 'none', borderLeft: 'none', borderRight: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '24px', padding: '20px 8px' }}>
          {[
            { label: 'Return diff', val: (targetVol.portfolio_return - optimal.portfolio_return).toFixed(1), unit: '%' },
            { label: 'Vol diff', val: (targetVol.portfolio_volatility - optimal.portfolio_volatility).toFixed(1), unit: '%' },
            { label: 'Sharpe diff', val: (targetVol.sharpe_ratio - optimal.sharpe_ratio).toFixed(2), unit: '' },
          ].map(({ label, val, unit }) => {
            const num = parseFloat(val)
            const color = num > 0 ? 'var(--green)' : num < 0 ? 'var(--red)' : 'var(--text-muted)'
            return (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase',
                  letterSpacing: '.4px', marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color }}>
                  {num > 0 ? '+' : ''}{val}{unit}
                </div>
              </div>
            )
          })}
        </div>

        <div className="card" style={{ borderRadius: '0', borderTop: 'none', borderLeft: 'none' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
            color: 'var(--text-muted)', letterSpacing: '.5px', marginBottom: '12px' }}>
            Allocation
          </div>
          <MiniPie allocations={tvAllocs} />
          <div style={{ marginTop: '16px' }}>
            <AllocationBars allocations={tvAllocs} />
          </div>
        </div>
      </div>

      {/* Takeaway */}
      {(() => {
        const retDiff = (targetVol.portfolio_return - optimal.portfolio_return).toFixed(1)
        const volDiff = (targetVol.portfolio_volatility - optimal.portfolio_volatility).toFixed(1)
        const sharpeDiff = (targetVol.sharpe_ratio - optimal.sharpe_ratio).toFixed(2)
        const tvBetter = targetVol.portfolio_return > optimal.portfolio_return
        return (
          <div style={{ marginTop: '16px', padding: '14px 18px', borderRadius: '10px',
            background: tvBetter ? 'var(--green-pale)' : 'var(--gold-pale)',
            border: `1px solid ${tvBetter ? '#bbf7d0' : '#fde68a'}`, fontSize: '13px', lineHeight: 1.7 }}>
            <strong>Takeaway:</strong>{' '}
            {tvBetter
              ? `Targeting exactly ${targetVolPct}% vol gives you ${retDiff}% more expected return
                 (vol increases by ${volDiff}%) compared to the optimal. If you're comfortable using your
                 full risk budget, the Target Vol Portfolio is worth considering.`
              : `The Optimal Portfolio already captures the best risk-adjusted return available near your
                 ${targetVolPct}% target. Forcing exactly ${targetVolPct}% vol ${Math.abs(parseFloat(retDiff)) < 0.5
                   ? 'makes minimal difference'
                   : `reduces expected return by ${Math.abs(parseFloat(retDiff)).toFixed(1)}%`} with
                 a Sharpe ratio change of ${sharpeDiff}.`
            }
          </div>
        )
      })()}
    </div>
  )
}
