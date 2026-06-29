import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { runMonteCarlo } from '../utils/monteCarlo'

const fmt = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${Math.round(v).toLocaleString()}`
}
const fmtPct = (v) => `${(v * 100).toFixed(0)}%`

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px' }}>
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>Year {d.year?.toFixed(1)}</div>
      <div style={{ color: '#16a34a' }}>95th pctile: {fmt(d.p95)}</div>
      <div style={{ color: '#22c55e' }}>75th pctile: {fmt(d.p75)}</div>
      <div style={{ color: '#3b82f6', fontWeight: 700 }}>Median: {fmt(d.p50)}</div>
      <div style={{ color: '#f97316' }}>25th pctile: {fmt(d.p25)}</div>
      <div style={{ color: '#dc2626' }}>5th pctile: {fmt(d.p5)}</div>
    </div>
  )
}

export default function MonteCarloChart({ portfolio, userProfile }) {
  const annReturn = (portfolio.portfolio_return || 8) / 100
  const annVol = (portfolio.portfolio_volatility || 15) / 100
  const initial = userProfile.investment_amount || 50000
  const monthly = userProfile.monthly_contribution || 0
  const horizonYears = userProfile.horizon || 10
  const [goalInput, setGoalInput] = useState(Math.round(initial * 2 / 1000) * 1000)
  const [nSims] = useState(1000)

  const sim = useMemo(
    () => runMonteCarlo(annReturn, annVol, initial, monthly, horizonYears, nSims),
    [annReturn, annVol, initial, monthly, horizonYears, nSims]
  )

  const goalProb = sim.goalProb(goalInput)

  // Milestone projections at fixed horizons
  const HORIZONS = [5, 10, 15, 20]
  const milestones = HORIZONS.map(yr => {
    const monthIdx = Math.min(Math.round(yr * 12), sim.percentiles.length - 1)
    const p = sim.percentiles[monthIdx]
    if (!p) return null
    const totalContrib = initial + monthly * monthIdx
    return { yr, p5: p.p5, p25: p.p25, p50: p.p50, p75: p.p75, p95: p.p95, totalContrib }
  }).filter(Boolean)

  // Downsample for chart performance (max 60 points)
  const step = Math.max(1, Math.floor(sim.percentiles.length / 60))
  const chartData = sim.percentiles.filter((_, i) => i % step === 0 || i === sim.percentiles.length - 1)

  const finalP5 = sim.percentiles[sim.percentiles.length - 1]?.p5
  const finalP95 = sim.percentiles[sim.percentiles.length - 1]?.p95

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Median Outcome', value: fmt(sim.median), color: '#3b82f6' },
          { label: 'Best Case (95%)', value: fmt(finalP95), color: '#16a34a' },
          { label: 'Worst Case (5%)', value: fmt(finalP5), color: '#dc2626' },
          { label: 'Prob. of Doubling', value: fmtPct(sim.probDouble), color: '#d97706' },
        ].map(t => (
          <div key={t.label} className="metric-tile">
            <div className="metric-label">{t.label}</div>
            <div className="metric-value" style={{ color: t.color }}>{t.value}</div>
            <div className="metric-sub">after {horizonYears}yr</div>
          </div>
        ))}
      </div>

      {/* Fan chart */}
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-muted)' }}>
          Portfolio Value Over Time — {nSims.toLocaleString()} Simulations
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
            <XAxis dataKey="year" tickFormatter={v => `${v.toFixed(0)}y`} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={70} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={initial} stroke="var(--text-muted)" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: 'Initial', fontSize: 10, fill: 'var(--text-muted)' }} />
            {/* Shaded bands */}
            <Area type="monotone" dataKey="p95" stroke="none" fill="#bbf7d040" />
            <Area type="monotone" dataKey="p5"  stroke="none" fill="#fef2f2" />
            <Area type="monotone" dataKey="p75" stroke="none" fill="#dcfce760" />
            <Area type="monotone" dataKey="p25" stroke="none" fill="#fee2e240" />
            <Area type="monotone" dataKey="p50" stroke="#3b82f6" strokeWidth={2.5} fill="none" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
          Green band = 25th–75th percentile · Light band = 5th–95th percentile · Blue line = median
        </div>
      </div>

      {/* Milestone projection table */}
      <div style={{ background: 'var(--surface2)', borderRadius: '12px', padding: '18px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
          Projected Portfolio Value — Milestone Horizons
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Starting with {fmt(initial)}{monthly > 0 ? ` + ${fmt(monthly)}/month contributions` : ''} · {((annReturn)*100).toFixed(1)}% expected return · {((annVol)*100).toFixed(1)}% volatility
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 700 }}>Horizon</th>
                {monthly > 0 && <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 700 }}>Total Invested</th>}
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#dc2626', fontWeight: 700 }}>Worst Case (5%)</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#f97316', fontWeight: 700 }}>Conservative (25%)</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#3b82f6', fontWeight: 700 }}>Median (50%)</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#22c55e', fontWeight: 700 }}>Optimistic (75%)</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#16a34a', fontWeight: 700 }}>Best Case (95%)</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, i) => (
                <tr key={m.yr} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 800, fontSize: '14px' }}>{m.yr} years</td>
                  {monthly > 0 && (
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {fmt(m.totalContrib)}
                    </td>
                  )}
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{fmt(m.p5)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f97316', fontWeight: 600 }}>{fmt(m.p25)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#3b82f6', fontWeight: 700, fontSize: '14px' }}>{fmt(m.p50)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmt(m.p75)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(m.p95)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {monthly > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
            "Total Invested" = initial amount + all monthly contributions to that date. Values above it represent portfolio growth from returns.
          </div>
        )}
      </div>

      {/* Goal probability calculator */}
      <div style={{ background: 'var(--surface2)', borderRadius: '12px', padding: '18px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Goal Probability Calculator</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Target Portfolio Value ($)</label>
            <input
              type="number" min="0" step="1000" value={goalInput}
              onChange={e => setGoalInput(Number(e.target.value))}
              style={{ display: 'block', marginTop: '4px', padding: '8px 12px', borderRadius: '8px',
                border: '1.5px solid var(--border)', fontSize: '14px', width: '180px' }}
            />
          </div>
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: goalProb >= 0.7 ? '#16a34a' : goalProb >= 0.4 ? '#d97706' : '#dc2626' }}>
              {fmtPct(goalProb)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              probability of reaching {fmt(goalInput)} in {horizonYears}yr
            </div>
          </div>
        </div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Based on {nSims.toLocaleString()} Monte Carlo paths using Geometric Brownian Motion with μ={((annReturn)*100).toFixed(1)}%/yr and σ={((annVol)*100).toFixed(1)}%/yr.
          {monthly > 0 && ` Includes $${monthly.toLocaleString()}/month contributions.`}
        </div>
      </div>
    </div>
  )
}
