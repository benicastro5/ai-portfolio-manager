import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const scoreColor = (s) => s >= 75 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626'
const concColor  = (c) => c === 'Low' ? '#16a34a' : c === 'Moderate' ? '#d97706' : '#dc2626'

export default function GeographicDashboard({ geoExposure }) {
  if (!geoExposure) return null

  const {
    continent_breakdown = [],
    country_breakdown = [],
    n_countries = 0,
    n_continents = 0,
    concentration,
    geo_diversification_score,
    geo_diversification_label,
  } = geoExposure

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Score row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { label: 'Geo Diversity Score', value: geo_diversification_score, sub: geo_diversification_label,
            color: scoreColor(geo_diversification_score), isNum: true },
          { label: 'Countries', value: n_countries, sub: 'represented', color: 'var(--accent)', isNum: true },
          { label: 'Continents', value: n_continents, sub: 'represented', color: 'var(--accent)', isNum: true },
          { label: 'Concentration', value: concentration, sub: 'geographic risk',
            color: concColor(concentration), isNum: false },
        ].map(({ label, value, sub, color, isNum }) => (
          <div key={label} className="metric-tile">
            <div className="metric-label">{label}</div>
            <div className="metric-value" style={{ color }}>{value}{isNum && typeof value === 'number' ? '' : ''}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Continent bar chart */}
      <div className="card">
        <div className="card-title">Exposure by Continent / Region</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={continent_breakdown} layout="vertical"
            margin={{ top: 4, right: 30, left: 20, bottom: 4 }}>
            <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="continent" width={110} tick={{ fontSize: 12 }} />
            <Tooltip formatter={v => `${v.toFixed(1)}%`} />
            <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
              {continent_breakdown.map((entry, i) => (
                <Cell key={i} fill={entry.color || '#3b82f6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Country breakdown */}
      <div className="card">
        <div className="card-title">Exposure by Country</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {country_breakdown.map((c, i) => (
            <div key={c.country} style={{ display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', background: 'var(--surface2)', borderRadius: '8px',
              border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)',
                minWidth: '110px' }}>{c.country}</span>
              <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(c.weight, 100)}%`, height: '100%',
                  background: `hsl(${220 - i * 15}, 70%, 50%)`, borderRadius: '3px' }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '36px',
                textAlign: 'right' }}>{c.weight.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Interpretation */}
      <div style={{ padding: '14px 18px', borderRadius: '10px',
        background: geo_diversification_score >= 50 ? 'var(--green-pale)' : 'var(--gold-pale)',
        border: `1px solid ${geo_diversification_score >= 50 ? '#bbf7d0' : '#fde68a'}`,
        fontSize: '13px', lineHeight: 1.7 }}>
        <strong>Geographic Profile:</strong> This portfolio spans <strong>{n_countries} {n_countries === 1 ? 'country' : 'countries'}</strong> across{' '}
        <strong>{n_continents} {n_continents === 1 ? 'continent' : 'continents'}</strong> with{' '}
        <strong style={{ color: concColor(concentration) }}>{concentration.toLowerCase()} geographic concentration</strong>.{' '}
        {geo_diversification_label === 'Excellent'
          ? 'Excellent global spread — well diversified across regions and countries.'
          : geo_diversification_label === 'Good'
          ? 'Good diversification with meaningful exposure across multiple regions.'
          : geo_diversification_label === 'Moderate'
          ? 'Moderate diversification — consider adding exposure to additional regions.'
          : 'Portfolio is geographically concentrated — consider broadening regional exposure.'}
      </div>
    </div>
  )
}
