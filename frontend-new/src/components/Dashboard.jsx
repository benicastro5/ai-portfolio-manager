import { useState } from 'react'
import AllocationChart from './AllocationChart'
import EfficientFrontierChart from './EfficientFrontierChart'
import ETFRankingTable from './ETFRankingTable'
import RebalancingPanel from './RebalancingPanel'
import ExplanationPanel from './ExplanationPanel'
import CorrelationMatrix from './CorrelationMatrix'
import PortfolioComparison from './PortfolioComparison'
import GeographicDashboard from './GeographicDashboard'

const fmtPct = (v) => `${v > 0 ? '+' : ''}${v?.toFixed(1)}%`
const fmtDollar = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0 })}`

export default function Dashboard({ data }) {
  const [tab, setTab] = useState('portfolio')
  const { portfolio, target_vol_portfolio, ranked_etfs, efficient_frontier, correlation_matrix, explanation, userProfile, data_source, data_as_of, dominant_regime, geo_exposure } = data

  const regimeBadge = {
    bull:    { bg: '#f0fdf4', color: '#16a34a', label: '▲ Bull Market Regime' },
    neutral: { bg: '#f8f9fc', color: '#64748b', label: '◆ Neutral Regime' },
    bear:    { bg: '#fef2f2', color: '#dc2626', label: '▼ Bear Market Regime' },
  }
  const rb = regimeBadge[dominant_regime] || regimeBadge.neutral

  const metrics = [
    { label: 'Expected Return', value: `${portfolio.portfolio_return?.toFixed(1)}%`, sub: 'Annual', color: 'var(--green)' },
    { label: 'Portfolio Volatility', value: `${portfolio.portfolio_volatility?.toFixed(1)}%`, sub: 'Annual', color: 'var(--gold)' },
    { label: 'Sharpe Ratio', value: portfolio.sharpe_ratio?.toFixed(2), sub: 'Risk-Adjusted', color: 'var(--accent)' },
    { label: 'Max Drawdown Est.', value: `${portfolio.max_drawdown_estimate?.toFixed(1)}%`, sub: '95th pctile', color: 'var(--red)' },
    { label: 'Diversification', value: `${portfolio.diversification_ratio?.toFixed(2)}x`, sub: 'Ratio', color: 'var(--accent-light)' },
  ]

  const tabs = [
    { id: 'portfolio', label: '◆ Portfolio' },
    { id: 'compare', label: '⇄ Compare' },
    { id: 'geography', label: '🌍 Geography' },
    { id: 'ranking', label: '↑ ETF Ranking' },
    { id: 'frontier', label: '~ Efficient Frontier' },
    { id: 'rebalance', label: '⟳ Rebalancing' },
    { id: 'explain', label: '◉ AI Explanation' },
  ]

  return (
    <div className="dashboard">
      {/* Summary header */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-.3px' }}>
              Portfolio Recommendation
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {fmtDollar(userProfile.investment_amount)} · {userProfile.goal} · {userProfile.horizon}yr horizon · {userProfile.risk_tolerance}% vol target
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {portfolio.num_assets} assets · MPT Optimized
            </span>
            {data_source && (
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                background: data_source.startsWith('live') ? 'var(--green-pale)' : 'var(--gold-pale)',
                color: data_source.startsWith('live') ? 'var(--green)' : 'var(--gold)',
              }}>
                ● {data_source.startsWith('live') ? 'Live Market Data' : 'Partial Live Data'}
                {data_as_of && ` · ${data_as_of}`}
              </span>
            )}
            {dominant_regime && (
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: rb.bg, color: rb.color }}>
                {rb.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="dashboard-metrics">
        {metrics.map(m => (
          <div className="metric-tile" key={m.label}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-value" style={{ color: m.color }}>{m.value}</div>
            <div className="metric-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Tab: Portfolio */}
      {tab === 'portfolio' && (
        <div className="dashboard-grid">
          {/* Allocation breakdown */}
          <div className="card">
            <div className="card-title">Dollar Allocation</div>
            {portfolio.allocations.map(a => (
              <div className="alloc-row" key={a.ticker}>
                <span className="alloc-ticker">{a.ticker}</span>
                <span className="alloc-name">{a.name}</span>
                <div className="alloc-bar-track">
                  <div className="alloc-bar-fill" style={{ width: `${a.weight}%` }} />
                </div>
                <span className="alloc-pct">{a.weight?.toFixed(1)}%</span>
                <span className="alloc-dollar">{fmtDollar(a.dollar_amount)}</span>
              </div>
            ))}
            {userProfile.monthly_contribution > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
                Monthly contributions of {fmtDollar(userProfile.monthly_contribution)} allocated proportionally.
              </p>
            )}
          </div>

          {/* Pie chart */}
          <div className="card">
            <div className="card-title">Allocation by Weight</div>
            <AllocationChart allocations={portfolio.allocations} />
          </div>

          {/* Risk contributions */}
          <div className="card span-full">
            <div className="card-title">Holdings Detail</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th><th>Name</th><th>Asset Class</th>
                  <th>Weight</th><th>Dollar Amt</th>
                  <th>Fcst Return</th><th>Fcst Vol</th><th>Fcst Sharpe</th>
                  <th>Regime</th><th>Vol Regime</th><th>Risk Contrib.</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.allocations.map(a => (
                  <tr key={a.ticker}>
                    <td><strong style={{ color: 'var(--accent)' }}>{a.ticker}</strong></td>
                    <td>{a.name}</td>
                    <td><span className="tag tag-blue">{a.asset_class}</span></td>
                    <td>{a.weight?.toFixed(1)}%</td>
                    <td>{fmtDollar(a.dollar_amount)}</td>
                    <td style={{ color: a.expected_return > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {fmtPct(a.expected_return)}
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>hist: {fmtPct(a.historical_return)}</div>
                    </td>
                    <td>{a.volatility?.toFixed(1)}%</td>
                    <td>{a.sharpe?.toFixed(2)}</td>
                    <td>
                      {a.regime && (
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
                          background: a.regime === 'bull' ? '#f0fdf4' : a.regime === 'bear' ? '#fef2f2' : '#f8f9fc',
                          color: a.regime === 'bull' ? '#16a34a' : a.regime === 'bear' ? '#dc2626' : '#64748b',
                        }}>
                          {a.regime === 'bull' ? '▲' : a.regime === 'bear' ? '▼' : '◆'} {a.regime}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: a.vol_regime === 'elevated' ? '#dc2626' : a.vol_regime === 'compressed' ? '#16a34a' : '#64748b' }}>
                      {a.vol_regime || 'normal'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
                          <div style={{ width: `${a.risk_contribution}%`, height: '100%', background: 'var(--red)', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '12px', minWidth: '36px' }}>{a.risk_contribution?.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Correlation matrix */}
          <div className="card span-full">
            <div className="card-title">Correlation Matrix</div>
            <CorrelationMatrix data={correlation_matrix} />
          </div>
        </div>
      )}

      {/* Tab: Compare */}
      {tab === 'compare' && target_vol_portfolio && (
        <div className="card">
          <div className="card-title">Optimal Portfolio vs Target Volatility Portfolio</div>
          <PortfolioComparison
            optimal={portfolio}
            targetVol={target_vol_portfolio}
            targetVolPct={userProfile.risk_tolerance}
            investmentAmount={userProfile.investment_amount}
          />
        </div>
      )}

      {/* Tab: Geography */}
      {tab === 'geography' && (
        <div className="card">
          <div className="card-title">Geographic Exposure</div>
          <GeographicDashboard geoExposure={geo_exposure} />
        </div>
      )}

      {/* Tab: ETF Ranking */}
      {tab === 'ranking' && (
        <div className="card">
          <div className="card-title">ETF Universe Ranking — AI Scoring Engine</div>
          <ETFRankingTable etfs={ranked_etfs} />
        </div>
      )}

      {/* Tab: Efficient Frontier */}
      {tab === 'frontier' && (
        <div className="card">
          <div className="card-title">Efficient Frontier — Risk/Return Tradeoff</div>
          <EfficientFrontierChart
            frontier={efficient_frontier}
            portfolio={portfolio}
            userRisk={userProfile.risk_tolerance}
          />
        </div>
      )}

      {/* Tab: Rebalancing */}
      {tab === 'rebalance' && (
        <RebalancingPanel
          targetAllocations={portfolio.allocations}
          portfolioValue={userProfile.investment_amount}
          horizon={userProfile.horizon}
          vol={userProfile.risk_tolerance}
        />
      )}

      {/* Tab: Explanation */}
      {tab === 'explain' && (
        <ExplanationPanel explanation={explanation} />
      )}
    </div>
  )
}
