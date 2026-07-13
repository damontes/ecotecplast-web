import { describe, expect, it } from 'vitest'
import { polyfit2, polyval2 } from '@/lib/match-engine/polyfit'

describe('polyfit2', () => {
  it('exact-interpolates a known quadratic', () => {
    // y = 2x² - 3x + 1
    const xs = [0, 1, 2]
    const ys = xs.map((x) => 2 * x * x - 3 * x + 1)
    const [a, b, c] = polyfit2(xs, ys)
    expect(a).toBeCloseTo(2, 10)
    expect(b).toBeCloseTo(-3, 10)
    expect(c).toBeCloseTo(1, 10)
  })

  it('recovers the linear case (a = 0)', () => {
    // y = 5x + 2 at 3 points
    const xs = [0.5, 1.0, 2.0]
    const ys = xs.map((x) => 5 * x + 2)
    const [a, b, c] = polyfit2(xs, ys)
    expect(a).toBeCloseTo(0, 10)
    expect(b).toBeCloseTo(5, 10)
    expect(c).toBeCloseTo(2, 10)
  })

  it('interpolates the seed Blue MB L-channel calibration', () => {
    // Values from supabase/seed.sql, Blue MB, L shifts.
    // 0.5% → -8, 1.0% → -15, 2.0% → -30
    const coeffs = polyfit2([0.5, 1.0, 2.0], [-8, -15, -30])
    expect(polyval2(coeffs, 0.5)).toBeCloseTo(-8, 6)
    expect(polyval2(coeffs, 1.0)).toBeCloseTo(-15, 6)
    expect(polyval2(coeffs, 2.0)).toBeCloseTo(-30, 6)
  })

  it('throws on fewer than 3 points', () => {
    expect(() => polyfit2([0, 1], [0, 1])).toThrow()
  })

  it('throws on mismatched x/y lengths', () => {
    expect(() => polyfit2([0, 1, 2], [0, 1])).toThrow()
  })
})

describe('polyval2', () => {
  it('matches manual calculation', () => {
    // 3x² + 2x + 1 at x = 2 → 12 + 4 + 1 = 17
    expect(polyval2([3, 2, 1], 2)).toBeCloseTo(17, 10)
  })

  it('returns c at x = 0', () => {
    expect(polyval2([5, -2, 7], 0)).toBe(7)
  })
})
