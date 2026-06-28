import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const COLORS = [
  '#1e40af', '#3b82f6', '#60a5fa', '#93c5fd',
  '#16a34a', '#22c55e', '#86efac',
  '#d97706', '#f59e0b', '#fcd34d',
  '#dc2626', '#f87171',
  '#7c3aed', '#a78bfa',
  '#0891b2', '#67e8f9',
]

const fmt = (v) => `${v?.toFixed(1)}%`

export default function AllocationChart({ allocations }) {
  const data = allocations.map(a => ({ name: a.ticker, value: a.weight, fullName: a.name }))

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
        <div style={{ fontWeight: 700, fontSize: '13px' }}>{d.name}</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>{d.fullName}</div>
        <div style={{ fontWeight: 700, color: '#1e40af', marginTop: '4px' }}>{fmt(d.value)}</div>
      </div>
    )
  }

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value, name }) => {
    if (value < 5) return null
    const RADIAN = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.6
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {name}
      </text>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={140}
          dataKey="value" labelLine={false} label={<CustomLabel />}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={(v, e) => `${v} (${fmt(e.payload.value)})`} wrapperStyle={{ fontSize: '12px' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
