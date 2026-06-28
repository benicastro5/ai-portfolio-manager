export default function CorrelationMatrix({ data }) {
  if (!data) return null
  const { tickers, matrix } = data

  const color = (v) => {
    const abs = Math.abs(v)
    if (v === 1) return '#1e40af'
    if (abs >= 0.7) return v > 0 ? '#ef4444' : '#16a34a'
    if (abs >= 0.4) return v > 0 ? '#f97316' : '#22c55e'
    if (abs >= 0.2) return v > 0 ? '#fbbf24' : '#86efac'
    return '#f1f5f9'
  }

  const textColor = (v) => {
    const abs = Math.abs(v)
    if (v === 1 || abs >= 0.4) return 'white'
    return '#0f172a'
  }

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Correlation coefficients between portfolio holdings. Green = negative correlation (diversifying), Red = high positive correlation (concentrated risk).
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: '2px', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', background: 'var(--surface2)', borderRadius: '4px' }}></th>
              {tickers.map(t => (
                <th key={t} style={{ padding: '6px 10px', background: 'var(--surface2)', borderRadius: '4px', fontWeight: 700, color: 'var(--accent)', minWidth: '52px', textAlign: 'center' }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((row, i) => (
              <tr key={row}>
                <td style={{ padding: '6px 10px', background: 'var(--surface2)', borderRadius: '4px', fontWeight: 700, color: 'var(--accent)' }}>{row}</td>
                {matrix[i].map((val, j) => (
                  <td key={j} style={{
                    padding: '6px 10px', borderRadius: '4px', textAlign: 'center', fontWeight: 600,
                    background: color(val), color: textColor(val), minWidth: '52px',
                  }}>
                    {val?.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span>🟦 = 1.0 (same asset)</span>
        <span style={{ color: 'var(--red)' }}>🟥 ≥ 0.7 (high correlation)</span>
        <span style={{ color: 'var(--gold)' }}>🟨 0.2–0.7 (moderate)</span>
        <span style={{ color: 'var(--green)' }}>🟩 negative (diversifying)</span>
      </div>
    </div>
  )
}
