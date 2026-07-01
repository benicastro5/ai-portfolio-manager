import { useState } from 'react'
import { alpacaConnect, alpacaPositions, alpacaExecute } from '../api'

const fmtDollar = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`

export default function BrokerPanel({ rebalanceTrades }) {
  const [key, setKey]       = useState('')
  const [secret, setSecret] = useState('')
  const [paper, setPaper]   = useState(true)
  const [account, setAccount]     = useState(null)
  const [positions, setPositions] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [execResult, setExecResult] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [executing, setExecuting] = useState(false)

  const creds = { api_key: key, api_secret: secret, paper }

  const handleConnect = async () => {
    if (!key || !secret) return
    setLoading(true)
    setError(null)
    try {
      const acc = await alpacaConnect(creds)
      setAccount(acc)
      const pos = await alpacaPositions(creds)
      setPositions(pos.positions)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = () => {
    setAccount(null)
    setPositions(null)
    setKey('')
    setSecret('')
    setExecResult(null)
    setShowConfirm(false)
  }

  const handleExecute = async () => {
    if (!rebalanceTrades?.length) return
    setExecuting(true)
    setError(null)
    try {
      const res = await alpacaExecute({ ...creds, trades: rebalanceTrades })
      setExecResult(res)
      setShowConfirm(false)
      // Refresh positions after execution
      const pos = await alpacaPositions(creds)
      setPositions(pos.positions)
    } catch (e) {
      setError(e.message)
    } finally {
      setExecuting(false)
    }
  }

  const actionTrades = rebalanceTrades?.filter(t => t.action !== 'Hold' && Math.abs(t.dollar_amount) >= 1) || []

  return (
    <div>
      {/* Connection Panel */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">
          Alpaca Broker Connection
          {account && (
            <span style={{
              marginLeft: '12px', fontSize: '11px', fontWeight: 700,
              padding: '3px 10px', borderRadius: '20px',
              background: account.paper ? 'var(--gold-pale)' : 'var(--green-pale)',
              color: account.paper ? 'var(--gold)' : 'var(--green)',
            }}>
              ● {account.paper ? 'Paper Trading' : 'Live Trading'}
            </span>
          )}
        </div>

        {!account ? (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Connect your Alpaca account to import live positions and execute rebalancing trades.
              Your credentials are sent directly to Alpaca — never stored on our servers.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div className="form-group">
                <label>API Key</label>
                <input type="text" value={key} onChange={e => setKey(e.target.value.trim())}
                  placeholder="PKXXXXXXXXXXXXXX" spellCheck={false} />
              </div>
              <div className="form-group">
                <label>API Secret</label>
                <input type="password" value={secret} onChange={e => setSecret(e.target.value.trim())}
                  placeholder="••••••••••••••••" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={paper} onChange={e => setPaper(e.target.checked)} />
                <span>Paper trading (uncheck for live)</span>
              </label>
              <button onClick={handleConnect} disabled={loading || !key || !secret}
                style={{
                  padding: '8px 20px', borderRadius: '8px', border: 'none',
                  background: 'var(--accent)', color: 'white', fontWeight: 700,
                  fontSize: '13px', cursor: 'pointer', opacity: (!key || !secret) ? 0.5 : 1,
                }}>
                {loading ? '⟳ Connecting…' : '◆ Connect Account'}
              </button>
            </div>
            {error && <div className="error-msg" style={{ marginTop: '12px' }}>⚠ {error}</div>}
          </div>
        ) : (
          <div>
            {/* Account summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div className="metric-tile">
                <div className="metric-label">Portfolio Value</div>
                <div className="metric-value">{fmtDollar(account.portfolio_value)}</div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">Cash</div>
                <div className="metric-value" style={{ color: 'var(--green)' }}>{fmtDollar(account.cash)}</div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">Buying Power</div>
                <div className="metric-value" style={{ color: 'var(--accent)' }}>{fmtDollar(account.buying_power)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Account #{account.account_number} · Status: <strong style={{ color: account.status === 'ACTIVE' ? 'var(--green)' : 'var(--gold)' }}>{account.status}</strong>
              </span>
              <button onClick={handleDisconnect}
                style={{ padding: '4px 12px', borderRadius: '6px', border: '1.5px solid var(--border)',
                  background: 'transparent', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live Positions */}
      {positions && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-title">Live Positions ({positions.length})</div>
          {positions.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No open positions in this account.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticker</th><th>Qty</th><th>Avg Cost</th><th>Current Price</th>
                    <th>Market Value</th><th>Unrealized P&L</th><th>Return</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.ticker}>
                      <td><strong style={{ color: 'var(--accent)' }}>{p.ticker}</strong></td>
                      <td>{p.qty}</td>
                      <td>{fmtDollar(p.avg_entry_price)}</td>
                      <td>{fmtDollar(p.current_price)}</td>
                      <td>{fmtDollar(p.market_value)}</td>
                      <td style={{ color: p.unrealized_pl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {p.unrealized_pl >= 0 ? '+' : ''}{fmtDollar(p.unrealized_pl)}
                      </td>
                      <td style={{ color: p.unrealized_plpc >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {fmtPct(p.unrealized_plpc)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Execute Rebalancing */}
      {account && (
        <div className="card">
          <div className="card-title">Execute Rebalancing</div>
          {actionTrades.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              No trades to execute. Run a rebalance in the Rebalancing tab first, then come back here.
            </p>
          ) : (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                The following <strong>{actionTrades.length} trades</strong> will be placed as fractional notional market orders on{' '}
                <strong>{paper ? 'your paper account' : 'your live account'}</strong>.
                {paper && <span style={{ color: 'var(--gold)', fontWeight: 600 }}> Paper trading — no real money at risk.</span>}
              </p>

              <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Ticker</th><th>Action</th><th>Amount</th></tr>
                  </thead>
                  <tbody>
                    {actionTrades.map(t => (
                      <tr key={t.ticker}>
                        <td><strong style={{ color: 'var(--accent)' }}>{t.ticker}</strong></td>
                        <td>
                          <span className={`tag ${t.action === 'Buy' ? 'tag-green' : 'tag-red'}`}>{t.action}</span>
                        </td>
                        <td style={{ fontWeight: 600, color: t.action === 'Buy' ? 'var(--green)' : 'var(--red)' }}>
                          {fmtDollar(Math.abs(t.dollar_amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!showConfirm ? (
                <button onClick={() => setShowConfirm(true)}
                  style={{
                    padding: '10px 24px', borderRadius: '8px', border: 'none',
                    background: paper ? 'var(--accent)' : '#dc2626',
                    color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  }}>
                  ◆ Execute {actionTrades.length} Trades{paper ? ' (Paper)' : ' (LIVE — Real Money)'}
                </button>
              ) : (
                <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: '10px',
                  border: `1.5px solid ${paper ? 'var(--accent)' : '#dc2626'}` }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px' }}>
                    {paper ? '◆ Confirm paper trades' : '⚠ Confirm LIVE trades — real money will be used'}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    {actionTrades.length} fractional market orders will be submitted immediately.
                    Market orders execute at the next available price.
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleExecute} disabled={executing}
                      style={{ padding: '8px 20px', borderRadius: '8px', border: 'none',
                        background: paper ? 'var(--accent)' : '#dc2626',
                        color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                      {executing ? '⟳ Submitting…' : 'Yes, Execute'}
                    </button>
                    <button onClick={() => setShowConfirm(false)}
                      style={{ padding: '8px 20px', borderRadius: '8px', border: '1.5px solid var(--border)',
                        background: 'transparent', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="error-msg" style={{ marginTop: '12px' }}>⚠ {error}</div>}

              {execResult && (
                <div style={{ marginTop: '16px', padding: '14px 16px', borderRadius: '10px',
                  background: execResult.errors === 0 ? 'var(--green-pale)' : 'var(--gold-pale)',
                  border: `1px solid ${execResult.errors === 0 ? 'var(--green)' : 'var(--gold)'}` }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                    {execResult.errors === 0
                      ? `✓ All ${execResult.submitted} orders submitted successfully`
                      : `⚠ ${execResult.submitted} submitted, ${execResult.errors} failed`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {execResult.results.map(r => (
                      <div key={r.ticker} style={{ fontSize: '12px', display: 'flex', gap: '10px' }}>
                        <strong style={{ color: 'var(--accent)', minWidth: '60px' }}>{r.ticker}</strong>
                        <span style={{ color: r.status === 'submitted' ? 'var(--green)' : r.status === 'error' ? 'var(--red)' : 'var(--text-muted)' }}>
                          {r.status === 'submitted' ? `✓ Order submitted (${r.side} $${r.notional?.toFixed(2)})` : r.status === 'error' ? `✕ ${r.reason}` : 'Skipped'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
