import { useState } from 'react'

const REGIONS = [
  { key: 'global',           label: '🌍 Global',                recommended: true },
  { key: 'us',               label: '🇺🇸 United States' },
  { key: 'canada',           label: '🇨🇦 Canada' },
  { key: 'europe',           label: '🇪🇺 Europe' },
  { key: 'uk',               label: '🇬🇧 United Kingdom' },
  { key: 'japan',            label: '🇯🇵 Japan' },
  { key: 'china',            label: '🇨🇳 China' },
  { key: 'india',            label: '🇮🇳 India' },
  { key: 'emerging_markets', label: '📈 Emerging Markets' },
  { key: 'latin_america',    label: '🌎 Latin America' },
  { key: 'africa',           label: '🌍 Africa' },
  { key: 'southeast_asia',   label: '🌏 Southeast Asia' },
  { key: 'australia_nz',     label: '🇦🇺 Australia & NZ' },
]

const EXCLUDE_OPTIONS = [
  { key: 'china',        label: '🇨🇳 China' },
  { key: 'russia',       label: '🇷🇺 Russia' },
  { key: 'iran',         label: '🇮🇷 Iran' },
  { key: 'north_korea',  label: '🇰🇵 North Korea' },
  { key: 'venezuela',    label: '🇻🇪 Venezuela' },
]

function chip(active, onClick, label, color = 'var(--accent)') {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '7px 14px', borderRadius: '20px', border: `1.5px solid`,
      fontSize: '13px', fontWeight: active ? 700 : 500, cursor: 'pointer',
      borderColor: active ? color : 'var(--border)',
      background: active ? (color === 'var(--accent)' ? 'var(--accent-pale)' : '#fef2f2') : 'white',
      color: active ? color : 'var(--text-muted)',
      transition: 'all .15s',
    }}>{label}</button>
  )
}

export default function GeographySelector({ value, onChange }) {
  const [expandMin, setExpandMin] = useState(null) // region key with min/max open

  const { regions = [], excluded = [], geoMin = {}, geoMax = {} } = value

  const toggleRegion = (key) => {
    const next = regions.includes(key)
      ? regions.filter(r => r !== key)
      : [...regions, key]
    onChange({ ...value, regions: next })
  }

  const toggleExclude = (key) => {
    const next = excluded.includes(key)
      ? excluded.filter(e => e !== key)
      : [...excluded, key]
    onChange({ ...value, excluded: next })
  }

  const setMin = (key, val) => onChange({ ...value, geoMin: { ...geoMin, [key]: val === '' ? undefined : Number(val) } })
  const setMax = (key, val) => onChange({ ...value, geoMax: { ...geoMax, [key]: val === '' ? undefined : Number(val) } })

  const anySelected = regions.length > 0

  return (
    <div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
        Select the regions where you want exposure. Leave empty for no geographic restriction.
        The optimizer will only pick ETFs from your chosen regions.
      </div>

      {/* Region chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        {REGIONS.map(r => (
          <div key={r.key}>
            {chip(regions.includes(r.key), () => toggleRegion(r.key),
              r.recommended && !anySelected ? `${r.label} (recommended)` : r.label)}
          </div>
        ))}
      </div>

      {/* Min/Max allocation for selected regions */}
      {regions.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Allocation Constraints (optional)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {regions.map(key => {
              const label = REGIONS.find(r => r.key === key)?.label || key
              return (
                <div key={key} style={{ background: 'var(--surface2)', borderRadius: '10px',
                  padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>{label}</div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label style={{ fontSize: '10px' }}>Min %</label>
                      <input type="number" min="0" max="100" placeholder="0"
                        value={geoMin[key] ?? ''}
                        onChange={e => setMin(key, e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '13px' }} />
                    </div>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label style={{ fontSize: '10px' }}>Max %</label>
                      <input type="number" min="0" max="100" placeholder="100"
                        value={geoMax[key] ?? ''}
                        onChange={e => setMax(key, e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '13px' }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Country exclusions */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Exclude Countries
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {EXCLUDE_OPTIONS.map(e => (
            chip(excluded.includes(e.key), () => toggleExclude(e.key), e.label, 'var(--red)')
          ))}
        </div>
      </div>
    </div>
  )
}
