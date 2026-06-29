// Economic calendar events: static schedule for major macro releases + Fed meetings
// Dates are approximate based on known 2026 schedules

const EVENTS = [
  // FOMC meetings 2026 (announcement dates)
  { date: '2026-07-29', event: 'FOMC Rate Decision', category: 'Fed', impact: 'high', affected: ['TLT', 'SHY', 'BND', 'LQD', 'HYG', 'GLD'] },
  { date: '2026-09-16', event: 'FOMC Rate Decision', category: 'Fed', impact: 'high', affected: ['TLT', 'SHY', 'BND', 'LQD', 'HYG', 'GLD'] },
  { date: '2026-10-28', event: 'FOMC Rate Decision', category: 'Fed', impact: 'high', affected: ['TLT', 'SHY', 'BND', 'LQD', 'HYG', 'GLD'] },
  { date: '2026-12-09', event: 'FOMC Rate Decision', category: 'Fed', impact: 'high', affected: ['TLT', 'SHY', 'BND', 'LQD', 'HYG', 'GLD'] },
  // CPI reports (monthly, typically 2nd–3rd Wednesday)
  { date: '2026-07-09', event: 'CPI Inflation Report (Jun)', category: 'Inflation', impact: 'high', affected: ['TIP', 'TLT', 'GLD', 'SPY', 'QQQ'] },
  { date: '2026-08-12', event: 'CPI Inflation Report (Jul)', category: 'Inflation', impact: 'high', affected: ['TIP', 'TLT', 'GLD', 'SPY', 'QQQ'] },
  { date: '2026-09-09', event: 'CPI Inflation Report (Aug)', category: 'Inflation', impact: 'high', affected: ['TIP', 'TLT', 'GLD', 'SPY', 'QQQ'] },
  { date: '2026-10-14', event: 'CPI Inflation Report (Sep)', category: 'Inflation', impact: 'high', affected: ['TIP', 'TLT', 'GLD', 'SPY', 'QQQ'] },
  // NFP (Non-Farm Payrolls) — first Friday of each month
  { date: '2026-07-03', event: 'Non-Farm Payrolls (Jun)', category: 'Jobs', impact: 'high', affected: ['SPY', 'IWM', 'TLT', 'BND'] },
  { date: '2026-08-07', event: 'Non-Farm Payrolls (Jul)', category: 'Jobs', impact: 'high', affected: ['SPY', 'IWM', 'TLT', 'BND'] },
  { date: '2026-09-04', event: 'Non-Farm Payrolls (Aug)', category: 'Jobs', impact: 'high', affected: ['SPY', 'IWM', 'TLT', 'BND'] },
  { date: '2026-10-02', event: 'Non-Farm Payrolls (Sep)', category: 'Jobs', impact: 'high', affected: ['SPY', 'IWM', 'TLT', 'BND'] },
  // GDP releases (quarterly advance estimate)
  { date: '2026-07-30', event: 'Q2 GDP Advance Estimate', category: 'Growth', impact: 'medium', affected: ['SPY', 'QQQ', 'EFA', 'TLT'] },
  { date: '2026-10-29', event: 'Q3 GDP Advance Estimate', category: 'Growth', impact: 'medium', affected: ['SPY', 'QQQ', 'EFA', 'TLT'] },
  // PCE (Fed's preferred inflation gauge) — end of each month
  { date: '2026-07-31', event: 'PCE Price Index (Jun)', category: 'Inflation', impact: 'medium', affected: ['TIP', 'GLD', 'SPY', 'TLT'] },
  { date: '2026-08-28', event: 'PCE Price Index (Jul)', category: 'Inflation', impact: 'medium', affected: ['TIP', 'GLD', 'SPY', 'TLT'] },
  { date: '2026-09-25', event: 'PCE Price Index (Aug)', category: 'Inflation', impact: 'medium', affected: ['TIP', 'GLD', 'SPY', 'TLT'] },
  // PPI
  { date: '2026-07-14', event: 'PPI (Jun)', category: 'Inflation', impact: 'low', affected: ['XLB', 'XLE', 'DBC'] },
  { date: '2026-08-13', event: 'PPI (Jul)', category: 'Inflation', impact: 'low', affected: ['XLB', 'XLE', 'DBC'] },
  // Treasury auctions (major impact on bond ETFs)
  { date: '2026-07-22', event: '10-Year Treasury Auction', category: 'Bonds', impact: 'medium', affected: ['TLT', 'BND', 'LQD', 'SHY'] },
  { date: '2026-08-12', event: '10-Year Treasury Auction', category: 'Bonds', impact: 'medium', affected: ['TLT', 'BND', 'LQD', 'SHY'] },
  // Earnings seasons (broad market impact)
  { date: '2026-07-14', event: 'Q2 Earnings Season Begins', category: 'Earnings', impact: 'medium', affected: ['SPY', 'QQQ', 'XLK', 'XLF'] },
  { date: '2026-10-13', event: 'Q3 Earnings Season Begins', category: 'Earnings', impact: 'medium', affected: ['SPY', 'QQQ', 'XLK', 'XLF'] },
]

const CAT_COLORS = {
  Fed:       { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  Inflation: { bg: '#fef9c3', color: '#ca8a04', border: '#fde68a' },
  Jobs:      { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  Growth:    { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  Bonds:     { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  Earnings:  { bg: '#fdf2f8', color: '#9d174d', border: '#fbcfe8' },
}
const IMPACT_DOT = { high: '#dc2626', medium: '#d97706', low: '#16a34a' }

const TODAY = '2026-06-29'

export default function EconomicCalendar({ portfolioTickers = [] }) {
  const tSet = new Set(portfolioTickers)
  const upcoming = EVENTS
    .filter(e => e.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 20)

  const formatDate = (d) => {
    const dt = new Date(d + 'T12:00:00Z')
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' })
  }
  const daysUntil = (d) => Math.ceil((new Date(d + 'T12:00:00Z') - new Date(TODAY + 'T12:00:00Z')) / 86400000)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        Upcoming macro events · Events affecting your holdings are highlighted
      </div>
      {upcoming.map((e, i) => {
        const c = CAT_COLORS[e.category] || CAT_COLORS.Growth
        const relevant = e.affected.some(t => tSet.has(t))
        const days = daysUntil(e.date)
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px',
            borderRadius: '10px', background: relevant ? c.bg : 'var(--surface)',
            border: `1.5px solid ${relevant ? c.border : 'var(--border)'}`,
            opacity: days > 90 ? 0.7 : 1,
          }}>
            {/* Date */}
            <div style={{ minWidth: '70px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: days <= 7 ? '#dc2626' : 'var(--text-muted)' }}>
                {formatDate(e.date)}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`}
              </div>
            </div>
            {/* Impact dot */}
            <div style={{ width: '8px', height: '8px', borderRadius: '50%',
              background: IMPACT_DOT[e.impact], flexShrink: 0 }} />
            {/* Event info */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: relevant ? 700 : 500 }}>{e.event}</div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px',
                  background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                  {e.category}
                </span>
                {e.affected.filter(t => tSet.has(t)).map(t => (
                  <span key={t} style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px',
                    background: 'var(--accent-pale)', color: 'var(--accent)' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            {relevant && (
              <div style={{ fontSize: '10px', fontWeight: 700, color: c.color, flexShrink: 0 }}>
                ◆ Your portfolio
              </div>
            )}
          </div>
        )
      })}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
        ● High impact &nbsp; ● Medium impact &nbsp; ● Low impact &nbsp;·&nbsp;
        Dates are approximate based on typical scheduling patterns.
      </div>
    </div>
  )
}
