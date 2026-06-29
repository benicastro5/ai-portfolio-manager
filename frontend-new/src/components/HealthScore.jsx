const dim_order = ['return_quality', 'risk_management', 'diversification', 'goal_alignment', 'cost_efficiency']

const ScoreBar = ({ score, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <div style={{ flex: 1, height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '4px',
        transition: 'width .5s ease' }} />
    </div>
    <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '36px', color }}>{score}</span>
  </div>
)

const labelColor = (score) =>
  score >= 80 ? '#16a34a' : score >= 65 ? '#22c55e' : score >= 50 ? '#d97706' : score >= 35 ? '#f97316' : '#dc2626'

export default function HealthScore({ healthScore }) {
  if (!healthScore) return null
  const { overall, overall_label, overall_color, dimensions } = healthScore

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Overall score hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="12" />
            <circle cx="60" cy="60" r="50" fill="none" stroke={overall_color} strokeWidth="12"
              strokeDasharray={`${2 * Math.PI * 50 * overall / 100} ${2 * Math.PI * 50 * (1 - overall / 100)}`}
              strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 900, color: overall_color, lineHeight: 1 }}>{overall}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>/100</div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: overall_color }}>{overall_label}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '360px', lineHeight: 1.6 }}>
            {overall >= 80
              ? 'This portfolio is exceptionally well-constructed across all dimensions. Minimal adjustments needed.'
              : overall >= 65
              ? 'Strong overall portfolio. A few dimensions have room for improvement.'
              : overall >= 50
              ? 'Moderate quality. Review the lower-scoring dimensions below for targeted improvements.'
              : 'This portfolio needs meaningful improvements. Focus on the lowest-scoring areas first.'}
          </div>
        </div>
      </div>

      {/* Sub-dimension grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
        {dim_order.map(key => {
          const d = dimensions[key]
          if (!d) return null
          const color = labelColor(d.score)
          return (
            <div key={key} style={{ background: 'var(--surface2)', borderRadius: '12px', padding: '16px',
              border: `1.5px solid ${d.score >= 65 ? 'var(--border)' : '#fde68a'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '20px' }}>{d.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{d.title}</div>
                  <div style={{ fontSize: '11px', color, fontWeight: 700 }}>{d.label}</div>
                </div>
              </div>
              <ScoreBar score={d.score} color={color} />
              {/* Dimension-specific details */}
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {key === 'return_quality' && (
                  <>Sharpe ratio: <strong>{d.sharpe}</strong> · Expected return: <strong>{d.expected_return}%</strong></>
                )}
                {key === 'risk_management' && (
                  <>Vol: <strong>{d.actual_vol}%</strong> vs target <strong>{d.target_vol}%</strong>
                  · Est. drawdown: <strong>{d.drawdown_est}%</strong> / limit <strong>{d.drawdown_limit}%</strong></>
                )}
                {key === 'diversification' && (
                  <>{d.n_assets} holdings · {d.asset_classes?.length} asset classes
                  · Div ratio: <strong>{d.div_ratio}x</strong></>
                )}
                {key === 'goal_alignment' && (
                  <>Equity: <strong>{d.equity_pct}%</strong> · Bonds: <strong>{d.bond_pct}%</strong>
                  · Alts: <strong>{d.alt_pct}%</strong></>
                )}
                {key === 'cost_efficiency' && (
                  <>Weighted expense ratio: <strong>{(d.weighted_expense_ratio).toFixed(3)}%</strong>/yr</>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Improvement tips */}
      {Object.values(dimensions).some(d => d.score < 60) && (
        <div style={{ background: '#fffbeb', borderRadius: '12px', padding: '14px 18px', border: '1px solid #fde68a' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>◆ Improvement Suggestions</div>
          <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: '13px', lineHeight: 1.8, color: 'var(--text)' }}>
            {dimensions.return_quality?.score < 60 && <li>Consider increasing equity exposure or using higher-momentum ETFs to improve the Sharpe ratio.</li>}
            {dimensions.risk_management?.score < 60 && <li>Portfolio volatility is {dimensions.risk_management?.actual_vol > dimensions.risk_management?.target_vol ? 'above' : 'below'} target — adjust allocation or constraints.</li>}
            {dimensions.diversification?.score < 60 && <li>Add more asset classes or geographic ETFs to reduce concentration risk.</li>}
            {dimensions.goal_alignment?.score < 60 && <li>Rebalance the equity/bond split to better match your {Object.values(dimensions.goal_alignment || {}).length ? '' : ''}investment goal.</li>}
            {dimensions.cost_efficiency?.score < 60 && <li>Consider replacing expensive ETFs with lower-cost alternatives (e.g. VGK instead of EWU, BND instead of LQD).</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
