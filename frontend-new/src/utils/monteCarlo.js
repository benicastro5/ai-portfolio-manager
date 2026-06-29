// Box-Muller transform: generates standard normal random numbers
function randn() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

/**
 * Run Monte Carlo simulation using Geometric Brownian Motion.
 * @param {number} annReturn - Annual portfolio return (e.g. 0.10 for 10%)
 * @param {number} annVol    - Annual portfolio volatility (e.g. 0.15 for 15%)
 * @param {number} initial   - Initial investment amount ($)
 * @param {number} monthly   - Monthly contribution ($)
 * @param {number} horizonYears - Investment horizon in years
 * @param {number} nSims     - Number of simulations (default 1000)
 * @returns {{ percentiles: Array, finalValues: number[], probDouble: number, median: number, goalProb: (goal) => number }}
 */
export function runMonteCarlo(annReturn, annVol, initial, monthly, horizonYears, nSims = 1000) {
  const months = Math.max(1, Math.round(horizonYears * 12))
  const muM = annReturn / 12
  const sigM = annVol / Math.sqrt(12)

  const paths = []
  for (let s = 0; s < nSims; s++) {
    let value = initial
    const path = [value]
    for (let m = 0; m < months; m++) {
      const z = randn()
      value = value * Math.exp((muM - 0.5 * sigM * sigM) + sigM * z) + monthly
      if (value < 0) value = 0
      path.push(value)
    }
    paths.push(path)
  }

  // Compute percentile bands at each month
  const percentileLevels = [5, 10, 25, 50, 75, 90, 95]
  const percentiles = []
  for (let m = 0; m <= months; m++) {
    const vals = paths.map(p => p[m]).sort((a, b) => a - b)
    const entry = { month: m, year: m / 12 }
    for (const p of percentileLevels) {
      const idx = Math.floor(vals.length * p / 100)
      entry[`p${p}`] = Math.round(vals[Math.min(idx, vals.length - 1)])
    }
    percentiles.push(entry)
  }

  const finalValues = paths.map(p => p[months]).sort((a, b) => a - b)
  const median = finalValues[Math.floor(finalValues.length / 2)]
  const probDouble = finalValues.filter(v => v >= initial * 2).length / nSims

  return {
    percentiles,
    finalValues,
    median,
    probDouble,
    goalProb: (goal) => finalValues.filter(v => v >= goal).length / nSims,
    months,
  }
}
