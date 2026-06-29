import { useState, useEffect } from 'react'

const STAGES = [
  { icon: '🌅', text: 'Waking up server...', sub: 'First request takes a moment — hang tight', duration: 8000 },
  { icon: '📡', text: 'Fetching live market data...', sub: 'Pulling prices for 125 stocks & ETFs', duration: 10000 },
  { icon: '🧠', text: 'Running AI forecast models...', sub: 'GARCH · EWMA · Momentum · Mean-Reversion', duration: 8000 },
  { icon: '⚙️', text: 'Optimizing your portfolio...', sub: 'Modern Portfolio Theory · Ledoit-Wolf covariance', duration: 6000 },
  { icon: '📊', text: 'Running stress tests...', sub: '2008 · COVID · Rate shock scenarios', duration: 5000 },
  { icon: '✨', text: 'Almost there...', sub: 'Finalizing Monte Carlo & health score', duration: 99999 },
]

const TIPS = [
  'The optimizer considers correlation between all assets — not just individual returns.',
  'Your max drawdown setting is converted to a volatility ceiling using Cornish-Fisher approximation.',
  'The AI blends 5 forecast models: GARCH, EWMA, momentum, mean-reversion, and James-Stein shrinkage.',
  'Fundamentals (P/E, P/B, earnings growth) account for 20% of each ETF\'s composite score.',
  'Stress tests use real historical ETF returns during each crisis, not simulations.',
  'The health score weights: Return Quality 25% · Risk Mgmt 25% · Diversification 20% · Goal 20% · Cost 10%.',
  'Monte Carlo runs 1,000 compounding paths using Geometric Brownian Motion.',
]

export default function LoadingScreen() {
  const [stageIdx, setStageIdx] = useState(0)
  const [tipIdx, setTipIdx] = useState(0)
  const [dots, setDots] = useState('.')
  const [elapsed, setElapsed] = useState(0)

  // Advance stages based on duration
  useEffect(() => {
    let timeout
    const advance = (idx) => {
      const dur = STAGES[idx]?.duration || 99999
      timeout = setTimeout(() => {
        if (idx + 1 < STAGES.length) {
          setStageIdx(idx + 1)
          advance(idx + 1)
        }
      }, dur)
    }
    advance(0)
    return () => clearTimeout(timeout)
  }, [])

  // Rotate tips every 6 seconds
  useEffect(() => {
    const t = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 6000)
    return () => clearInterval(t)
  }, [])

  // Animate dots
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500)
    return () => clearInterval(t)
  }, [])

  // Track elapsed time
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const stage = STAGES[stageIdx]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: '32px', padding: '40px 20px', textAlign: 'center',
    }}>
      {/* Spinning ring */}
      <div style={{ position: 'relative', width: '100px', height: '100px' }}>
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, animation: 'spin 1.2s linear infinite' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--accent)" strokeWidth="6"
            strokeDasharray="60 204" strokeLinecap="round" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '32px' }}>
          {stage.icon}
        </div>
      </div>

      {/* Stage text */}
      <div>
        <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px' }}>
          {stage.text}{dots}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{stage.sub}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          {elapsed}s elapsed
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: '340px' }}>
        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--accent)', borderRadius: '4px',
            width: `${Math.min(95, (stageIdx / (STAGES.length - 1)) * 100)}%`,
            transition: 'width 1s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
          {STAGES.slice(0, -1).map((s, i) => (
            <span key={i} style={{ color: i <= stageIdx ? 'var(--accent)' : 'var(--text-muted)', fontWeight: i === stageIdx ? 700 : 400 }}>
              {s.icon}
            </span>
          ))}
        </div>
      </div>

      {/* Did you know tip */}
      <div style={{
        maxWidth: '420px', padding: '14px 18px', borderRadius: '12px',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        fontSize: '12px', lineHeight: 1.7, color: 'var(--text-muted)',
        transition: 'opacity .5s',
      }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>◆ Did you know? </span>
        {TIPS[tipIdx]}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
