const KEY = 'ai_portfolio_saves'

export function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function savePortfolio(name, data) {
  const saves = loadSaved()
  const entry = {
    id: Date.now(),
    name,
    savedAt: new Date().toISOString(),
    data,
  }
  saves.unshift(entry)
  localStorage.setItem(KEY, JSON.stringify(saves.slice(0, 20))) // keep last 20
  return entry
}

export function deleteSaved(id) {
  const saves = loadSaved().filter(s => s.id !== id)
  localStorage.setItem(KEY, JSON.stringify(saves))
}
