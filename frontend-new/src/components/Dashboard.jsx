import { useState, useRef } from 'react'
import AllocationChart from './AllocationChart'
import EfficientFrontierChart from './EfficientFrontierChart'
import ETFRankingTable from './ETFRankingTable'
import RebalancingPanel from './RebalancingPanel'
import ExplanationPanel from './ExplanationPanel'
import CorrelationMatrix from './CorrelationMatrix'
import PortfolioComparison from './PortfolioComparison'
import GeographicDashboard from './GeographicDashboard'
import MonteCarloChart from './MonteCarloChart'
import StressTestPanel from './StressTestPanel'
import HealthScore from './HealthScore'
import NewsFeed from './NewsFeed'
import EconomicCalendar from './EconomicCalendar'
import BenchmarkComparison from './BenchmarkComparison'
import { savePortfolio, loadSaved, deleteSaved } from '../utils/savedPortfolios'

const fmtPct = (v) => `${v > 0 ? '+' : ''}${v?.toFixed(1)}%`
const fmtDollar = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0 })}`

export default function Dashboard({ data, onLoadPortfolio }) {
  const [tab, setTab] = useState('portfolio')
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(() => loadSaved())
  const [showSavePanel, setShowSavePanel] = useState(false)
  const printRef = useRef()

  const {
    portfolio, target_vol_portfolio, ranked_etfs, efficient_frontier,
    correlation_matrix, explanation, userProfile, data_source, data_as_of,
    dominant_regime, geo_exposure, stress_tests, health_score, benchmarks,
  } = data

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
    { label: 'Health Score', value: health_score?.overall ?? '—', sub: health_score?.overall_label ?? '', color: health_score?.overall_color ?? 'var(--accent)' },
  ]

  const tabs = [
    { id: 'portfolio',    label: '◆ Portfolio' },
    { id: 'health',       label: '◉ Health Score' },
    { id: 'monte',        label: '~ Monte Carlo' },
    { id: 'stress',       label: '⚡ Stress Tests' },
    { id: 'benchmark',    label: '⊞ Benchmark' },
    { id: 'compare',      label: '⇄ Compare' },
    { id: 'geography',    label: '🌍 Geography' },
    { id: 'news',         label: '◎ News Feed' },
    { id: 'calendar',     label: '◇ Macro Calendar' },
    { id: 'ranking',      label: '↑ ETF Ranking' },
    { id: 'frontier',     label: '~ Efficient Frontier' },
    { id: 'rebalance',    label: '⟳ Rebalancing' },
    { id: 'explain',      label: '◉ AI Explanation' },
  ]

  const handleSave = () => {
    if (!saveName.trim()) return
    const entry = savePortfolio(saveName.trim(), data)
    setSaved(loadSaved())
    setSaveName('')
    setShowSavePanel(false)
    alert(`Portfolio "${entry.name}" saved!`)
  }

  const handleDelete = (id) => {
    deleteSaved(id)
    setSaved(loadSaved())
  }

  const handlePrint = () => {
    window.print()
  }

  const portfolioTickers = portfolio.allocations?.map(a => a.ticker) || []

  return (
    <div className="dashboard" ref={printRef}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
            {/* Save + Print buttons */}
            <button onClick={() => setShowSavePanel(v => !v)}
              style={{ padding: '5px 12px', borderRadius: '8px', border: '1.5px solid var(--border)',
                background: 'var(--surface)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              ◈ Save
            </button>
            <button onClick={handlePrint}
              style={{ padding: '5px 12px', borderRadius: '8px', border: '1.5px solid var(--border)',
                background: 'var(--surface)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              ⊡ Print / PDF
            </button>
          </div>
        </div>

        {/* Save panel */}
        {showSavePanel && (
          <div style={{ marginTop: '12px', padding: '14px 16px', background: 'var(--surface2)',
            borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px' }}>Save This Portfolio</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input value={saveName} onChange={e => setSaveName(e.target.value)}
                placeholder='e.g. "Aggressive Growth 2026"'
                style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px',
                  border: '1.5px solid var(--border)', fontSize: '13px' }} />
              <button onClick={handleSave}
                style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--accent)',
                  color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
                Save
              </button>
            </div>
            {/* Saved portfolios list */}
            {saved.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Saved Portfolios
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {saved.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 12px', borderRadius: '8px', background: 'var(--surface)',
                      border: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(s.savedAt).toLocaleDateString()} · {s.data.userProfile?.goal} · {fmtDollar(s.data.userProfile?.investment_amount)}
                        </div>
                      </div>
                      {onLoadPortfolio && (
                        <button onClick={() => { onLoadPortfolio(s.data); setShowSavePanel(false) }}
                          style={{ padding: '4px 10px', borderRadius: '6px', border: '1.5px solid var(--accent)',
                            color: 'var(--accent)', background: 'transparent', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          Load
                        </button>
                      )}
                      <button onClick={() => handleDelete(s.id)}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: '1.5px solid var(--red)',
                          color: 'var(--red)', background: 'transparent', fontSize: '12px', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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

          <div className="card">
            <div className="card-title">Allocation by Weight</div>
            <AllocationChart allocations={portfolio.allocations} />
          </div>

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

          <div className="card span-full">
            <div className="card-title">Correlation Matrix</div>
            <CorrelationMatrix data={correlation_matrix} />
          </div>
        </div>
      )}

      {/* Tab: Health Score */}
      {tab === 'health' && (
        <div className="card">
          <div className="card-title">Portfolio Health Score</div>
          <HealthScore healthScore={health_score} />
        </div>
      )}

      {/* Tab: Monte Carlo */}
      {tab === 'monte' && (
        <div className="card">
          <div className="card-title">Monte Carlo Simulation — Future Outcome Scenarios</div>
          <MonteCarloChart portfolio={portfolio} userProfile={userProfile} />
        </div>
      )}

      {/* Tab: Stress Tests */}
      {tab === 'stress' && (
        <div className="card">
          <div className="card-title">Historical Crisis Stress Testing</div>
          <StressTestPanel stressTests={stress_tests} investmentAmount={userProfile.investment_amount} />
        </div>
      )}

      {/* Tab: Benchmark */}
      {tab === 'benchmark' && (
        <div className="card">
          <div className="card-title">Benchmark Comparison — SPY &amp; 60/40</div>
          <BenchmarkComparison portfolio={portfolio} benchmarks={benchmarks} />
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

      {/* Tab: News Feed */}
      {tab === 'news' && (
        <div className="card">
          <div className="card-title">Portfolio News Feed</div>
          <NewsFeed tickers={portfolioTickers} />
        </div>
      )}

      {/* Tab: Economic Calendar */}
      {tab === 'calendar' && (
        <div className="card">
          <div className="card-title">Macro Economic Calendar</div>
          <EconomicCalendar portfolioTickers={portfolioTickers} />
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
          targetVolAllocations={target_vol_portfolio?.allocations}
          portfolioValue={userProfile.investment_amount}
          horizon={userProfile.horizon}
          vol={userProfile.risk_tolerance}
        />
      )}

      {/* Tab: Explanation */}
      {tab === 'explain' && (
        <ExplanationPanel explanation={explanation} />
      )}

      {/* Print stylesheet override */}
      <style>{`
        @media print {
          .tabs, button { display: none !important; }
          .dashboard { padding: 0 !important; }
          .card { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
