export default function ExplanationPanel({ explanation }) {
  if (!explanation) return null

  return (
    <div>
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">Portfolio Summary</div>
        <div className="explanation-summary">{explanation.summary}</div>

        <div className="card-title" style={{ marginTop: '20px' }}>Risk Analysis</div>
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', fontSize: '14px', lineHeight: 1.7 }}>
          {explanation.risk_explanation}
        </div>

        {explanation.rebalancing_guidance && (
          <>
            <div className="card-title" style={{ marginTop: '20px' }}>Rebalancing Guidance</div>
            <div style={{ background: 'var(--green-pale)', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
              {explanation.rebalancing_guidance}
            </div>
          </>
        )}

        {explanation.exclusion_note && (
          <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {explanation.exclusion_note}
          </p>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title">Why Each Asset Was Selected</div>
          <ul className="asset-reasons">
            {explanation.asset_reasons?.map(r => (
              <li className="reason-item" key={r.ticker}>
                <div className="reason-ticker">{r.ticker}</div>
                <div>{r.reason}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <div className="card-title">Risks to Monitor</div>
          <ul className="risk-list">
            {explanation.risks_to_watch?.map((risk, i) => (
              <li className="risk-item" key={i}>⚠ {risk}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
