import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'

const fmt = (v) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${v < 0 ? '-' : '+'}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${v < 0 ? '-' : '+'}$${(abs / 1_000).toFixed(0)}K`
  return `${v < 0 ? '-' : '+'}$${Math.round(abs).toLocaleString()}`
}
const fmtDollar = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0 })}`

const severityColor = (ret) => {
  if (ret >= 0) return '#16a34a'
  if (ret > -10) return '#d97706'
  if (ret > -20) return '#f97316'
  if (ret > -35) return '#dc2626'
  return '#7f1d1d'
}

export default function StressTestPanel({ stressTests, investmentAmount }) {
  const [selected, setSelected] = useState(null)

  if (!stressTests?.length) return <div style={{ color: 'var(--text-muted)', padding: '20px' }}>No stress test data available.</div>

  const chartData = stressTests.map(s => ({
    name: s.scenario.split('\n')[0],
    return: s.portfolio_return,
    dollar: s.dollar_impact,
  }))

  const selectedTest = selected !== null ? stressTests[selected] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary bar chart */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-muted)' }}>
          Portfolio Return Under Each Crisis Scenario
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 20, left: 10, bottom: 40 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-12} textAnchor="end" interval={0} />
            <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`${v.toFixed(1)}%`, 'Portfolio Return']} />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
            <Bar dataKey="return" radius={[4, 4, 0, 0]} cursor="pointer"
              onClick={(_, idx) => setSelected(selected === idx ? null : idx)}>
              {chartData.map((entry, i) => (
                <Cell key={i}
                  fill={severityColor(entry.return)}
                  opacity={selected === null || selected === i ? 1 : 0.4}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Scenario cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
        {stressTests.map((s, i) => (
          <div key={i}
            onClick={() => setSelected(selected === i ? null : i)}
            style={{
              padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
              border: `2px solid ${selected === i ? severityColor(s.portfolio_return) : 'var(--border)'}`,
              background: selected === i ? `${severityColor(s.portfolio_return)}10` : 'var(--surface)',
              transition: 'all .15s',
            }}>
            <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.4, marginBottom: '8px' }}>
              {s.scenario.replace('\n', ' ')}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: severityColor(s.portfolio_return) }}>
              {s.portfolio_return > 0 ? '+' : ''}{s.portfolio_return?.toFixed(1)}%
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {fmt(s.dollar_impact)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Portfolio → {fmtDollar(s.portfolio_value_after)}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
              {s.duration} · {s.trigger}
            </div>
          </div>
        ))}
      </div>

      {/* Ticker breakdown for selected scenario */}
      {selectedTest && (
        <div style={{ background: 'var(--surface2)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>
            Holding-Level Impact — {selectedTest.scenario.replace('\n', ' ')}
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Weight</th>
                <th>Scenario Return</th>
                <th>Portfolio Contribution</th>
              </tr>
            </thead>
            <tbody>
              {selectedTest.ticker_impacts.map(t => (
                <tr key={t.ticker}>
                  <td><strong style={{ color: 'var(--accent)' }}>{t.ticker}</strong></td>
                  <td>{t.weight?.toFixed(1)}%</td>
                  <td style={{ color: severityColor(t.scenario_return), fontWeight: 700 }}>
                    {t.scenario_return > 0 ? '+' : ''}{t.scenario_return?.toFixed(1)}%
                  </td>
                  <td style={{ color: severityColor(t.contribution), fontWeight: 600 }}>
                    {t.contribution > 0 ? '+' : ''}{t.contribution?.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Scenario returns are based on historical ETF price data during each crisis window.
        Actual portfolio behavior may differ due to rebalancing and market correlation changes.
      </div>
    </div>
  )
}
