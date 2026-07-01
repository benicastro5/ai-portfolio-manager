import { useState } from 'react'
import { alpacaConnect, alpacaPositions as fetchPositions, alpacaExecute } from '../api'

const fmtDollar = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct    = (v) => `${v >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`

export default function BrokerPanel({
  rebalanceTrades, alpacaCreds, alpacaAccount, alpacaPositions,
  onConnect, onDisconnect, onExecuteDone, onGoToRebalance,
}) {
  const [key, setKey]       = useState('')
  const [secret, setSecret] = useState('')
  const [paper, setPaper]   = useState(true)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [execResult, setExecResult] = useState(null)

  const handleConnect = async () => {
    if (!key || !secret) return
    setLoading(true); setError(null)
    try {
      const creds = { api_key: key, api_secret: secret, paper }
      const acc = await alpacaConnect(creds)
      const pos = await fetchPositions(creds)
      onConnect(creds, acc, pos.positions)
      setKey(''); setSecret('')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleExecute = async () => {
    setExecuting(true); setError(null)
    try {
      const res = await alpacaExecute({ ...alpacaCreds, trades: actionTrades })
      setExecResult(res)
      setShowConfirm(false)
      const pos = await fetchPositions(alpacaCreds)
      onExecuteDone(pos.positions)
    } catch (e) { setError(e.message) }
    finally { setExecuting(false) }
  }

  const actionTrades = (rebalanceTrades || []).filter(t => t.action !== 'Hold' && Math.abs(t.dollar_amount) >= 1)

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!alpacaAccount) return (
    <div className="card">
      <div className="card-title">Connect Alpaca Account</div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px' }}>
        Connect once — your live positions will be auto-imported into the Rebalancing tab and trades
        will be calculated for you to approve.
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
          Paper trading (uncheck for live)
        </label>
        <button onClick={handleConnect} disabled={loading || !key || !secret}
          style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: 'var(--accent)',
            color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
            opacity: (!key || !secret) ? 0.5 : 1 }}>
          {loading ? '⟳ Connecting…' : '◆ Connect Account'}
        </button>
      </div>
      {error && <div className="error-msg" style={{ marginTop: '12px' }}>⚠ {error}</div>}
    </div>
  )

  // ── Connected ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Account summary */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          Alpaca Account
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
            background: alpacaAccount.paper ? 'var(--gold-pale)' : 'var(--green-pale)',
            color: alpacaAccount.paper ? 'var(--gold)' : 'var(--green)' }}>
            ● {alpacaAccount.paper ? 'Paper Trading' : 'Live Trading'}
          </span>
          <button onClick={onDisconnect}
            style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '6px',
              border: '1.5px solid var(--border)', background: 'transparent',
              fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>
            Disconnect
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '12px' }}>
          <div className="metric-tile">
            <div className="metric-label">Portfolio Value</div>
            <div className="metric-value">{fmtDollar(alpacaAccount.portfolio_value)}</div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">Cash</div>
            <div className="metric-value" style={{ color: 'var(--green)' }}>{fmtDollar(alpacaAccount.cash)}</div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">Buying Power</div>
            <div className="metric-value" style={{ color: 'var(--accent)' }}>{fmtDollar(alpacaAccount.buying_power)}</div>
          </div>
        </div>
      </div>

      {/* Live positions */}
      {alpacaPositions && alpacaPositions.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-title">Current Positions ({alpacaPositions.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th><th>Qty</th><th>Avg Cost</th><th>Price</th>
                  <th>Market Value</th><th>Unrealized P&L</th><th>Return</th>
                </tr>
              </thead>
              <tbody>
                {alpacaPositions.map(p => (
                  <tr key={p.ticker}>
                    <td><strong style={{ color: 'var(--accent)' }}>{p.ticker}</strong></td>
                    <td>{p.qty}</td>
                    <td>{fmtDollar(p.avg_entry_price)}</td>
                    <td>{fmtDollar(p.current_price)}</td>
                    <td>{fmtDollar(p.market_value)}</td>
                    <td style={{ fontWeight: 600, color: p.unrealized_pl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {p.unrealized_pl >= 0 ? '+' : ''}{fmtDollar(p.unrealized_pl)}
                    </td>
                    <td style={{ fontWeight: 600, color: p.unrealized_plpc >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtPct(p.unrealized_plpc)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approve & Execute */}
      <div className="card">
        <div className="card-title">Approve Rebalancing Trades</div>

        {actionTrades.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {rebalanceTrades.length === 0
                ? 'No trades calculated yet. Go to the Rebalancing tab to calculate trades first.'
                : '✓ Portfolio is balanced — no trades needed above the drift threshold.'}
            </p>
            {rebalanceTrades.length === 0 && (
              <button onClick={onGoToRebalance}
                style={{ padding: '8px 20px', borderRadius: '8px', border: '1.5px solid var(--accent)',
                  color: 'var(--accent)', background: 'transparent', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                ⟳ Go to Rebalancing Tab
              </button>
            )}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Review these <strong>{actionTrades.length} trades</strong> and approve to submit as fractional
              market orders on your{' '}
              <strong>{alpacaAccount.paper ? 'paper account' : 'live account'}</strong>.
              {alpacaAccount.paper && (
                <span style={{ color: 'var(--gold)', fontWeight: 600 }}> No real money at risk.</span>
              )}
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
                style={{ padding: '11px 28px', borderRadius: '8px', border: 'none',
                  background: alpacaAccount.paper ? 'var(--accent)' : '#dc2626',
                  color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                ◆ Approve & Execute{alpacaAccount.paper ? ' (Paper)' : ' (LIVE)'}
              </button>
            ) : (
              <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--surface2)',
                border: `1.5px solid ${alpacaAccount.paper ? 'var(--accent)' : '#dc2626'}` }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                  {alpacaAccount.paper
                    ? `Submit ${actionTrades.length} paper orders?`
                    : `⚠ Submit ${actionTrades.length} LIVE orders with real money?`}
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Fractional market orders execute at the next available price. Cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleExecute} disabled={executing}
                    style={{ padding: '9px 22px', borderRadius: '8px', border: 'none',
                      background: alpacaAccount.paper ? 'var(--accent)' : '#dc2626',
                      color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                    {executing ? '⟳ Submitting…' : 'Yes, Execute'}
                  </button>
                  <button onClick={() => setShowConfirm(false)}
                    style={{ padding: '9px 18px', borderRadius: '8px', border: '1.5px solid var(--border)',
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
                    ? `✓ All ${execResult.submitted} orders submitted`
                    : `⚠ ${execResult.submitted} submitted · ${execResult.errors} failed`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {execResult.results.map(r => (
                    <div key={r.ticker} style={{ fontSize: '12px', display: 'flex', gap: '10px' }}>
                      <strong style={{ color: 'var(--accent)', minWidth: '60px' }}>{r.ticker}</strong>
                      <span style={{ color: r.status === 'submitted' ? 'var(--green)' : r.status === 'error' ? 'var(--red)' : 'var(--text-muted)' }}>
                        {r.status === 'submitted'
                          ? `✓ ${r.side} $${Number(r.notional).toFixed(2)} — order submitted`
                          : r.status === 'error' ? `✕ ${r.reason}` : 'Skipped'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
