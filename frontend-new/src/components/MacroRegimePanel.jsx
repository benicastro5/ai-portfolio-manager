const SIGNAL_COLORS = {
  bull:    { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  neutral: { bg: '#f8f9fc', color: '#64748b', border: '#e2e8f0' },
  bear:    { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

function ScoreMeter({ score }) {
  // score: -100 (bear) to +100 (bull)
  const pct = ((score + 100) / 200) * 100
  const color = score >= 20 ? '#16a34a' : score <= -20 ? '#dc2626' : '#d97706'
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px',
        color: 'var(--text-muted)', marginBottom: '4px' }}>
        <span>Bear −100</span>
        <span style={{ fontWeight: 700, color }}>Score: {score > 0 ? '+' : ''}{score}</span>
        <span>Bull +100</span>
      </div>
      <div style={{ height: '8px', borderRadius: '4px', background: 'var(--surface2)',
        border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
        {/* Center line */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: '1px', background: 'var(--border)' }} />
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px',
          background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function SignalCard({ label, signal }) {
  if (!signal) return null
  const available = signal.value !== null && signal.value !== undefined
  const isPositive = signal.signal > 10
  const isNegative = signal.signal < -10
  const dotColor = isPositive ? '#16a34a' : isNegative ? '#dc2626' : '#d97706'

  return (
    <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--surface2)',
      border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.5px', color: 'var(--text-muted)' }}>{label}</span>
        {available && (
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px',
            borderRadius: '12px', background: `${dotColor}18`, color: dotColor }}>
            {signal.label}
          </span>
        )}
      </div>
      {available ? (
        <>
          <div style={{ fontSize: '22px', fontWeight: 800, color: dotColor, lineHeight: 1.2 }}>
            {label === 'VIX' ? signal.value :
             label === 'Yield Curve' ? `${signal.value > 0 ? '+' : ''}${signal.value}%` :
             `${signal.value > 0 ? '+' : ''}${signal.value}%`}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {signal.interpretation}
          </div>
        </>
      ) : (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Unavailable</div>
      )}
    </div>
  )
}

export default function MacroRegimePanel({ macroRegime }) {
  if (!macroRegime) return (
    <div className="card">
      <div className="card-title">Macro Regime</div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No macro data available.</p>
    </div>
  )

  const { regime, regime_score, confidence, signals, summary, as_of, equity_cap_adj } = macroRegime
  const rc = SIGNAL_COLORS[regime] || SIGNAL_COLORS.neutral
  const regimeIcon = { bull: '▲', neutral: '◆', bear: '▼' }[regime] || '◆'

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div className="card-title" style={{ marginBottom: '4px' }}>Macro Regime Detection</div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Live signals: VIX · Yield Curve · Credit Spread
            {as_of && <span> · Updated {as_of}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, padding: '6px 16px',
            borderRadius: '20px', background: rc.bg, color: rc.color, border: `1.5px solid ${rc.border}` }}>
            {regimeIcon} {regime.charAt(0).toUpperCase() + regime.slice(1)} Market
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {confidence} confidence
          </span>
        </div>
      </div>

      <ScoreMeter score={regime_score} />

      {summary && (
        <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '8px',
          background: rc.bg, border: `1px solid ${rc.border}`,
          fontSize: '13px', color: rc.color, fontWeight: 500, lineHeight: 1.5 }}>
          {summary}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px',
        marginTop: '16px' }}>
        <SignalCard label="VIX" signal={signals?.vix} />
        <SignalCard label="Yield Curve" signal={signals?.yield_curve} />
        <SignalCard label="Credit Spread" signal={signals?.credit_spread} />
      </div>

      {equity_cap_adj !== 0 && (
        <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px',
          background: 'var(--accent-pale)', border: '1px solid var(--accent)',
          fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
          ◆ Portfolio adjusted: equity max weight {equity_cap_adj > 0 ? 'increased' : 'reduced'} by{' '}
          {Math.abs(equity_cap_adj * 100).toFixed(0)}pp due to {regime} regime
        </div>
      )}
    </div>
  )
}
