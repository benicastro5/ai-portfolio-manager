import { useState } from 'react'
import { runTrendScan } from '../api'

const RISK_COLORS = {
  low:      { bg: 'var(--green-pale)',   border: 'var(--green)',   text: 'var(--green)'   },
  moderate: { bg: 'rgba(250,173,20,.12)', border: '#faad14',        text: '#faad14'        },
  high:     { bg: 'rgba(239,68,68,.10)',  border: 'var(--red)',      text: 'var(--red)'     },
}

const RISK_LABELS = {
  low:      'Conservative',
  moderate: 'Moderate Risk',
  high:     'Speculative',
}

function SourceBadge({ label }) {
  const isReddit    = label.toLowerCase().includes('reddit')
  const isStockTwit = label.toLowerCase().includes('stocktwits')
  const isGoogle    = label.toLowerCase().includes('google')
  const color = isReddit ? '#FF4500' : isStockTwit ? '#1db954' : isGoogle ? '#4285F4' : 'var(--text-muted)'
  const icon  = isReddit ? 'R' : isStockTwit ? 'ST' : isGoogle ? 'G' : '◈'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
      borderRadius: '12px', fontSize: '10px', fontWeight: 700,
      background: `${color}18`, color, border: `1px solid ${color}40`, marginRight: '4px', marginBottom: '4px' }}>
      <span style={{ fontWeight: 900 }}>{icon}</span> {label.length > 50 ? label.slice(0, 47) + '…' : label}
    </span>
  )
}

function TrendBar({ score }) {
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 70 ? 'var(--accent)' : pct >= 40 ? '#faad14' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color, transition: 'width .4s ease' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color, minWidth: '28px', textAlign: 'right' }}>{pct}</span>
    </div>
  )
}

function OpportunityCard({ opp }) {
  const [expanded, setExpanded] = useState(false)
  const rc = RISK_COLORS[opp.risk_level] || RISK_COLORS.moderate
  const momColor = opp.mom_1m >= 0 ? 'var(--green)' : 'var(--red)'

  return (
    <div style={{ border: `1.5px solid ${opp.fits_profile ? rc.border : 'var(--border)'}`,
      borderRadius: '12px', padding: '16px', background: opp.fits_profile ? rc.bg : 'var(--surface)',
      transition: 'box-shadow .2s', cursor: 'pointer' }}
      onClick={() => setExpanded(e => !e)}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        {/* Left: ticker + name */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent)' }}>{opp.ticker}</span>
            {opp.fits_profile && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px',
                background: 'var(--green)', color: '#fff' }}>✓ Fits Profile</span>
            )}
          </div>
          {opp.name && opp.name !== opp.ticker && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{opp.name}</div>
          )}
        </div>

        {/* Right: risk badge + price */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
            background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`, marginBottom: '4px', display: 'inline-block' }}>
            {RISK_LABELS[opp.risk_level]}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>${opp.current_price?.toLocaleString()}</div>
        </div>
      </div>

      {/* Trend score bar */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
          color: 'var(--text-muted)', marginBottom: '5px' }}>Trend Score</div>
        <TrendBar score={opp.trend_score} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Ann. Vol</div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{opp.ann_vol?.toFixed(1)}%</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>1-Mo Return</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: momColor }}>
            {opp.mom_1m >= 0 ? '+' : ''}{opp.mom_1m?.toFixed(1)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>3-Mo Return</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: opp.mom_3m >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {opp.mom_3m >= 0 ? '+' : ''}{opp.mom_3m?.toFixed(1)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Spec. Score</div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{opp.spec_score}/100</div>
        </div>
      </div>

      {/* Sources */}
      <div style={{ marginTop: '8px' }}>
        {(opp.sources || []).map((s, i) => <SourceBadge key={i} label={s} />)}
      </div>

      {/* Expanded: sample titles */}
      {expanded && opp.sample_titles?.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
            color: 'var(--text-muted)', marginBottom: '6px' }}>Trending Discussions</div>
          {opp.sample_titles.map((t, i) => (
            <div key={i} style={{ fontSize: '12px', color: 'var(--text)', padding: '5px 8px',
              background: 'var(--surface2)', borderRadius: '6px', marginBottom: '4px' }}>
              "{t}"
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right' }}>
        {expanded ? '▲ less' : '▼ details'}
      </div>
    </div>
  )
}

export default function TrendScannerPanel({ goal, riskTolerance }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [filter, setFilter] = useState('all')  // 'all' | 'fits' | 'high' | 'moderate' | 'low'

  const handleScan = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await runTrendScan({ goal: goal || 'balanced', risk_tolerance: riskTolerance || 15 })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = result?.opportunities?.filter(o => {
    if (filter === 'fits') return o.fits_profile
    if (filter === 'high' || filter === 'moderate' || filter === 'low') return o.risk_level === filter
    return true
  }) || []

  return (
    <div>
      {/* Header card */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">◈ Trend Scanner</div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          Scans Reddit financial communities, StockTwits trending tickers, and Google Trends for
          emerging investment themes — then filters results against your risk profile. Results are
          <strong style={{ color: 'var(--red)' }}> speculative and for research only</strong>; always do your own due diligence.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--surface2)',
                border: '1px solid var(--border)', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Goal: </span>
                <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--accent)' }}>{goal || 'balanced'}</span>
              </div>
              <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--surface2)',
                border: '1px solid var(--border)', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Vol Tolerance: </span>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{riskTolerance || 15}%</span>
              </div>
            </div>
          </div>
          <button onClick={handleScan} disabled={loading} style={{ minWidth: '160px' }}>
            {loading ? '⟳ Scanning…' : '◈ Run Trend Scan'}
          </button>
        </div>

        {loading && (
          <div style={{ marginTop: '20px', padding: '16px', background: 'var(--surface2)',
            borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ width: '16px', height: '16px', border: '2px solid var(--accent)',
                borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>Scanning markets…</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Reading Reddit financial communities · StockTwits trending tickers · Enriching with market data
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(239,68,68,.08)',
            borderRadius: '8px', border: '1px solid var(--red)', color: 'var(--red)', fontSize: '13px' }}>
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Tickers Scanned', value: result.scanned },
              { label: 'Shown', value: result.opportunities?.length },
              { label: 'Fit Your Profile', value: result.profile_matches, accent: true },
              { label: 'As Of', value: result.as_of?.replace(' UTC', ''), small: true },
            ].map(m => (
              <div key={m.label} className="metric-tile">
                <div className="metric-label">{m.label}</div>
                <div className={`metric-value${m.small ? ' metric-value-sm' : ''}`}
                  style={{ color: m.accent ? 'var(--green)' : undefined, fontSize: m.small ? '13px' : undefined }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Filter row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[
              { key: 'all',      label: 'All' },
              { key: 'fits',     label: '✓ Fits Profile' },
              { key: 'low',      label: 'Conservative' },
              { key: 'moderate', label: 'Moderate Risk' },
              { key: 'high',     label: 'Speculative' },
            ].map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                style={{ padding: '5px 14px', borderRadius: '20px', border: '1.5px solid',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  borderColor: filter === f.key ? 'var(--accent)' : 'var(--border)',
                  background: filter === f.key ? 'var(--accent-pale)' : 'var(--surface)',
                  color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)' }}>
                {f.label}
              </button>
            ))}
            <span style={{ alignSelf: 'center', fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              No results match this filter.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {filtered.map(opp => <OpportunityCard key={opp.ticker} opp={opp} />)}
            </div>
          )}

          <div style={{ marginTop: '20px', padding: '12px 16px', background: 'var(--surface2)',
            borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
            ⚠ Trend data reflects social media sentiment and search popularity, not fundamental analysis.
            Past momentum is not indicative of future performance. This is not investment advice.
          </div>
        </>
      )}
    </div>
  )
}
