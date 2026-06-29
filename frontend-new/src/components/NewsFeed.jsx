import { useState, useEffect } from 'react'
import { BASE } from '../api'

const timeAgo = (ts) => {
  if (!ts) return ''
  const secs = Date.now() / 1000 - ts
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86400)}d ago`
}

export default function NewsFeed({ tickers }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!tickers?.length) return
    const top5 = tickers.slice(0, 5).join(',')
    setLoading(true)
    setError(null)
    fetch(`${BASE}/portfolio/news?tickers=${top5}`)
      .then(r => r.json())
      .then(d => { setArticles(d.articles || []); setLoading(false) })
      .catch(() => { setError('Could not load news.'); setLoading(false) })
  }, [tickers?.join(',')])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ height: '80px', borderRadius: '10px', background: 'var(--surface2)',
          animation: 'pulse 1.4s ease-in-out infinite', opacity: 0.7 }} />
      ))}
    </div>
  )

  if (error) return <div style={{ color: 'var(--red)', padding: '16px' }}>{error}</div>
  if (!articles.length) return <div style={{ color: 'var(--text-muted)', padding: '16px' }}>No recent news found for portfolio holdings.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        Latest news for your portfolio holdings · {articles.length} articles
      </div>
      {articles.map((a, i) => (
        <a key={i} href={a.link} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', gap: '14px', padding: '14px 16px', borderRadius: '12px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            textDecoration: 'none', color: 'inherit', transition: 'border-color .15s',
            alignItems: 'flex-start',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
          {a.thumbnail && (
            <img src={a.thumbnail} alt=""
              style={{ width: '80px', height: '54px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
              onError={e => e.currentTarget.style.display = 'none'} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
                background: 'var(--accent-pale)', padding: '2px 8px', borderRadius: '20px' }}>
                {a.ticker}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.publisher}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{timeAgo(a.published)}</span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.5,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {a.title}
            </div>
          </div>
          <div style={{ fontSize: '16px', color: 'var(--text-muted)', flexShrink: 0, alignSelf: 'center' }}>→</div>
        </a>
      ))}
    </div>
  )
}
