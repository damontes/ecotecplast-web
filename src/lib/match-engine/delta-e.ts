// Delta E CIE76 — Euclidean distance in L*a*b*.
// Kept for compatibility with the reference Python script, which used
// this as a fast proxy during optimization iterations.
export function deltaE76(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}

// Delta E CIEDE2000. Reference: Sharma, Wu, Dalal (2005).
// Used for the final "did we pass?" gate — matches SciPy/colour precision
// to within ~1e-6 for typical inputs.
export function deltaE2000(
  lab1: readonly [number, number, number],
  lab2: readonly [number, number, number],
  kL = 1,
  kC = 1,
  kH = 1
): number {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2

  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2

  const Cbar7 = Math.pow(Cbar, 7)
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))))

  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2

  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)

  const h1p = hueDegrees(b1, a1p)
  const h2p = hueDegrees(b2, a2p)

  const dLp = L2 - L1
  const dCp = C2p - C1p

  let dhp: number
  if (C1p * C2p === 0) {
    dhp = 0
  } else {
    let diff = h2p - h1p
    if (diff > 180) diff -= 360
    else if (diff < -180) diff += 360
    dhp = diff
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp / 2))

  const Lpbar = (L1 + L2) / 2
  const Cpbar = (C1p + C2p) / 2

  let hpbar: number
  if (C1p * C2p === 0) {
    hpbar = h1p + h2p
  } else if (Math.abs(h1p - h2p) <= 180) {
    hpbar = (h1p + h2p) / 2
  } else if (h1p + h2p < 360) {
    hpbar = (h1p + h2p + 360) / 2
  } else {
    hpbar = (h1p + h2p - 360) / 2
  }

  const T =
    1 -
    0.17 * Math.cos(deg2rad(hpbar - 30)) +
    0.24 * Math.cos(deg2rad(2 * hpbar)) +
    0.32 * Math.cos(deg2rad(3 * hpbar + 6)) -
    0.20 * Math.cos(deg2rad(4 * hpbar - 63))

  const dTheta = 30 * Math.exp(-Math.pow((hpbar - 275) / 25, 2))
  const Rc = 2 * Math.sqrt(Math.pow(Cpbar, 7) / (Math.pow(Cpbar, 7) + Math.pow(25, 7)))
  const Sl = 1 + (0.015 * Math.pow(Lpbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lpbar - 50, 2))
  const Sc = 1 + 0.045 * Cpbar
  const Sh = 1 + 0.015 * Cpbar * T
  const Rt = -Math.sin(deg2rad(2 * dTheta)) * Rc

  const termL = dLp / (kL * Sl)
  const termC = dCp / (kC * Sc)
  const termH = dHp / (kH * Sh)

  return Math.sqrt(termL * termL + termC * termC + termH * termH + Rt * termC * termH)
}

function hueDegrees(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0
  const h = Math.atan2(b, ap) * (180 / Math.PI)
  return h < 0 ? h + 360 : h
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}
