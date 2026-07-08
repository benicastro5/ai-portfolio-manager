import { useState, useEffect, useRef } from 'react'
import { fetchSecurityDetail } from '../api'

const fmt = (v, decimals = 1) => v == null ? '—' : Number(v).toFixed(decimals)
const fmtPct = (v) => v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`
const fmtDollar = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const fmtB = (v) => v == null ? '—' : v > 1e12 ? `$${(v/1e12).toFixed(1)}T` : v > 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M`

function MiniChart({ prices }) {
  if (!prices || prices.length < 2) return null
  const vals = prices.map(p => p.price)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const W = 500, H = 100
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  }).join(' ')
  const isUp = vals[vals.length - 1] >= vals[0]
  const color = isUp ? 'var(--green)' : 'var(--red)'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '90px' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#chartGrad)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  )
}

function ConvictionBadge({ conviction, score }) {
  const cfg = {
    'High':     { bg: 'var(--green-pale)',         color: 'var(--green)',  icon: '▲▲' },
    'Moderate': { bg: 'var(--accent-pale)',         color: 'var(--accent)', icon: '▲'  },
    'Neutral':  { bg: 'var(--surface2)',            color: 'var(--text-muted)', icon: '◆' },
    'Cautious': { bg: 'rgba(250,173,20,.12)',       color: '#faad14',       icon: '▼'  },
    'Low':      { bg: 'rgba(239,68,68,.10)',        color: 'var(--red)',    icon: '▼▼' },
  }
  const c = cfg[conviction] || cfg['Neutral']
  return (
    <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.color}40` }}>
      {c.icon} {conviction} Conviction
    </span>
  )
}

export default function SecurityDetailModal({ allocation, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const overlayRef = useRef()

  useEffect(() => {
    fetchSecurityDetail(allocation.ticker, allocation)
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [allocation.ticker])

  // Close on backdrop click
  const handleOverlay = (e) => { if (e.target === overlayRef.current) onClose() }
  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const tech = detail?.technicals || {}
  const fund = detail?.fundamentals || {}
  const thesis = detail?.thesis || {}

  return (
    <div ref={overlayRef} onClick={handleOverlay}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflowY: 'auto' }}>

      <div style={{ background: 'var(--bg)', borderRadius: '16px', width: '100%', maxWidth: '680px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent)' }}>{allocation.ticker}</span>
              <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '8px',
                background: 'var(--surface2)', color: 'var(--text-muted)', fontWeight: 600 }}>
                {allocation.sector || allocation.asset_class}
              </span>
              {thesis.conviction && <ConvictionBadge conviction={thesis.conviction} score={thesis.score} />}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {fund.short_name || allocation.name} · {allocation.weight?.toFixed(1)}% portfolio weight
              · {fmtDollar(allocation.dollar_amount)} allocated
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer',
              color: 'var(--text-muted)', lineHeight: 1, padding: '4px 8px' }}>✕</button>
        </div>

        {loading && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '13px' }}>⟳ Loading analysis…</div>
          </div>
        )}

        {error && (
          <div style={{ padding: '24px', color: 'var(--red)', fontSize: '13px' }}>{error}</div>
        )}

        {detail && (
          <div style={{ padding: '20px 24px' }}>

            {/* Price chart */}
            {detail.prices?.length > 2 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '.5px', color: 'var(--text-muted)' }}>6-Month Price</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    ${tech.current_price?.toLocaleString()}
                  </span>
                </div>
                <MiniChart prices={detail.prices} />
              </div>
            )}

            {/* Thesis summary */}
            {thesis.summary && (
              <div style={{ padding: '14px 16px', borderRadius: '10px', marginBottom: '20px',
                background: 'var(--accent-pale)', border: '1px solid var(--accent)', borderLeftWidth: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.5px', color: 'var(--accent)', marginBottom: '6px' }}>Investment Thesis</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text)' }}>{thesis.summary}</div>
              </div>
            )}

            {/* Bull case + Risk flags */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              {thesis.bull_case?.length > 0 && (
                <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--green-pale)',
                  border: '1px solid var(--green)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)',
                    textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>▲ Bull Case</div>
                  {thesis.bull_case.map((p, i) => (
                    <div key={i} style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text)',
                      marginBottom: '6px', paddingLeft: '10px', borderLeft: '2px solid var(--green)' }}>
                      {p}
                    </div>
                  ))}
                </div>
              )}
              {thesis.risk_flags?.length > 0 && (
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239,68,68,.07)',
                  border: '1px solid var(--red)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red)',
                    textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>⚠ Risk Flags</div>
                  {thesis.risk_flags.map((p, i) => (
                    <div key={i} style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text)',
                      marginBottom: '6px', paddingLeft: '10px', borderLeft: '2px solid var(--red)' }}>
                      {p}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Technicals */}
            {Object.keys(tech).length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>Technicals</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: '10px' }}>
                  {[
                    { label: 'RSI (14)', value: tech.rsi14, badge: tech.rsi_signal },
                    { label: '20-Day MA', value: fmtDollar(tech.ma20), sub: tech.above_ma20 ? '▲ above' : '▼ below', green: tech.above_ma20 },
                    { label: '50-Day MA', value: fmtDollar(tech.ma50), sub: tech.above_ma50 ? '▲ above' : '▼ below', green: tech.above_ma50 },
                    { label: '200-Day MA', value: tech.ma200 ? fmtDollar(tech.ma200) : '—', sub: tech.above_ma200 == null ? '' : tech.above_ma200 ? '▲ above' : '▼ below', green: tech.above_ma200 },
                    { label: 'Trend', value: tech.trend?.replace('trend','') || '—' },
                  ].map(m => (
                    <div key={m.label} className="metric-tile">
                      <div className="metric-label">{m.label}</div>
                      <div className="metric-value" style={{ fontSize: '14px',
                        color: m.green === true ? 'var(--green)' : m.green === false ? 'var(--red)' : undefined }}>
                        {m.value}
                      </div>
                      {m.sub && <div style={{ fontSize: '10px', color: m.green ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{m.sub}</div>}
                      {m.badge && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{m.badge}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fundamentals */}
            {Object.values(fund).some(v => v != null) && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>Fundamentals</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: '10px' }}>
                  {[
                    { label: 'Trailing P/E',    value: fund.pe_ratio      ? `${fmt(fund.pe_ratio)}x`    : '—' },
                    { label: 'Forward P/E',     value: fund.forward_pe    ? `${fmt(fund.forward_pe)}x`  : '—' },
                    { label: 'P/B Ratio',       value: fund.pb_ratio      ? `${fmt(fund.pb_ratio)}x`    : '—' },
                    { label: 'Dividend Yield',  value: fund.dividend_yield ? `${fmt(fund.dividend_yield)}%` : '—' },
                    { label: 'Revenue Growth',  value: fund.revenue_growth  != null ? fmtPct(fund.revenue_growth)  : '—', color: fund.revenue_growth > 0 ? 'var(--green)' : 'var(--red)' },
                    { label: 'Earnings Growth', value: fund.earnings_growth != null ? fmtPct(fund.earnings_growth) : '—', color: fund.earnings_growth > 0 ? 'var(--green)' : 'var(--red)' },
                    { label: 'Beta',            value: fund.beta           ? fmt(fund.beta, 2)           : '—' },
                    { label: 'Market Cap',      value: fmtB(fund.market_cap) },
                  ].map(m => (
                    <div key={m.label} className="metric-tile">
                      <div className="metric-label">{m.label}</div>
                      <div className="metric-value" style={{ fontSize: '14px', color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optimizer metrics */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>Optimizer Signals</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: '10px' }}>
                {[
                  { label: 'Expected Return', value: `${fmt(allocation.expected_return)}%`, color: 'var(--green)' },
                  { label: 'Volatility',      value: `${fmt(allocation.volatility)}%` },
                  { label: 'Sharpe Ratio',    value: fmt(allocation.sharpe, 2) },
                  { label: 'Risk Contrib.',   value: `${fmt(allocation.risk_contribution)}%` },
                  { label: '3M Momentum',     value: fmtPct(allocation.momentum_3m), color: allocation.momentum_3m > 0 ? 'var(--green)' : 'var(--red)' },
                  { label: '12M Momentum',    value: fmtPct(allocation.momentum_12m), color: allocation.momentum_12m > 0 ? 'var(--green)' : 'var(--red)' },
                  { label: 'Regime',          value: allocation.regime || '—' },
                  { label: 'Vol Regime',      value: allocation.vol_regime || '—' },
                ].map(m => (
                  <div key={m.label} className="metric-tile">
                    <div className="metric-label">{m.label}</div>
                    <div className="metric-value" style={{ fontSize: '14px', color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {fund.description && (
              <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px',
                background: 'var(--surface2)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {fund.description}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
