export const BASE = import.meta.env.VITE_API_URL || 'https://ai-portfolio-manager-vge2.onrender.com'

export async function generatePortfolio(profile) {
  const res = await fetch(`${BASE}/portfolio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Server error ${res.status}`)
  }
  return res.json()
}

export async function alpacaConnect(payload) {
  const res = await fetch(`${BASE}/broker/alpaca/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `Error ${res.status}`) }
  return res.json()
}

export async function alpacaPositions(payload) {
  const res = await fetch(`${BASE}/broker/alpaca/positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `Error ${res.status}`) }
  return res.json()
}

export async function alpacaExecute(payload) {
  const res = await fetch(`${BASE}/broker/alpaca/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `Error ${res.status}`) }
  return res.json()
}

export async function rebalancePortfolio(payload) {
  const res = await fetch(`${BASE}/portfolio/rebalance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Server error ${res.status}`)
  }
  return res.json()
}
