import { useState } from 'react'

function horizonLabel(val) {
  const v = parseFloat(val)
  if (v < 1) {
    const months = Math.round(v * 12)
    return `${months} month${months !== 1 ? 's' : ''}`
  }
  if (v === 1) return '1 year'
  if (Number.isInteger(v)) return `${v} years`
  const years = Math.floor(v)
  const months = Math.round((v - years) * 12)
  return months > 0 ? `${years}y ${months}m` : `${years} years`
}

const SECTORS = ['Technology', 'Energy', 'Commodities', 'Real Estate', 'High Yield', 'Emerging Markets', 'Small Cap']
const ETFS = ['SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'BND', 'TLT', 'GLD', 'SLV', 'USO', 'VNQ', 'HYG', 'LQD', 'SHY', 'TIP', 'DBC']

export default function OnboardingForm({ onSubmit, loading, error }) {
  const [form, setForm] = useState({
    investment_amount: 50000,
    risk_tolerance: 15,
    horizon: 5,
    goal: 'balanced',
    max_drawdown: -20,
    base_currency: 'USD',
    monthly_contribution: 0,
    excluded_sectors: [],
    excluded_assets: [],
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleList = (key, val) => {
    setForm(f => ({
      ...f,
      [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val]
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...form,
      investment_amount: Number(form.investment_amount),
      risk_tolerance: Number(form.risk_tolerance),
      horizon: parseFloat(form.horizon),
      max_drawdown: -Math.abs(Number(form.max_drawdown)),
      monthly_contribution: Number(form.monthly_contribution),
    })
  }

  return (
    <div className="onboarding">
      <div className="onboarding-hero">
        <h1>Build Your Optimal Portfolio</h1>
        <p>Enter your investment parameters and let AI optimize an institutional-grade portfolio for you.</p>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-section-title">Core Parameters</div>
        <div className="form-grid">
          <div className="form-group">
            <label>Investment Amount ({form.base_currency})</label>
            <input type="number" min="1000" value={form.investment_amount}
              onChange={e => set('investment_amount', e.target.value)} required />
          </div>

          <div className="form-group">
            <label>Base Currency</label>
            <select value={form.base_currency} onChange={e => set('base_currency', e.target.value)}>
              <option>USD</option><option>EUR</option><option>GBP</option><option>JPY</option>
            </select>
          </div>

          <div className="form-group">
            <label>Risk Tolerance (Target Vol %)</label>
            <input type="number" min="1" max="50" step="0.5" value={form.risk_tolerance}
              onChange={e => set('risk_tolerance', e.target.value)} required />
            <span className="form-hint">Target annual portfolio volatility (e.g. 15 = moderate)</span>
          </div>

          <div className="form-group">
            <label>Investment Horizon — <strong>{horizonLabel(form.horizon)}</strong></label>
            <input type="range" min="0.25" max="30" step="0.25" value={form.horizon}
              onChange={e => set('horizon', e.target.value)} required
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
            <div style={{ position: 'relative', height: '18px', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {[{ label: '3m', val: 0.25 }, { label: '1y', val: 1 }, { label: '5y', val: 5 }, { label: '10y', val: 10 }, { label: '20y', val: 20 }, { label: '30y', val: 30 }].map(({ label, val }) => {
                const pct = ((val - 0.25) / (30 - 0.25)) * 100
                return (
                  <span key={label} style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="form-group">
            <label>Investment Goal</label>
            <select value={form.goal} onChange={e => set('goal', e.target.value)}>
              <option value="growth">Growth — Maximize Long-Term Returns</option>
              <option value="balanced">Balanced — Growth + Income</option>
              <option value="income">Income — Regular Cash Flow</option>
              <option value="capital_preservation">Capital Preservation — Minimize Risk</option>
            </select>
          </div>

          <div className="form-group">
            <label>Max Drawdown Tolerance (%)</label>
            <input type="number" min="1" max="80" value={Math.abs(form.max_drawdown)}
              onChange={e => set('max_drawdown', -Math.abs(e.target.value))} required />
            <span className="form-hint">Maximum loss you can tolerate (e.g. 20 = -20%)</span>
          </div>

          <div className="form-group">
            <label>Monthly Contribution (optional)</label>
            <input type="number" min="0" value={form.monthly_contribution}
              onChange={e => set('monthly_contribution', e.target.value)} />
          </div>
        </div>

        <div className="form-section-title">Exclusions (Optional)</div>
        <div className="form-grid">
          <div className="form-group form-full">
            <label>Exclude Sectors / Asset Classes</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              {SECTORS.map(s => (
                <button key={s} type="button"
                  onClick={() => toggleList('excluded_sectors', s)}
                  style={{
                    padding: '5px 12px', borderRadius: '20px', border: '1.5px solid',
                    fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                    borderColor: form.excluded_sectors.includes(s) ? 'var(--red)' : 'var(--border)',
                    background: form.excluded_sectors.includes(s) ? 'var(--red-pale)' : 'var(--surface)',
                    color: form.excluded_sectors.includes(s) ? 'var(--red)' : 'var(--text-muted)',
                  }}>
                  {form.excluded_sectors.includes(s) ? '✕ ' : ''}{s}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group form-full">
            <label>Exclude Specific ETFs</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              {ETFS.map(t => (
                <button key={t} type="button"
                  onClick={() => toggleList('excluded_assets', t)}
                  style={{
                    padding: '5px 12px', borderRadius: '20px', border: '1.5px solid',
                    fontSize: '12px', cursor: 'pointer', fontWeight: 700,
                    borderColor: form.excluded_assets.includes(t) ? 'var(--red)' : 'var(--border)',
                    background: form.excluded_assets.includes(t) ? 'var(--red-pale)' : 'var(--surface)',
                    color: form.excluded_assets.includes(t) ? 'var(--red)' : 'var(--text)',
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="error-msg">⚠ {error}</div>}

        <div style={{ marginTop: '28px' }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '⟳ Optimizing Portfolio…' : '◆ Generate Optimal Portfolio'}
          </button>
        </div>
      </form>
    </div>
  )
}
