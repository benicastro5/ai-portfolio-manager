import { useState, useRef } from 'react'
import OnboardingForm from './components/OnboardingForm'
import Dashboard from './components/Dashboard'
import LoadingScreen from './components/LoadingScreen'
import { generatePortfolio } from './api'
import './App.css'

function App() {
  const [portfolioData, setPortfolioData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleGenerate = async (profile) => {
    setLoading(true)
    setError(null)
    try {
      const data = await generatePortfolio(profile)
      setPortfolioData({ ...data, userProfile: profile })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setPortfolioData(null)
    setError(null)
  }

  const importRef = useRef()
  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (!parsed.portfolio || !parsed.userProfile) throw new Error('Invalid portfolio file')
        setPortfolioData(parsed)
        setError(null)
      } catch {
        setError('Could not load portfolio — file may be invalid or corrupted.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon">◆</span>
            <span className="brand-name">AI Portfolio Manager</span>
            <span className="brand-tag">Institutional Grade</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input ref={importRef} type="file" accept=".json" onChange={handleImport}
              style={{ display: 'none' }} />
            <button className="btn-ghost" onClick={() => importRef.current?.click()}>
              ⇪ Import Portfolio
            </button>
            {portfolioData && (
              <button className="btn-ghost" onClick={handleReset}>
                ← New Portfolio
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <LoadingScreen />
        ) : !portfolioData ? (
          <OnboardingForm onSubmit={handleGenerate} loading={loading} error={error} />
        ) : (
          <Dashboard data={portfolioData} onLoadPortfolio={(saved) => setPortfolioData(saved)} />
        ) }
      </main>

      <footer className="app-footer">
        <p className="disclaimer">
          ⚠ This platform provides educational portfolio analytics and does not constitute financial advice.
          Users should consult a qualified financial advisor before investing.
          Past performance does not guarantee future results.
        </p>
      </footer>
    </div>
  )
}

export default App
