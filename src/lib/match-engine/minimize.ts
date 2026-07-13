// Nelder-Mead simplex optimizer for low-dimensional bounded problems.
// Suits the color-match objective (n = 3–8, non-smooth ΔE2000 surface)
// better than gradient methods, which would need numerical Jacobians of
// the ΔE2000 kernel. Bounds and the linear-sum inequality are enforced
// via a soft quadratic penalty in `wrap`.

export interface MinimizeOptions {
  bounds: Array<[number, number]>
  sumMax?: number
  maxIter?: number
  tol?: number
  // Fixed seed → same input yields same output. Set to a non-zero value
  // for deterministic runs; leave undefined for time-seeded (stochastic).
  seed?: number
  // Extra restart seeds fed on top of the built-in structured starts
  // (zero-vector, uniform split, one-hot-per-dim). Defaults to 6.
  extraRandomRestarts?: number
}

export interface MinimizeResult {
  x: number[]
  fun: number
  iterations: number
}

// Small, fast, deterministic RNG (mulberry32). We use it so that two calls
// with the same target/base/inventory produce the same recipe.
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function minimizeSum(
  objective: (x: number[]) => number,
  x0: number[],
  opts: MinimizeOptions
): MinimizeResult {
  const {
    bounds,
    sumMax = Infinity,
    maxIter = 800,
    tol = 1e-8,
    seed = 1,
    extraRandomRestarts = 6
  } = opts

  const n = x0.length
  const rand = makeRng(seed)

  const wrap = (x: number[]): number => {
    let penalty = 0
    for (let i = 0; i < x.length; i++) {
      const [lo, hi] = bounds[i]
      if (x[i] < lo) penalty += 1e4 * (lo - x[i]) ** 2
      else if (x[i] > hi) penalty += 1e4 * (x[i] - hi) ** 2
    }
    const s = x.reduce((a, b) => a + b, 0)
    if (s > sumMax) penalty += 1e4 * (s - sumMax) ** 2
    return objective(x) + penalty
  }

  // Structured start points: exhaustive coverage of the "obvious" recipes,
  // so we don't rely on luck to explore them.
  const seeds: number[][] = []
  seeds.push(new Array(n).fill(0)) // zero recipe (base resin alone)
  seeds.push(x0.slice()) // caller's initial guess
  const uniform = Math.min(sumMax / n, bounds[0][1])
  seeds.push(new Array(n).fill(uniform)) // equal split of budget
  // One-hot at the full budget (helps find "all-in on one MB" recipes).
  for (let i = 0; i < n; i++) {
    const s = new Array(n).fill(0)
    s[i] = Math.min(sumMax, bounds[i][1])
    seeds.push(s)
  }
  // One-hot at the calibration anchor concentrations (0.5, 1.0, 2.0).
  // Nelder-Mead contracts locally, so starting near a canonical single-MB
  // recipe converges much faster than walking down from the full-budget
  // corner. Cheap: n × 3 extra starts.
  const anchors = [0.5, 1.0, 2.0]
  for (let i = 0; i < n; i++) {
    for (const anchor of anchors) {
      const cap = Math.min(sumMax, bounds[i][1])
      if (anchor > cap) continue
      const s = new Array(n).fill(0)
      s[i] = anchor
      seeds.push(s)
    }
  }
  // Two-hot: for every pair, split budget 50/50. Catches most binary
  // recipes (typical case in color matching: 2 pigments).
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = new Array(n).fill(0)
      const half = Math.min(sumMax / 2, bounds[i][1], bounds[j][1])
      s[i] = half
      s[j] = half
      seeds.push(s)
    }
  }
  // Random restarts on top of the structured ones.
  for (let r = 0; r < extraRandomRestarts; r++) {
    seeds.push(
      x0.map((_, i) => {
        const [lo, hi] = bounds[i]
        return lo + rand() * Math.min(hi - lo, sumMax / n)
      })
    )
  }

  let best: MinimizeResult = {
    x: seeds[0].slice(),
    fun: objective(seeds[0]),
    iterations: 0
  }

  for (const seedPoint of seeds) {
    const result = nelderMead(wrap, seedPoint, maxIter, tol)
    const clamped = result.x.map((v, i) => {
      const [lo, hi] = bounds[i]
      return Math.max(lo, Math.min(hi, v))
    })
    const s = clamped.reduce((a, b) => a + b, 0)
    if (s > sumMax && s > 0) {
      const scale = sumMax / s
      for (let i = 0; i < clamped.length; i++) clamped[i] *= scale
    }
    const trueFun = objective(clamped)
    if (trueFun < best.fun) {
      best = { x: clamped, fun: trueFun, iterations: result.iterations }
    }
  }

  return best
}

function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  maxIter: number,
  tol: number
): MinimizeResult {
  const n = x0.length
  const alpha = 1
  const gamma = 2
  const rho = 0.5
  const sigma = 0.5

  const simplex: Array<{ x: number[]; f: number }> = []
  simplex.push({ x: x0.slice(), f: f(x0) })
  for (let i = 0; i < n; i++) {
    const x = x0.slice()
    // Larger initial spread than before — helps escape flat regions
    // around the zero-recipe seed.
    const step = x0[i] === 0 ? 0.4 : Math.max(0.1, 0.2 * Math.abs(x0[i]))
    x[i] += step
    simplex.push({ x, f: f(x) })
  }

  let iter = 0
  for (; iter < maxIter; iter++) {
    simplex.sort((a, b) => a.f - b.f)

    const spread = simplex[n].f - simplex[0].f
    if (spread < tol) break

    const centroid = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j]
    }
    for (let j = 0; j < n; j++) centroid[j] /= n

    const worst = simplex[n]

    const reflected = centroid.map((c, j) => c + alpha * (c - worst.x[j]))
    const fR = f(reflected)

    if (fR < simplex[0].f) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c))
      const fE = f(expanded)
      simplex[n] = fE < fR ? { x: expanded, f: fE } : { x: reflected, f: fR }
      continue
    }

    if (fR < simplex[n - 1].f) {
      simplex[n] = { x: reflected, f: fR }
      continue
    }

    const useOutside = fR < worst.f
    const contracted = useOutside
      ? centroid.map((c, j) => c + rho * (reflected[j] - c))
      : centroid.map((c, j) => c + rho * (worst.x[j] - c))
    const fC = f(contracted)

    if (fC < (useOutside ? fR : worst.f)) {
      simplex[n] = { x: contracted, f: fC }
      continue
    }

    for (let i = 1; i <= n; i++) {
      const shrunk = simplex[0].x.map((b, j) => b + sigma * (simplex[i].x[j] - b))
      simplex[i] = { x: shrunk, f: f(shrunk) }
    }
  }

  simplex.sort((a, b) => a.f - b.f)
  return { x: simplex[0].x, fun: simplex[0].f, iterations: iter }
}
