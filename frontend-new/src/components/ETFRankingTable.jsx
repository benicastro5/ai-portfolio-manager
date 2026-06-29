import { useState } from 'react'

const recColors = {
  'Strong Buy': 'tag-green', 'Buy': 'tag-blue',
  'Hold': 'tag-gold', 'Underweight': 'tag-gray', 'Avoid': 'tag-red',
}

const regimeStyle = {
  bull:    { background: '#f0fdf4', color: '#16a34a', label: '▲ Bull' },
  neutral: { background: '#f8f9fc', color: '#64748b', label: '◆ Neutral' },
  bear:    { background: '#fef2f2', color: '#dc2626', label: '▼ Bear' },
}

const volRegimeColor = {
  normal:    '#64748b',
  elevated:  '#dc2626',
  compressed:'#16a34a',
}

export default function ETFRankingTable({ etfs }) {
  const [sort, setSort] = useState({ key: 'composite_score', dir: -1 })
  const [view, setView] = useState('forecast') // 'forecast' | 'historical'
  const [showFundamentals, setShowFundamentals] = useState(false)

  const sorted = [...etfs].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key]
    if (typeof av === 'number' && typeof bv === 'number') return sort.dir * (av - bv)
    return sort.dir * String(av).localeCompare(String(bv))
  })

  const toggleSort = (key) => setSort(s => ({ key, dir: s.key === key ? -s.dir : -1 }))

  const Th = ({ k, label }) => (
    <th onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label} {sort.key === k ? (sort.dir === -1 ? '↓' : '↑') : ''}
    </th>
  )

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Return/Vol display:</span>
        {['forecast', 'historical'].map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{
              padding: '4px 12px', borderRadius: '20px', border: '1.5px solid',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              borderColor: view === v ? 'var(--accent)' : 'var(--border)',
              background: view === v ? 'var(--accent-pale)' : 'white',
              color: view === v ? 'var(--accent)' : 'var(--text-muted)',
            }}>
            {v === 'forecast' ? '◆ Ensemble Forecast' : '⟳ Historical'}
          </button>
        ))}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
          {view === 'forecast'
            ? 'Returns blended from GARCH · EWMA · Momentum · Mean-Reversion · James-Stein shrinkage'
            : '3-year trailing annualised returns from live market data'}
        </span>
        <button onClick={() => setShowFundamentals(f => !f)}
          style={{
            marginLeft: 'auto', padding: '4px 12px', borderRadius: '20px', border: '1.5px solid',
            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            borderColor: showFundamentals ? '#7c3aed' : 'var(--border)',
            background: showFundamentals ? '#f5f3ff' : 'white',
            color: showFundamentals ? '#7c3aed' : 'var(--text-muted)',
          }}>
          {showFundamentals ? '◉ Fundamentals ON' : '◎ Show Fundamentals'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Ticker</th>
              <th>Name</th>
              <th>Asset Class / Sector</th>
              <Th k="composite_score" label="Score" />
              <th>Price</th>
              <Th k={view === 'forecast' ? 'forecast_return' : 'ann_return'} label={view === 'forecast' ? 'Fcst Return' : '3Y Return'} />
              <Th k={view === 'forecast' ? 'forecast_vol' : 'ann_vol'} label={view === 'forecast' ? 'Fcst Vol' : 'Hist Vol'} />
              <Th k={view === 'forecast' ? 'forecast_sharpe' : 'sharpe'} label="Sharpe" />
              <th>Regime</th>
              <th>Vol Regime</th>
              <Th k="momentum_3m" label="Mom 3M" />
              {showFundamentals && <>
                <Th k="fundamental_score" label="Fund. Score" />
                <Th k="pe_ratio" label="P/E" />
                <Th k="pb_ratio" label="P/B" />
                <Th k="dividend_yield" label="Div Yield" />
                <Th k="earnings_growth" label="EPS Growth" />
                <th>Yield Curve</th>
              </>}
              <th>Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(e => {
              const ret = view === 'forecast' ? e.forecast_return : e.ann_return
              const vol = view === 'forecast' ? e.forecast_vol : e.ann_vol
              const sharpe = view === 'forecast' ? e.forecast_sharpe : e.sharpe
              const rs = regimeStyle[e.regime] || regimeStyle.neutral
              return (
                <tr key={e.ticker}>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>#{e.rank}</td>
                  <td>
                    <strong style={{ color: 'var(--accent)' }}>{e.ticker}</strong>
                    <div style={{ fontSize: '10px', color: e.data_source === 'live' ? 'var(--green)' : 'var(--gold)' }}>
                      {e.data_source === 'live' ? '● live' : '● cached'}
                    </div>
                  </td>
                  <td style={{ fontSize: '12px', maxWidth: '160px' }}>{e.name}</td>
                  <td>
                    <div><span className="tag tag-blue" style={{ fontSize: '10px' }}>{e.asset_class}</span></div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{e.sector}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '50px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${e.composite_score}%`, height: '100%', background: scoreColor(e.composite_score), borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontWeight: 700 }}>{e.composite_score?.toFixed(0)}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>${e.current_price?.toFixed(2)}</td>
                  <td style={{ color: ret > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {ret > 0 ? '+' : ''}{ret?.toFixed(1)}%
                    {view === 'forecast' && (
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>hist: {e.ann_return > 0 ? '+' : ''}{e.ann_return?.toFixed(1)}%</div>
                    )}
                  </td>
                  <td>
                    {vol?.toFixed(1)}%
                    {view === 'forecast' && e.garch_persistence && (
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>pers: {e.garch_persistence?.toFixed(2)}</div>
                    )}
                  </td>
                  <td>{sharpe?.toFixed(2)}</td>
                  <td>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: rs.background, color: rs.color }}>
                      {rs.label}
                    </span>
                    {e.regime_confidence && (
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{e.regime_confidence} conf.</div>
                    )}
                  </td>
                  <td style={{ color: volRegimeColor[e.garch_vol_regime] || '#64748b', fontSize: '12px', fontWeight: 600 }}>
                    {e.garch_vol_regime || 'normal'}
                  </td>
                  <td style={{ color: e.momentum_3m > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {e.momentum_3m > 0 ? '+' : ''}{e.momentum_3m?.toFixed(1)}%
                  </td>
                  {showFundamentals && <>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '40px', height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${e.fundamental_score || 50}%`, height: '100%', background: '#7c3aed', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '12px' }}>{e.fundamental_score?.toFixed(0) ?? '—'}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '12px' }}>{e.pe_ratio?.toFixed(1) ?? '—'}</td>
                    <td style={{ fontSize: '12px' }}>{e.pb_ratio?.toFixed(1) ?? '—'}</td>
                    <td style={{ fontSize: '12px', color: e.dividend_yield > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                      {e.dividend_yield != null ? `${e.dividend_yield?.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ fontSize: '12px', color: e.earnings_growth > 0 ? 'var(--green)' : e.earnings_growth < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                      {e.earnings_growth != null ? `${e.earnings_growth > 0 ? '+' : ''}${e.earnings_growth?.toFixed(1)}%` : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '20px',
                        background: e.yield_curve_signal === 'normal' ? '#f0fdf4' : e.yield_curve_signal === 'inverted' ? '#fef2f2' : '#fefce8',
                        color: e.yield_curve_signal === 'normal' ? '#16a34a' : e.yield_curve_signal === 'inverted' ? '#dc2626' : '#d97706' }}>
                        {e.yield_curve_signal || 'neutral'}
                      </span>
                    </td>
                  </>}
                  <td><span className={`tag ${recColors[e.recommendation] || 'tag-gray'}`}>{e.recommendation}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--surface2)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <strong>Forecast methodology:</strong> Ensemble of (1) GARCH(1,1) volatility with variance targeting,
        (2) Exponentially-weighted mean returns (6-month half-life), (3) Cross-sectional momentum (1/3/6/12M with reversal skip),
        (4) Mean-reversion via Ornstein-Uhlenbeck z-score, (5) James-Stein shrinkage toward grand mean.
        Covariance matrix uses Ledoit-Wolf analytical shrinkage. Returns are 60% ensemble / 40% historical.
      </div>
    </div>
  )
}

function scoreColor(score) {
  if (score >= 70) return 'var(--green)'
  if (score >= 50) return 'var(--accent-light)'
  if (score >= 35) return 'var(--gold)'
  return 'var(--red)'
}
