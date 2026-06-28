import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Label
} from 'recharts'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px' }}>
      <div style={{ fontSize: '12px', color: '#64748b' }}>Return: <strong>{d.return?.toFixed(1)}%</strong></div>
      <div style={{ fontSize: '12px', color: '#64748b' }}>Volatility: <strong>{d.volatility?.toFixed(1)}%</strong></div>
      <div style={{ fontSize: '12px', color: '#64748b' }}>Sharpe: <strong>{d.sharpe?.toFixed(2)}</strong></div>
    </div>
  )
}

export default function EfficientFrontierChart({ frontier, portfolio, userRisk }) {
  const portPoint = [{
    volatility: portfolio.portfolio_volatility,
    return: portfolio.portfolio_return,
  }]

  return (
    <div>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
        Each point on the efficient frontier represents an optimal portfolio for a given level of risk.
        The blue dot is your recommended portfolio.
      </p>
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number" dataKey="volatility" name="Volatility"
            domain={['auto', 'auto']} tickFormatter={v => `${v.toFixed(0)}%`}
            label={{ value: 'Annual Volatility (%)', position: 'insideBottom', offset: -10, fontSize: 12, fill: '#64748b' }}
          />
          <YAxis
            type="number" dataKey="return" name="Return"
            domain={['auto', 'auto']} tickFormatter={v => `${v.toFixed(0)}%`}
            label={{ value: 'Expected Annual Return (%)', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={userRisk} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Risk Target', fontSize: 11, fill: '#d97706' }} />
          <Scatter name="Efficient Frontier" data={frontier} fill="#93c5fd" opacity={0.7} />
          <Scatter name="Your Portfolio" data={portPoint} fill="#1e40af" r={8} />
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
        <span>● <span style={{ color: '#93c5fd' }}>■</span> Efficient Frontier</span>
        <span>● <span style={{ color: '#1e40af' }}>■</span> Your Portfolio</span>
        <span>— Yellow dashed: Risk tolerance</span>
      </div>
    </div>
  )
}
