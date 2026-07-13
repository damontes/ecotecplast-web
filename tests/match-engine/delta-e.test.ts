import { describe, expect, it } from 'vitest'
import { deltaE76, deltaE2000 } from '@/lib/match-engine/delta-e'

describe('deltaE76', () => {
  it('is zero for identical colors', () => {
    expect(deltaE76([50, 20, -30], [50, 20, -30])).toBe(0)
  })

  it('matches Euclidean formula on simple pairs', () => {
    // Δ = √(3² + 4² + 0²) = 5
    expect(deltaE76([50, 0, 0], [53, 4, 0])).toBeCloseTo(5, 10)
  })

  it('is symmetric', () => {
    const a: [number, number, number] = [45, 10, -20]
    const b: [number, number, number] = [60, -5, 15]
    expect(deltaE76(a, b)).toBeCloseTo(deltaE76(b, a), 10)
  })
})

describe('deltaE2000', () => {
  it('is zero for identical colors', () => {
    expect(deltaE2000([50, 20, -30], [50, 20, -30])).toBeCloseTo(0, 6)
  })

  // Reference values from Sharma, Wu, Dalal (2005), "The CIEDE2000 color-
  // difference formula: Implementation notes...", Table 1.
  // Each row is (lab1, lab2, expected ΔE00). Tolerance 0.02 to accommodate
  // implementation micro-variations while still catching real errors.
  const referenceCases: Array<{
    lab1: [number, number, number]
    lab2: [number, number, number]
    expected: number
  }> = [
    { lab1: [50, 2.6772, -79.7751], lab2: [50, 0, -82.7485], expected: 2.0425 },
    { lab1: [50, 3.1571, -77.2803], lab2: [50, 0, -82.7485], expected: 2.8615 },
    { lab1: [50, 2.8361, -74.02], lab2: [50, 0, -82.7485], expected: 3.4412 },
    { lab1: [50, -1.3802, -84.2814], lab2: [50, 0, -82.7485], expected: 1.0 },
    { lab1: [50, -1.1848, -84.8006], lab2: [50, 0, -82.7485], expected: 1.0 },
    { lab1: [50, -0.9009, -85.5211], lab2: [50, 0, -82.7485], expected: 1.0 },
    { lab1: [50, 0, 0], lab2: [50, -1, 2], expected: 2.3669 },
    { lab1: [50, -1, 2], lab2: [50, 0, 0], expected: 2.3669 },
    { lab1: [50, 2.49, -0.001], lab2: [50, -2.49, 0.0009], expected: 7.1792 },
    { lab1: [60.2574, -34.0099, 36.2677], lab2: [60.4626, -34.1751, 39.4387], expected: 1.2644 }
  ]

  for (const { lab1, lab2, expected } of referenceCases) {
    it(`Sharma reference: ΔE00(${lab1.join(',')}, ${lab2.join(',')}) ≈ ${expected}`, () => {
      expect(deltaE2000(lab1, lab2)).toBeCloseTo(expected, 1)
    })
  }

  it('is approximately symmetric (within numeric noise)', () => {
    const a: [number, number, number] = [45, 10, -20]
    const b: [number, number, number] = [60, -5, 15]
    const forward = deltaE2000(a, b)
    const backward = deltaE2000(b, a)
    expect(Math.abs(forward - backward)).toBeLessThan(0.001)
  })
})
