// 2nd-degree polynomial fit via normal equations.
// Mirrors numpy.polyfit(x, y, 2). Returns coefficients [a, b, c] where
// y ≈ a*x² + b*x + c (same ordering as numpy: highest degree first).
//
// For n=3 with distinct x, the system is exact (interpolation) — no
// residual error, matching numpy's behaviour.
export function polyfit2(xs: readonly number[], ys: readonly number[]): [number, number, number] {
  if (xs.length !== ys.length || xs.length < 3) {
    throw new Error('polyfit2 requires at least 3 points and matching x/y lengths')
  }

  // Build A^T A (3x3) and A^T y (3x1) where A rows are [x², x, 1].
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0
  let ty0 = 0, ty1 = 0, ty2 = 0

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]
    const y = ys[i]
    const x2 = x * x
    s0 += 1
    s1 += x
    s2 += x2
    s3 += x2 * x
    s4 += x2 * x2
    ty0 += y * x2
    ty1 += y * x
    ty2 += y
  }

  // Solve [[s4 s3 s2],[s3 s2 s1],[s2 s1 s0]] · [a b c]ᵀ = [ty0 ty1 ty2]ᵀ
  const m: number[][] = [
    [s4, s3, s2, ty0],
    [s3, s2, s1, ty1],
    [s2, s1, s0, ty2]
  ]

  // Gaussian elimination with partial pivoting.
  for (let i = 0; i < 3; i++) {
    let pivot = i
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r
    }
    if (pivot !== i) [m[i], m[pivot]] = [m[pivot], m[i]]

    const div = m[i][i]
    if (Math.abs(div) < 1e-12) throw new Error('polyfit2: singular system')
    for (let c = i; c < 4; c++) m[i][c] /= div

    for (let r = 0; r < 3; r++) {
      if (r === i) continue
      const factor = m[r][i]
      for (let c = i; c < 4; c++) m[r][c] -= factor * m[i][c]
    }
  }

  return [m[0][3], m[1][3], m[2][3]]
}

// numpy.polyval equivalent for the [a, b, c] shape returned above.
export function polyval2(coeffs: readonly [number, number, number], x: number): number {
  return coeffs[0] * x * x + coeffs[1] * x + coeffs[2]
}
